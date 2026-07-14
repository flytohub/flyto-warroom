package resource

import "testing"

func TestTokenize(t *testing.T) {
	tokens := Tokenize("useAuthToken")
	expected := []string{"use", "auth", "token"}
	if len(tokens) != len(expected) {
		t.Fatalf("expected %d tokens, got %d: %v", len(expected), len(tokens), tokens)
	}
	for i, e := range expected {
		if tokens[i] != e {
			t.Errorf("token[%d]: expected %s, got %s", i, e, tokens[i])
		}
	}
}

func TestTokenizeEmpty(t *testing.T) {
	if tokens := Tokenize(""); tokens != nil {
		t.Errorf("empty input should return nil, got %v", tokens)
	}
}

func TestBM25Search(t *testing.T) {
	docs := map[string]string{
		"doc1": "auth login user",
		"doc2": "dashboard chart user",
		"doc3": "auth token session",
	}
	idx := BuildBM25Index(docs)
	results := idx.Search("auth login", 10)
	if len(results) == 0 {
		t.Fatal("should have results")
	}
	if results[0].ID != "doc1" {
		t.Errorf("doc1 should rank first, got %s", results[0].ID)
	}
}

func TestBM25NoMatch(t *testing.T) {
	docs := map[string]string{"doc1": "hello"}
	idx := BuildBM25Index(docs)
	results := idx.Search("nonexistent", 10)
	if len(results) != 0 {
		t.Error("should have no results")
	}
}
