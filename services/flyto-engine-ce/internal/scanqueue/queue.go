// Package scanqueue provides a bounded worker pool for scan jobs.
package scanqueue

// ScanJob describes a single scan request to be processed by the worker pool.
type ScanJob struct {
	ScanID  string
	RepoID  string
	OrgID   string
	HTMLURL string
	Token   string
}

// Queue is a bounded worker pool that processes scan jobs with limited
// concurrency. Instead of spawning an unbounded number of goroutines,
// callers enqueue jobs and a fixed set of workers drains them.
type Queue struct {
	jobs    chan ScanJob
	handler func(ScanJob)
}

// New creates a queue with the given concurrency (max parallel scans).
func New(concurrency int, handler func(ScanJob)) *Queue {
	q := &Queue{
		jobs:    make(chan ScanJob, 100),
		handler: handler,
	}
	for i := 0; i < concurrency; i++ {
		go q.worker()
	}
	return q
}

// Enqueue adds a scan job to the queue. It blocks if the buffer is full.
func (q *Queue) Enqueue(job ScanJob) {
	q.jobs <- job
}

func (q *Queue) worker() {
	for job := range q.jobs {
		q.handler(job)
	}
}
