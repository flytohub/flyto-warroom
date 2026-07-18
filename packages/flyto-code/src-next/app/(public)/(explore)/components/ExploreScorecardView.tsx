import { Link, useParams } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import Box from '@mui/material/Box';
import Container from '@mui/material/Container';
import Typography from '@mui/material/Typography';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import Skeleton from '@mui/material/Skeleton';
import Breadcrumbs from '@mui/material/Breadcrumbs';
import Alert from '@mui/material/Alert';
import LockIcon from '@mui/icons-material/Lock';
import { getExplorePosture, PostureTeaser } from '@lib/engine/apiExplore';
import { t } from '@lib/i18n';
import { qk } from '@lib/queryKeys';
import { RatingAuthorityBadge } from '@compounds/_shared';
import MuiLink from '@mui/material/Link';
import ExploreLayout from './ExploreLayout';

/**
 * ExploreScorecardView — the teaser scorecard for one company. Render
 * priority is grade-letter > status messages > sign-up CTA. The full
 * numeric score + 90-day trend live behind sign-in; this page is
 * deliberately information-poor to drive the conversion.
 *
 * Grade-to-color is keyed off the backend's GradeFor() so frontend
 * and engine never disagree about what "B" means visually.
 */

const GRADE_COLOR: Record<string, { bg: string; fg: string }> = {
	A: { bg: '#16a34a', fg: '#ffffff' }, // green-600
	B: { bg: '#84cc16', fg: '#0a0a0a' }, // lime-500
	C: { bg: '#eab308', fg: '#0a0a0a' }, // yellow-500
	D: { bg: '#f97316', fg: '#ffffff' }, // orange-500
	F: { bg: '#dc2626', fg: '#ffffff' }, // red-600
};

export default function ExploreScorecardView() {
	const { domain = '' } = useParams<{ domain: string }>();
	const decoded = decodeURIComponent(domain);
	const q = useQuery<PostureTeaser, Error & { status?: number }>({
		queryKey: qk.explore.posture(decoded),
		queryFn: () => getExplorePosture(decoded),
		enabled: Boolean(decoded),
		retry: (failureCount, error) => {
			// Don't retry 404 (company not in KB) — that's a deterministic
			// no, not a transient failure.
			if (error?.status === 404) return false;
			return failureCount < 2;
		},
	});

	return (
		<ExploreLayout>
			<Container maxWidth="md" sx={{ py: { xs: 4, md: 6 } }}>
				<Breadcrumbs sx={{ mb: 2, fontSize: 14 }}>
					<MuiLink component={Link} to="/explore" underline="hover" color="text.secondary">
						{t('explore.breadcrumb')}
					</MuiLink>
					<Typography color="text.primary" sx={{ fontSize: 14 }}>
						{decoded}
					</Typography>
				</Breadcrumbs>

				{q.isLoading ? <LoadingState /> : null}
				{q.isError && q.error?.status === 404 ? <NotFoundState domain={decoded} /> : null}
				{q.isError && q.error?.status !== 404 ? (
					<Alert severity="error" sx={{ mb: 3 }}>
						{t('explore.scoreCardError')}
					</Alert>
				) : null}
				{q.data ? <ScorecardCard data={q.data} domain={decoded} /> : null}
			</Container>
		</ExploreLayout>
	);
}

function LoadingState() {
	return (
		<>
			<Skeleton variant="text" width={320} height={50} />
			<Skeleton variant="text" width={200} sx={{ mb: 3 }} />
			<Skeleton variant="rounded" height={280} />
		</>
	);
}

function NotFoundState({ domain }: { domain: string }) {
	return (
		<Card variant="outlined">
			<CardContent sx={{ py: 4, textAlign: 'center' }}>
				<Typography variant="h6" sx={{ mb: 1 }}>
					{t('explore.notInKB', { domain })}
				</Typography>
				<Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
					{t('explore.notInKBBody')}
				</Typography>
				<Button component={Link} to="/sign-up" variant="contained" size="large" sx={{ textTransform: 'none' }}>
					{t('explore.notInKBAction')}
				</Button>
			</CardContent>
		</Card>
	);
}

