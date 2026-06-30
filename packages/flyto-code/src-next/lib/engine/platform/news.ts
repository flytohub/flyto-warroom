// news.ts — Aggregated security RSS feed proxy.
//
// Backend: GET /api/v1/code/news
//   Auth-gated as of 2026-05-19 (was previously public; tightened
//   to align with the explore lockdown stance — zero anonymous
//   endpoints under /api/v1/code).
//
// The backend fans out to a handful of external RSS sources
// (BleepingComputer / The Hacker News / Krebs / abuse.ch URLhaus
// / etc.), merges them, dedupes by URL, sorts by published time,
// caches for ~30 min. Frontend just renders the items list.

import { request } from '../client'

export interface NewsItem {
  title: string
  link: string
  source: string
  published: string
  thumbnail?: string
}

export interface NewsResponse {
  items: NewsItem[]
  cached_at: string
}

export function getSecurityNews() {
  return request<NewsResponse>('GET', '/api/v1/code/news')
}
