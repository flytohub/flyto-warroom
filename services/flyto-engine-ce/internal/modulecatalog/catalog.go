package modulecatalog

import (
	"embed"
	"errors"
	"fmt"
	"sort"
	"strings"
	"sync"

	"gopkg.in/yaml.v3"
)

//go:embed catalog.yaml
var catalogFS embed.FS

type Provider struct {
	ID    string `json:"id" yaml:"id"`
	Label string `json:"label" yaml:"label"`
}

type Module struct {
	Key string `json:"key" yaml:"key"`
	// DisplayName/Description are English i18n FALLBACKS — not duplicates of
	// TitleKey/DescriptionKey. The backend never localizes; it passes these
	// through so the frontend can render a non-blank label when the i18n CDN
	// is slow or a key is missing. TitleKey/DescriptionKey are the preferred
	// localized lookups.
	DisplayName      string   `json:"display_name" yaml:"display_name"`
	TitleKey         string   `json:"title_key,omitempty" yaml:"title_key"`
	Description      string   `json:"description" yaml:"description"`
	DescriptionKey   string   `json:"description_key,omitempty" yaml:"description_key"`
	Category         string   `json:"category" yaml:"category"`
	RiskLevel        string   `json:"risk_level" yaml:"risk_level"`
	Status           string   `json:"status" yaml:"status"`
	LandingPath      string   `json:"landing_path,omitempty" yaml:"landing_path"`
	SourceSelectable bool     `json:"source_selectable" yaml:"source_selectable"`
	FlytoNative      bool     `json:"flyto_native" yaml:"flyto_native"`
	DefaultEnabled   bool     `json:"default_enabled" yaml:"default_enabled"`
	CrossCutting     bool     `json:"cross_cutting,omitempty" yaml:"cross_cutting"`
	Aliases          []string `json:"aliases,omitempty" yaml:"aliases"`
	Requires         []string `json:"requires,omitempty" yaml:"requires"`
	// Features = capability GRANTS unlocked when this module is enabled.
	Features []string `json:"features,omitempty" yaml:"features"`
	// GatingFeatures = entitlement GATE: an org missing any of these cannot
	// enable the module (moduleEntitled checks them). Distinct from Features —
	// a module may grant many capabilities but gate on only a couple.
	GatingFeatures    []string   `json:"gating_features,omitempty" yaml:"gating_features"`
	Permissions       []string   `json:"permissions,omitempty" yaml:"permissions"`
	CommercialActions []string   `json:"commercial_actions,omitempty" yaml:"commercial_actions"`
	Pages             []string   `json:"pages,omitempty" yaml:"pages"`
	Navigation        []string   `json:"navigation,omitempty" yaml:"navigation"`
	Providers         []Provider `json:"providers,omitempty" yaml:"providers"`
	// Billing tier for this module. This is the product split source of truth:
	// CE-included modules must stay useful locally; enterprise add-ons may show
	// locked states and fail closed until a license/bridge/airgap entitlement
	// unlocks execution.
	Billing string `json:"billing,omitempty" yaml:"billing"`
	// CEValue is the user-visible value this module must provide without a
	// Flyto2 Cloud bridge. EnterpriseValue and UpgradeTrigger describe the
	// paid path without exposing private implementation details.
	CEValue         string `json:"ce_value,omitempty" yaml:"ce_value"`
	EnterpriseValue string `json:"enterprise_value,omitempty" yaml:"enterprise_value"`
	UpgradeTrigger  string `json:"upgrade_trigger,omitempty" yaml:"upgrade_trigger"`
}

type Catalog struct {
	Modules []Module `json:"modules" yaml:"modules"`

	byKey map[string]*Module
	alias map[string]string
}

var (
	embeddedOnce sync.Once
	embedded     *Catalog
	embeddedErr  error
)

func LoadEmbedded() (*Catalog, error) {
	embeddedOnce.Do(func() {
		b, err := catalogFS.ReadFile("catalog.yaml")
		if err != nil {
			embeddedErr = err
			return
		}
		embedded, embeddedErr = Load(b)
	})
	return embedded, embeddedErr
}

func Load(b []byte) (*Catalog, error) {
	var c Catalog
	if err := yaml.Unmarshal(b, &c); err != nil {
		return nil, err
	}
	if err := c.build(); err != nil {
		return nil, err
	}
	return &c, nil
}