function ScorecardCard({ data, domain }: { data: PostureTeaser; domain: string }) {
	const { company, status, grade, issuesFound, lockedCount, industryRank, lastScanned, cta } = data;
	return (
		<>
			{/* Headline */}
			<Box sx={{ mb: 3 }}>
				<Typography
					variant="h3"
					component="h1"
					sx={{ fontWeight: 700, fontSize: { xs: 28, md: 36 }, lineHeight: 1.15 }}
				>
					{company.brand_name || company.legal_name}
				</Typography>
				<Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 1, flexWrap: 'wrap' }}>
					<Typography variant="body2" color="text.secondary">
						{domain}
					</Typography>
					{company.industry && company.industry !== 'unknown' && (
						<Chip
							component={Link}
							to={`/explore/industry/${encodeURIComponent(company.industry)}`}
							label={company.industry}
							size="small"
							clickable
							variant="outlined"
							sx={{ textTransform: 'capitalize' }}
						/>
					)}
					{company.country && <Chip label={company.country} size="small" variant="outlined" />}
					<RatingAuthorityBadge authority={data.ratingAuthority} />
					{data.codeLinkedExternalImpact && (
						<Chip
							label={t('explore.codeLinkedExternalImpact', { band: codeLinkedImpactBandLabel(data.codeLinkedExternalImpactBand) })}
							size="small"
							variant="outlined"
							color="warning"
						/>
					)}
				</Box>
			</Box>

			{/* Grade card */}
			<Card variant="outlined" sx={{ mb: 3 }}>
				<CardContent sx={{ display: 'flex', alignItems: 'center', gap: 3, p: 3 }}>
					<GradeBadge grade={grade} status={status} />
					<Box sx={{ flex: 1, minWidth: 0 }}>
						<StatusLine status={status} grade={grade} industryRank={industryRank} />
						{lastScanned && (
							<Typography variant="body2" color="text.secondary" sx={{ fontSize: 13 }}>
								{t('explore.lastScanned', { date: lastScanned })}
							</Typography>
						)}
					</Box>
				</CardContent>
			</Card>

			{/* Findings teaser — visible facts as proof of scan, locked count drives sign-up */}
			{status === 'scanned' && issuesFound > 0 && (
				<Card variant="outlined" sx={{ mb: 3 }}>
					<CardContent sx={{ p: 3 }}>
						<Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 1 }}>
							{t('explore.findingsDetected', { count: issuesFound })}
						</Typography>
						{data.visibleFacts && data.visibleFacts.length > 0 && (
							<Box component="ul" sx={{ pl: 3, mt: 1, mb: 0 }}>
								{data.visibleFacts.map((f) => (
									<Typography
										key={f.category}
										component="li"
										variant="body2"
										sx={{ fontSize: 14, mb: 0.5 }}
									>
										<strong>{f.count}</strong> {f.category}
									</Typography>
								))}
							</Box>
						)}
						{lockedCount > 0 && (
							<Box
								sx={{
									mt: 2,
									p: 2,
									borderRadius: 1,
									bgcolor: 'action.hover',
									display: 'flex',
									alignItems: 'center',
									gap: 1.5,
								}}
							>
								<LockIcon sx={{ color: 'text.secondary' }} fontSize="small" />
								<Box sx={{ flex: 1 }}>
									<Typography variant="body2" sx={{ fontWeight: 500 }}>
										{t('explore.findingsHidden', { count: lockedCount })}
									</Typography>
									<Typography variant="body2" color="text.secondary" sx={{ fontSize: 13 }}>
										{t('explore.lockedExplanation')}
									</Typography>
								</Box>
							</Box>
						)}
					</CardContent>
				</Card>
			)}

			{/* CTA */}
			<Card variant="outlined" sx={{ bgcolor: 'primary.main', color: 'primary.contrastText' }}>
				<CardContent sx={{ p: 3, textAlign: 'center' }}>
					<Typography variant="h6" sx={{ fontWeight: 700, mb: 1 }}>
						{cta.headline}
					</Typography>
					<Typography variant="body2" sx={{ opacity: 0.9, mb: 2 }}>
						{cta.body}
					</Typography>
					<Button
						component={Link}
						to="/sign-up"
						variant="contained"
						color="secondary"
						size="large"
						sx={{ textTransform: 'none' }}
					>
						{t('explore.signUpFree')}
					</Button>
				</CardContent>
			</Card>
		</>
	);
}

function GradeBadge({ grade, status }: { grade?: string; status: PostureTeaser['status'] }) {
	if (!grade || status !== 'scanned') {
		return (
			<Box
				sx={{
					width: 96,
					height: 96,
					borderRadius: 2,
					border: 1,
					borderColor: 'divider',
					display: 'flex',
					alignItems: 'center',
					justifyContent: 'center',
					flexDirection: 'column',
				}}
			>
				<Typography variant="body2" color="text.secondary" sx={{ fontSize: 13 }}>
					{status === 'scanning'
						? t('explore.gradeBadgeScanning')
						: status === 'unreachable'
							? t('explore.gradeBadgeUnreachable')
							: t('explore.gradeBadgePending')}
				</Typography>
			</Box>
		);
	}
	const c = GRADE_COLOR[grade] || GRADE_COLOR.F;
	return (
		<Box
			sx={{
				width: 96,
				height: 96,
				borderRadius: 2,
				bgcolor: c.bg,
				color: c.fg,
				display: 'flex',
				alignItems: 'center',
				justifyContent: 'center',
				flexShrink: 0,
			}}
		>
			<Typography
				sx={{
					fontWeight: 800,
					fontSize: 56,
					lineHeight: 1,
						letterSpacing: 0,
				}}
			>
				{grade}
			</Typography>
		</Box>
	);
}

function StatusLine({
	status,
	grade,
	industryRank,
}: {
	status: PostureTeaser['status'];
	grade?: string;
	industryRank?: string;
}) {
	if (status === 'scanned' && grade) {
		return (
			<>
				<Typography variant="h6" sx={{ fontWeight: 600 }}>
					{industryRank
						? t('explore.gradeRankLine', { grade, rank: industryRank })
						: t('explore.gradeLine', { grade })}
				</Typography>
				<Typography variant="body2" color="text.secondary" sx={{ mb: 0.5, fontSize: 13 }}>
					{t('explore.publicPreview')}
				</Typography>
			</>
		);
	}
	if (status === 'scanning') {
		return (
			<Typography variant="h6" sx={{ fontWeight: 600 }}>
				{t('explore.statusScanning')}
			</Typography>
		);
	}
	if (status === 'unreachable') {
		return (
			<Typography variant="h6" sx={{ fontWeight: 600 }}>
				{t('explore.statusUnreachable')}
			</Typography>
		);
	}
	return (
		<Typography variant="h6" sx={{ fontWeight: 600 }}>
			{t('explore.statusNoData')}
		</Typography>
	);
}

function codeLinkedImpactBandLabel(band?: PostureTeaser['codeLinkedExternalImpactBand']): string {
	switch (band) {
		case 'high':
			return t('explore.codeLinkedImpactBand.high')
		case 'medium':
			return t('explore.codeLinkedImpactBand.medium')
		case 'low':
			return t('explore.codeLinkedImpactBand.low')
		default:
			return t('explore.codeLinkedImpactBand.observed')
	}
}
