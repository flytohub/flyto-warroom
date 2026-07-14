package modulecatalog

import (
	"slices"
	"strings"
	"testing"
)

func TestLoadEmbeddedCatalog(t *testing.T) {
	c, err := LoadEmbedded()
	if err != nil {
		t.Fatalf("LoadEmbedded: %v", err)
	}
	if len(c.Modules) == 0 {
		t.Fatal("expected modules")
	}
	if got := c.Canonical("code_audit"); got != "code" {
		t.Fatalf("code_audit canonical = %q, want code", got)
	}
	if got := c.Canonical("ctem"); got != "external" {
		t.Fatalf("ctem canonical = %q, want external", got)
	}
	if got := c.Canonical("mcp"); got != "ai_gate" {
		t.Fatalf("mcp canonical = %q, want ai_gate", got)
	}
	if _, ok := c.Module("product_verify"); !ok {
		t.Fatal("product_verify alias should resolve")
	}
}

func TestEmbeddedCatalogPinsModuleBillingBoundaries(t *testing.T) {
	c, err := LoadEmbedded()
	if err != nil {
		t.Fatalf("LoadEmbedded: %v", err)
	}
	for _, m := range c.Modules {
		if m.Billing == "" {
			t.Fatalf("module %q must declare billing boundary", m.Key)
		}
	}

	ceIncluded := []string{"core", "code", "external", "cloud", "container", "vuln_mgmt", "product_verification", "autofix", "reporting"}
	for _, key := range ceIncluded {
		m, ok := c.Module(key)
		if !ok {
			t.Fatalf("missing CE module %q", key)
		}
		if m.Billing != "ce_included" {
			t.Fatalf("module %q billing = %q, want ce_included", key, m.Billing)
		}
	}

	enterpriseAddons := []string{"dark_web", "identity", "red_team", "ai_gate"}
	for _, key := range enterpriseAddons {
		m, ok := c.Module(key)
		if !ok {
			t.Fatalf("missing enterprise module %q", key)
		}
		if m.Billing != "enterprise_addon" {
			t.Fatalf("module %q billing = %q, want enterprise_addon", key, m.Billing)
		}
	}

	var enterpriseOnly []string
	for _, m := range c.Modules {
		if m.Billing == "enterprise_only" {
			enterpriseOnly = append(enterpriseOnly, m.Key)
		}
	}
	if slices.Contains(enterpriseOnly, "code") || slices.Contains(enterpriseOnly, "external") || slices.Contains(enterpriseOnly, "autofix") {
		t.Fatalf("CE core modules must not become enterprise_only: %v", enterpriseOnly)
	}
}

func TestEmbeddedCatalogPinsOpenCoreUpgradeBoundaries(t *testing.T) {
	c, err := LoadEmbedded()
	if err != nil {
		t.Fatalf("LoadEmbedded: %v", err)
	}

	ceIncluded := 0
	enterpriseGated := 0
	for _, m := range c.Modules {
		if strings.TrimSpace(m.CEValue) == "" {
			t.Fatalf("module %q missing ce_value", m.Key)
		}
		if strings.TrimSpace(m.EnterpriseValue) == "" {
			t.Fatalf("module %q missing enterprise_value", m.Key)
		}
		if strings.TrimSpace(m.UpgradeTrigger) == "" {
			t.Fatalf("module %q missing upgrade_trigger", m.Key)
		}

		switch m.Billing {
		case "ce_included":
			ceIncluded++
			if len(m.Pages) == 0 && len(m.Permissions) == 0 && len(m.Features) == 0 {
				t.Fatalf("CE module %q has no pages, permissions, or features", m.Key)
			}
		case "enterprise_addon", "enterprise_only":
			enterpriseGated++
			if len(m.GatingFeatures) == 0 && len(m.CommercialActions) == 0 && len(m.Providers) == 0 {
				t.Fatalf("enterprise module %q has no gate, commercial action, or provider", m.Key)
			}
		default:
			t.Fatalf("module %q has unhandled billing boundary %q", m.Key, m.Billing)
		}
	}
	if ceIncluded < 8 {
		t.Fatalf("CE must stay useful; got only %d ce_included modules", ceIncluded)
	}
	if enterpriseGated < 4 {
		t.Fatalf("Enterprise must keep meaningful paid gates; got only %d gated modules", enterpriseGated)
	}
}
