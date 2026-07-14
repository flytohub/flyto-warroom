package resource

import (
	"math"
	"sort"
	"strings"
	"unicode"
)

const (
	bm25K1 = 1.5
	bm25B  = 0.75
)

// SearchResult represents a ranked search hit
type SearchResult struct {
	ID    string  `json:"id"`
	Score float64 `json:"score"`
}

// BM25Index is an in-memory BM25 search index
type BM25Index struct {
	docIDs  []string
	docLens []int
	avgDL   float64
	n       int
	df      map[string]int
	tf      []map[string]int
}

// BuildBM25Index creates a BM25 index from documents
func BuildBM25Index(docs map[string]string) *BM25Index {
	idx := &BM25Index{df: make(map[string]int)}
	totalLen := 0

	for id, text := range docs {
		tokens := Tokenize(text)
		idx.docIDs = append(idx.docIDs, id)
		idx.docLens = append(idx.docLens, len(tokens))
		totalLen += len(tokens)

		tfMap := make(map[string]int)
		seen := make(map[string]bool)
		for _, t := range tokens {
			tfMap[t]++
			if !seen[t] {
				idx.df[t]++
				seen[t] = true
			}
		}
		idx.tf = append(idx.tf, tfMap)
	}

	idx.n = len(docs)
	if idx.n > 0 {
		idx.avgDL = float64(totalLen) / float64(idx.n)
	} else {
		idx.avgDL = 1
	}
	return idx
}

// Search returns ranked results for a query
func (idx *BM25Index) Search(query string, topK int) []SearchResult {
	queryTerms := Tokenize(query)
	if len(queryTerms) == 0 {
		return nil
	}

	var results []SearchResult
	for i, docID := range idx.docIDs {
		score := 0.0
		docLen := idx.docLens[i]
		tfMap := idx.tf[i]

		for _, term := range queryTerms {
			df := idx.df[term]
			tf := tfMap[term]
			if tf == 0 {
				continue
			}
			idf := math.Log((float64(idx.n)-float64(df)+0.5)/(float64(df)+0.5) + 1)
			tfNorm := (float64(tf) * (bm25K1 + 1)) / (float64(tf) + bm25K1*(1-bm25B+bm25B*float64(docLen)/idx.avgDL))
			score += idf * tfNorm
		}

		if score > 0 {
			results = append(results, SearchResult{ID: docID, Score: score})
		}
	}

	sort.Slice(results, func(i, j int) bool { return results[i].Score > results[j].Score })
	if topK > 0 && len(results) > topK {
		results = results[:topK]
	}
	return results
}

// Tokenize splits text into searchable tokens
func Tokenize(text string) []string {
	if text == "" {
		return nil
	}
	// Split camelCase
	var expanded strings.Builder
	for i, r := range text {
		if i > 0 && unicode.IsUpper(r) && i < len(text)-1 {
			prev := rune(text[i-1])
			if unicode.IsLower(prev) {
				expanded.WriteRune(' ')
			}
		}
		expanded.WriteRune(r)
	}

	words := strings.FieldsFunc(expanded.String(), func(r rune) bool {
		return !unicode.IsLetter(r) && !unicode.IsDigit(r)
	})

	var tokens []string
	for _, w := range words {
		w = strings.ToLower(w)
		if len(w) > 1 {
			tokens = append(tokens, w)
		}
	}
	return tokens
}
