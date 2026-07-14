package resource

// GraphEdge represents a relationship between resources
type GraphEdge struct {
	SourceID string
	TargetID string
}

// ImpactResult contains the blast radius of a change
type ImpactResult struct {
	AffectedIDs   []string
	TotalAffected int
}

// TraverseGraph performs BFS from startID up to maxDepth
func TraverseGraph(startID string, edges []GraphEdge, maxDepth int) []string {
	adj := buildAdj(edges)
	visited := map[string]bool{startID: true}
	queue := []struct {
		id    string
		depth int
	}{{startID, 0}}
	var result []string

	for len(queue) > 0 {
		item := queue[0]
		queue = queue[1:]
		if item.depth > 0 {
			result = append(result, item.id)
		}
		if item.depth >= maxDepth {
			continue
		}
		for _, neighbor := range adj[item.id] {
			if !visited[neighbor] {
				visited[neighbor] = true
				queue = append(queue, struct {
					id    string
					depth int
				}{neighbor, item.depth + 1})
			}
		}
	}
	return result
}

// FindImpacted finds all resources affected by a change
func FindImpacted(changedID string, edges []GraphEdge, maxDepth int) ImpactResult {
	affected := TraverseGraph(changedID, edges, maxDepth)
	return ImpactResult{AffectedIDs: affected, TotalAffected: len(affected)}
}

func buildAdj(edges []GraphEdge) map[string][]string {
	adj := make(map[string][]string)
	for _, e := range edges {
		adj[e.SourceID] = append(adj[e.SourceID], e.TargetID)
		adj[e.TargetID] = append(adj[e.TargetID], e.SourceID)
	}
	return adj
}
