package resource

import (
	"fmt"
	"path/filepath"
	"regexp"
	"strings"
	"time"
	"unicode"
)

var (
	unsafeChars    = regexp.MustCompile(`[\\/:*?"<>|]`)
	multiHyphens   = regexp.MustCompile(`-{2,}`)
	multiUnders    = regexp.MustCompile(`_{2,}`)
	leadTrailPunct = regexp.MustCompile(`^[-_]+|[-_]+$`)
	controlChars   = regexp.MustCompile(`[\x00-\x1f\x7f]`)
)

// fullwidth → ASCII replacements
var fullwidthMap = map[rune]rune{
	'\uff01': '!', '\uff08': '(', '\uff09': ')', '\uff0c': ',',
	'\u3002': '.', '\uff1a': ':', '\uff1b': ';', '\u3001': ',', '\uff1f': '?',
}

// NormalizeFilename cleans a filename for safe storage
func NormalizeFilename(raw string) string {
	name := strings.TrimSpace(raw)
	ext := strings.ToLower(filepath.Ext(name))
	base := name
	if ext != "" {
		base = name[:len(name)-len(ext)]
	}

	// Replace fullwidth punctuation
	var sb strings.Builder
	for _, r := range base {
		if repl, ok := fullwidthMap[r]; ok {
			sb.WriteRune(repl)
		} else if !unicode.IsControl(r) {
			sb.WriteRune(r)
		}
	}
	base = sb.String()

	base = controlChars.ReplaceAllString(base, "")
	base = unsafeChars.ReplaceAllString(base, "-")
	base = multiHyphens.ReplaceAllString(base, "-")
	base = multiUnders.ReplaceAllString(base, "_")
	base = leadTrailPunct.ReplaceAllString(base, "")

	if len([]rune(base)) > 200 {
		runes := []rune(base)
		base = string(runes[:200])
		base = leadTrailPunct.ReplaceAllString(base, "")
	}

	if base == "" {
		base = fmt.Sprintf("untitled-%d", time.Now().UnixMilli())
	}

	return base + ext
}

// ToDisplayName converts a filename to a human-readable display name
func ToDisplayName(filename string) string {
	ext := filepath.Ext(filename)
	base := filename
	if ext != "" {
		base = filename[:len(filename)-len(ext)]
	}
	result := strings.NewReplacer("-", " ", "_", " ").Replace(base)
	return strings.Join(strings.Fields(result), " ")
}
