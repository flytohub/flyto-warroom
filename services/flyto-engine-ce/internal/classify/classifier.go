// Package classify implements rule-based resource classification.
//
// Rules are loaded from config/classification/rules.yaml. Each rule has a Type
// (filename_pattern, mime_category, extension, content_keyword, default) and
// produces a Category + optional Subcategory + Confidence when it matches.
//
// The classifier evaluates rules top-to-bottom; first match wins.
package classify

import (
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"strings"

	"gopkg.in/yaml.v3"
)

const (
	TypeFilenamePattern = "filename_pattern"
	TypeMIMECategory    = "mime_category"
	TypeExtension       = "extension"
	TypeContentKeyword  = "content_keyword"
	TypeDefault         = "default"
)

// Rule is the deserialized form of one entry in rules.yaml.
type Rule struct {
	Name        string   `yaml:"name"`
	Type        string   `yaml:"type"`
	Pattern     string   `yaml:"pattern"`
	Extensions  []string `yaml:"extensions"`
	Category    string   `yaml:"category"`
	Subcategory string   `yaml:"subcategory"`
	Confidence  float64  `yaml:"confidence"`
	MinMatches  int      `yaml:"min_matches"` // for content_keyword
}

// Result is what Classify returns.
type Result struct {
	Category    string
	Subcategory string
	Confidence  float64
	RuleName    string
}

// Input bundles everything the classifier looks at.
type Input struct {
	Filename string
	MIMEType string
	Content  string // extracted text, may be empty
}

// Classifier holds compiled rules ready for matching. Construct via Load or New.
type Classifier struct {
	rules []compiledRule
}

type compiledRule struct {
	rule       Rule
	filename   *regexp.Regexp // nil unless TypeFilenamePattern
	content    *regexp.Regexp // nil unless TypeContentKeyword
	mimeRegex  *regexp.Regexp // nil unless TypeMIMECategory and pattern contains | or special chars
	extensions map[string]struct{}
}

// rulesFile is the top-level YAML schema.
type rulesFile struct {
	Version string `yaml:"version"`
	Rules   []Rule `yaml:"rules"`
}

// Load reads rules from a YAML file and compiles them.
func Load(path string) (*Classifier, error) {
	raw, err := os.ReadFile(path)
	if err != nil {
		return nil, fmt.Errorf("classify: read %s: %w", path, err)
	}
	var f rulesFile
	if err := yaml.Unmarshal(raw, &f); err != nil {
		return nil, fmt.Errorf("classify: parse %s: %w", path, err)
	}
	return New(f.Rules)
}

// New builds a Classifier from in-memory rules. Rules are compiled in order.
func New(rules []Rule) (*Classifier, error) {
	if len(rules) == 0 {
		return nil, errors.New("classify: no rules supplied")
	}
	out := make([]compiledRule, 0, len(rules))
	for i, r := range rules {
		cr, err := compile(r)
		if err != nil {
			return nil, fmt.Errorf("classify: rule %d (%s): %w", i, r.Name, err)
		}
		out = append(out, cr)
	}
	return &Classifier{rules: out}, nil
}

func compile(r Rule) (compiledRule, error) {
	cr := compiledRule{rule: r}
	switch r.Type {
	case TypeFilenamePattern:
		if r.Pattern == "" {
			return cr, errors.New("filename_pattern requires pattern")
		}
		re, err := regexp.Compile(r.Pattern)
		if err != nil {
			return cr, fmt.Errorf("invalid pattern: %w", err)
		}
		cr.filename = re
	case TypeContentKeyword:
		if r.Pattern == "" {
			return cr, errors.New("content_keyword requires pattern")
		}
		re, err := regexp.Compile("(?i)" + r.Pattern)
		if err != nil {
			return cr, fmt.Errorf("invalid pattern: %w", err)
		}
		cr.content = re
	case TypeMIMECategory:
		if r.Pattern == "" {
			return cr, errors.New("mime_category requires pattern")
		}
		// MIME pattern may be a literal prefix ("image/") or a regex with |.
		if strings.ContainsAny(r.Pattern, "|()[]") {
			re, err := regexp.Compile(r.Pattern)
			if err != nil {
				return cr, fmt.Errorf("invalid mime regex: %w", err)
			}
			cr.mimeRegex = re
		}
	case TypeExtension:
		if len(r.Extensions) == 0 {
			return cr, errors.New("extension rule requires extensions")
		}
		cr.extensions = make(map[string]struct{}, len(r.Extensions))
		for _, e := range r.Extensions {
			cr.extensions[strings.ToLower(strings.TrimPrefix(e, "."))] = struct{}{}
		}
	case TypeDefault:
		// no-op
	default:
		return cr, fmt.Errorf("unknown rule type %q", r.Type)
	}
	if r.Confidence < 0 || r.Confidence > 1 {
		return cr, fmt.Errorf("confidence must be in [0,1], got %v", r.Confidence)
	}
	return cr, nil
}

// Classify runs the input against the compiled rules and returns the first
// match. If no rule matches, returns the default rule (if any) or
// {Category: "uncategorized", Confidence: 0.10}.
func (c *Classifier) Classify(in Input) Result {
	ext := strings.ToLower(strings.TrimPrefix(filepath.Ext(in.Filename), "."))

	for _, cr := range c.rules {
		switch cr.rule.Type {
		case TypeFilenamePattern:
			if cr.filename.MatchString(in.Filename) {
				return matchResult(cr.rule)
			}
		case TypeMIMECategory:
			if in.MIMEType == "" {
				continue
			}
			if cr.mimeRegex != nil {
				if cr.mimeRegex.MatchString(in.MIMEType) {
					return matchResult(cr.rule)
				}
			} else if strings.HasPrefix(in.MIMEType, cr.rule.Pattern) {
				return matchResult(cr.rule)
			}
		case TypeExtension:
			if ext == "" {
				continue
			}
			if _, ok := cr.extensions[ext]; ok {
				return matchResult(cr.rule)
			}
		case TypeContentKeyword:
			if in.Content == "" {
				continue
			}
			min := cr.rule.MinMatches
			if min < 1 {
				min = 1
			}
			matches := cr.content.FindAllStringIndex(in.Content, min)
			if len(matches) >= min {
				return matchResult(cr.rule)
			}
		case TypeDefault:
			return matchResult(cr.rule)
		}
	}
	return Result{
		Category:   "uncategorized",
		Confidence: 0.10,
		RuleName:   "fallback",
	}
}

func matchResult(r Rule) Result {
	return Result{
		Category:    r.Category,
		Subcategory: r.Subcategory,
		Confidence:  r.Confidence,
		RuleName:    r.Name,
	}
}

// Rules returns a copy of the loaded rules (read-only view).
func (c *Classifier) Rules() []Rule {
	out := make([]Rule, len(c.rules))
	for i, cr := range c.rules {
		out[i] = cr.rule
	}
	return out
}