func (c *Catalog) build() error {
	if c == nil {
		return errors.New("module catalog: nil")
	}
	c.byKey = map[string]*Module{}
	c.alias = map[string]string{}
	for i := range c.Modules {
		m := &c.Modules[i]
		m.Key = strings.TrimSpace(m.Key)
		if m.Key == "" {
			return errors.New("module catalog: module key required")
		}
		if !validBillingTier(m.Billing) {
			return fmt.Errorf("module catalog: module %q has invalid billing tier %q", m.Key, m.Billing)
		}
		if err := validateEditionBoundary(m); err != nil {
			return err
		}
		if _, dup := c.byKey[m.Key]; dup {
			return fmt.Errorf("module catalog: duplicate module %q", m.Key)
		}
		c.byKey[m.Key] = m
		c.alias[m.Key] = m.Key
		for _, alias := range m.Aliases {
			alias = strings.TrimSpace(alias)
			if alias == "" {
				continue
			}
			if existing, dup := c.alias[alias]; dup && existing != m.Key {
				return fmt.Errorf("module catalog: alias %q maps to both %q and %q", alias, existing, m.Key)
			}
			c.alias[alias] = m.Key
		}
	}
	for _, m := range c.Modules {
		for _, dep := range m.Requires {
			if _, ok := c.byKey[c.Canonical(dep)]; !ok {
				return fmt.Errorf("module catalog: module %q requires unknown module %q", m.Key, dep)
			}
		}
	}
	return nil
}

func validateEditionBoundary(m *Module) error {
	if strings.TrimSpace(m.CEValue) == "" {
		return fmt.Errorf("module catalog: module %q must declare ce_value", m.Key)
	}
	if strings.TrimSpace(m.EnterpriseValue) == "" {
		return fmt.Errorf("module catalog: module %q must declare enterprise_value", m.Key)
	}
	if strings.TrimSpace(m.UpgradeTrigger) == "" {
		return fmt.Errorf("module catalog: module %q must declare upgrade_trigger", m.Key)
	}
	if m.Billing == "enterprise_addon" || m.Billing == "enterprise_only" {
		hasGate := len(m.GatingFeatures) > 0 || len(m.CommercialActions) > 0 || len(m.Providers) > 0
		if !hasGate {
			return fmt.Errorf("module catalog: enterprise module %q must declare at least one gate, commercial action, or provider", m.Key)
		}
	}
	return nil
}

func validBillingTier(value string) bool {
	switch strings.TrimSpace(value) {
	case "ce_included", "enterprise_addon", "enterprise_only":
		return true
	default:
		return false
	}
}

func (c *Catalog) Canonical(key string) string {
	key = strings.TrimSpace(key)
	if c == nil || key == "" {
		return key
	}
	if c.alias == nil {
		_ = c.build()
	}
	if canonical, ok := c.alias[key]; ok {
		return canonical
	}
	return key
}

func (c *Catalog) Module(key string) (*Module, bool) {
	if c == nil {
		return nil, false
	}
	if c.byKey == nil {
		_ = c.build()
	}
	m, ok := c.byKey[c.Canonical(key)]
	return m, ok
}

func (c *Catalog) LookupKeys(key string) []string {
	key = strings.TrimSpace(key)
	if c == nil || key == "" {
		return []string{key}
	}
	m, ok := c.Module(key)
	if !ok {
		return []string{key}
	}
	seen := map[string]struct{}{m.Key: {}}
	out := []string{m.Key}
	for _, alias := range m.Aliases {
		alias = strings.TrimSpace(alias)
		if alias == "" {
			continue
		}
		if _, dup := seen[alias]; dup {
			continue
		}
		seen[alias] = struct{}{}
		out = append(out, alias)
	}
	return out
}

func (c *Catalog) Normalize(keys []string) []string {
	if c == nil {
		return append([]string(nil), keys...)
	}
	seen := map[string]struct{}{}
	out := make([]string, 0, len(keys))
	for _, key := range keys {
		key = c.Canonical(key)
		if key == "" {
			continue
		}
		if _, dup := seen[key]; dup {
			continue
		}
		seen[key] = struct{}{}
		out = append(out, key)
	}
	sort.Strings(out)
	return out
}
