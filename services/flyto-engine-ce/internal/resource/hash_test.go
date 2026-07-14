package resource

import "testing"

func TestComputeContentHash(t *testing.T) {
	hash := ComputeContentHash([]byte("hello world"))
	if len(hash) != 16 {
		t.Errorf("expected 16 chars, got %d", len(hash))
	}
}

func TestConsistentHash(t *testing.T) {
	a := ComputeStringHash("test content")
	b := ComputeStringHash("test content")
	if a != b {
		t.Errorf("same input should produce same hash: %s != %s", a, b)
	}
}

func TestDifferentHash(t *testing.T) {
	a := ComputeStringHash("content A")
	b := ComputeStringHash("content B")
	if a == b {
		t.Error("different input should produce different hash")
	}
}

func TestHashesMatch(t *testing.T) {
	if !HashesMatch("abc123", "abc123") {
		t.Error("identical hashes should match")
	}
	if HashesMatch("abc123", "def456") {
		t.Error("different hashes should not match")
	}
}
