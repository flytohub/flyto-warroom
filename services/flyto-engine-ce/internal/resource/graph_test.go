package resource

import "testing"

func TestTraverseDirectNeighbors(t *testing.T) {
	edges := []GraphEdge{
		{SourceID: "A", TargetID: "B"},
		{SourceID: "A", TargetID: "C"},
	}
	result := TraverseGraph("A", edges, 1)
	if len(result) != 2 {
		t.Errorf("expected 2 neighbors, got %d", len(result))
	}
}

func TestTraverseDepthLimit(t *testing.T) {
	edges := []GraphEdge{
		{SourceID: "A", TargetID: "B"},
		{SourceID: "B", TargetID: "C"},
		{SourceID: "C", TargetID: "D"},
	}
	result := TraverseGraph("A", edges, 1)
	if len(result) != 1 { // only B
		t.Errorf("depth 1 should find 1, got %d", len(result))
	}
}

func TestTraverseCycle(t *testing.T) {
	edges := []GraphEdge{
		{SourceID: "A", TargetID: "B"},
		{SourceID: "B", TargetID: "C"},
		{SourceID: "C", TargetID: "A"}, // cycle
	}
	result := TraverseGraph("A", edges, 10)
	if len(result) != 2 { // B, C (A is start, not counted)
		t.Errorf("cycle: expected 2, got %d", len(result))
	}
}

func TestTraverseIsolated(t *testing.T) {
	edges := []GraphEdge{
		{SourceID: "B", TargetID: "C"},
	}
	result := TraverseGraph("A", edges, 3)
	if len(result) != 0 {
		t.Errorf("isolated node should have 0 neighbors, got %d", len(result))
	}
}

func TestFindImpacted(t *testing.T) {
	edges := []GraphEdge{
		{SourceID: "A", TargetID: "B"},
		{SourceID: "B", TargetID: "C"},
	}
	impact := FindImpacted("A", edges, 3)
	if impact.TotalAffected != 2 {
		t.Errorf("expected 2 affected, got %d", impact.TotalAffected)
	}
}
