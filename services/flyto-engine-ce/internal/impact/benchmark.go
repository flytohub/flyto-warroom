package impact

// benchmark.go — loadable breach-cost benchmark catalog. Reads
// config/breach_benchmarks.yaml once at boot; consumers receive
// a *Catalog they can pass into Compute(). Falls back to
// hardcoded 2024 IBM figures when the file is missing so dev /
// test deployments work without the config artefact.

import (
	"fmt"
	"os"
	"strings"
	"sync"

	"gopkg.in/yaml.v3"
)

// Catalog holds the per-sector breach-cost benchmarks. Stamped
// with report_year + global_average so the methodology trail in
// every Estimate can disclose its source year.
type Catalog struct {
	ReportYear       int           `yaml:"report_year"`
	GlobalAverageUSD float64       `yaml:"global_average_usd"`
	Sectors          []SectorEntry `yaml:"sectors"`

	// indexed by canonical key + alias for O(1) lookup.
	lookup map[string]*SectorEntry
}

type SectorEntry struct {
	Key            string   `yaml:"key"`
	Label          string   `yaml:"label"`
	Aliases        []string `yaml:"aliases"`
	IncidentAvgUSD float64  `yaml:"incident_avg_usd"`
	PerRecordUSD   float64  `yaml:"per_record_usd"`
}

// Load parses the YAML at path. Empty path or a missing file
// returns the hardcoded default catalog — engine boot stays
// non-fatal so a forgotten config file doesn't down production.
func Load(path string) (*Catalog, error) {
	if path == "" {
		return defaultCatalog(), nil
	}
	b, err := os.ReadFile(path)
	if err != nil {
		if os.IsNotExist(err) {
			// Soft fallback — log via caller; engine continues
			// with the embedded defaults.
			return defaultCatalog(), nil
		}
		return nil, fmt.Errorf("breach benchmark: read %s: %w", path, err)
	}
	var c Catalog
	if err := yaml.Unmarshal(b, &c); err != nil {
		return nil, fmt.Errorf("breach benchmark: parse %s: %w", path, err)
	}
	c.buildIndex()
	if c.GlobalAverageUSD <= 0 {
		c.GlobalAverageUSD = 4_880_000
	}
	if c.ReportYear == 0 {
		c.ReportYear = 2024
	}
	return &c, nil
}

func (c *Catalog) buildIndex() {
	c.lookup = map[string]*SectorEntry{}
	for i := range c.Sectors {
		s := &c.Sectors[i]
		c.lookup[strings.ToLower(s.Key)] = s
		for _, a := range s.Aliases {
			c.lookup[strings.ToLower(a)] = s
		}
	}
}

// Resolve returns (incident_avg, per_record) for the requested
// sector. Falls back to the global average when the sector is
// unknown — the caller's confidence band widens to reflect that.
func (c *Catalog) Resolve(sector string) (float64, float64, string, string) {
	if c.lookup == nil {
		c.buildIndex()
	}
	key := strings.ToLower(strings.TrimSpace(sector))
	if s, ok := c.lookup[key]; ok {
		return s.IncidentAvgUSD, s.PerRecordUSD, s.Label, fmt.Sprintf("IBM %d", c.ReportYear)
	}
	// Global fallback — per-record estimate at industry mean
	// per IBM 2024 (~$165). Don't fabricate sector data we don't
	// have.
	return c.GlobalAverageUSD, 165, "Global average", fmt.Sprintf("IBM %d (global avg)", c.ReportYear)
}

func defaultCatalog() *Catalog {
	c := &Catalog{
		ReportYear:       2024,
		GlobalAverageUSD: 4_880_000,
		Sectors: []SectorEntry{
			{Key: "healthcare", Label: "Healthcare / Life sciences", IncidentAvgUSD: 9_770_000, PerRecordUSD: 408},
			{Key: "finance", Label: "Financial services", Aliases: []string{"financial"}, IncidentAvgUSD: 6_080_000, PerRecordUSD: 246},
			{Key: "industrial", Label: "Industrial", Aliases: []string{"energy", "manufacturing"}, IncidentAvgUSD: 5_560_000, PerRecordUSD: 199},
			{Key: "saas", Label: "Tech / SaaS", Aliases: []string{"tech", "technology", "software"}, IncidentAvgUSD: 5_450_000, PerRecordUSD: 191},
			{Key: "retail", Label: "Retail", Aliases: []string{"ecommerce", "consumer"}, IncidentAvgUSD: 3_480_000, PerRecordUSD: 148},
			{Key: "education", Label: "Education", Aliases: []string{"academia"}, IncidentAvgUSD: 3_650_000, PerRecordUSD: 152},
			{Key: "gov", Label: "Public sector", Aliases: []string{"government", "public"}, IncidentAvgUSD: 2_550_000, PerRecordUSD: 124},
		},
	}
	c.buildIndex()
	return c
}

// activeCatalog is the process-wide pointer the Compute() shortcut
// uses when no explicit catalog is threaded through. cmd/server
// sets it at boot from the YAML. Concurrency-safe via sync.Once
// for set, atomic-ish via mutex for get.
var (
	catMu     sync.RWMutex
	activeCat *Catalog
)

// SetActiveCatalog wires the loaded catalog into the package-level
// default used by Compute(). Called from cmd/server at boot.
func SetActiveCatalog(c *Catalog) {
	catMu.Lock()
	defer catMu.Unlock()
	activeCat = c
}

func getActiveCatalog() *Catalog {
	catMu.RLock()
	if activeCat != nil {
		defer catMu.RUnlock()
		return activeCat
	}
	catMu.RUnlock()
	// Lazy init the fallback so tests work without the boot hook.
	c := defaultCatalog()
	SetActiveCatalog(c)
	return c
}
