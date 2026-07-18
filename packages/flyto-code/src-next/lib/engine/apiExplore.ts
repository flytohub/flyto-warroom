/**
 * /explore API client. ALL endpoints are sign-in-only as of the
 * 2026-05-18 lockdown — the originally-public lead-gen surface was
 * pulled back pending legal review of publishing third-party
 * security ratings without consent. Every call below uses the shared
 * `request()` helper which injects the Firebase ID token; the
 * frontend's RequireAuth guard ensures unauthenticated users never
 * reach a route that triggers these fetchers.
 *
 * If/when the portal goes public again, restore `publicFetch()` from
 * git history and re-target the aggregate endpoints (stats /
 * coverage / industries-count) — keep individual company endpoints
 * behind auth even then.
 */

import { request } from './client'
import type { ScoreAuthority } from './scoring/scoring'

// === Public response shapes — must match the Go structs in
// flyto-engine/api/handlers_public_explore.go EXACTLY. JSON tags on
// the Go side use lowerCamelCase already.

export interface ExploreStats {
	companies: number
	industries: number
}

export interface ExploreIndustrySummary {
	industry: string
	count: number
	// `sample` removed in 2026-05-18 lockdown — exposing 3 example
	// domains per industry was effectively a partial directory.
}

export interface ExploreIndustriesResp {
	industries: ExploreIndustrySummary[]
	total: number
}

export interface ExploreCompanyCard {
	legal_name: string
	brand_name: string
	primary_domain: string
	industry: string
	size_bucket: string
	country: string
}

export interface ExploreIndustryResp {
	industry: string
	companies: ExploreCompanyCard[]
	count: number
}

// PostureTeaser is the LOCKED public view — no raw score, fuzz counts only.
export interface PostureTeaser {
	company: ExploreCompanyCard
	status: 'scanned' | 'scanning' | 'unreachable' | 'no_data'
	grade?: string
	issuesFound: number
	visibleFacts?: { category: string; count: number }[]
	lockedCount: number
	ratingAuthority?: ScoreAuthority
	codeLinkedExternalImpact: boolean
	codeLinkedExternalImpactBand?: 'low' | 'medium' | 'high'
	industryRank?: string
	lastScanned?: string
	cta: { headline: string; body: string; action: string }
}

// PostureFull is the SIGNED-IN counterpart returned by /posture/full.
export interface PostureFull {
	company: ExploreCompanyCard
	latest?: {
		score: number
		grade: string
		reachable: boolean
		assetCount: number
		assetsSummary: Record<string, number>
		ratingAuthority?: ScoreAuthority
		codeLinkedExternalImpact: boolean
		codeLinkedExternalImpactBand?: 'low' | 'medium' | 'high'
		snapshotDate: string
	}
	trend: { date: string; score: number }[]
}

export interface CountryCoverage {
	country: string
	companyCount: number
	fresh: boolean
}

export interface CoverageResp {
	countries: CountryCoverage[]
	total: number
}

export function getExploreStats() {
	return request<ExploreStats>('GET', '/api/v1/explore/stats')
}

export function getExploreIndustries() {
	return request<ExploreIndustriesResp>('GET', '/api/v1/explore/industries')
}

export function getExploreIndustry(industry: string) {
	const enc = encodeURIComponent(industry)
	return request<ExploreIndustryResp>('GET', `/api/v1/explore/industry/${enc}`)
}

export function getExploreDomain(domain: string) {
	const enc = encodeURIComponent(domain)
	return request<ExploreCompanyCard>('GET', `/api/v1/explore/domain/${enc}`)
}

export function getExplorePosture(domain: string) {
	const enc = encodeURIComponent(domain)
	return request<PostureTeaser>('GET', `/api/v1/explore/domain/${enc}/posture`)
}

export function getExploreCoverage() {
	return request<CoverageResp>('GET', '/api/v1/explore/coverage')
}

export function getExplorePostureFull(domain: string) {
	const enc = encodeURIComponent(domain)
	return request<PostureFull>('GET', `/api/v1/explore/domain/${enc}/posture/full`)
}
