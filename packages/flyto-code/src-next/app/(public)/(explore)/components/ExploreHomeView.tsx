import { Link } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import Box from '@mui/material/Box';
import Container from '@mui/material/Container';
import Typography from '@mui/material/Typography';
import Stack from '@mui/material/Stack';
import Card from '@mui/material/Card';
import CardActionArea from '@mui/material/CardActionArea';
import Chip from '@mui/material/Chip';
import Skeleton from '@mui/material/Skeleton';
import {
	getExploreStats,
	getExploreIndustries,
	getExploreCoverage,
} from '@lib/engine/apiExplore';
import { t } from '@lib/i18n';
import { qk } from '@lib/queryKeys';
import ExploreLayout from './ExploreLayout';

/**
 * ExploreHomeView — public /explore landing page. Three blocks:
 *   1. Hero with "we know N companies across M industries" badge
 *   2. Industries grid — click into an industry to see its companies
 *   3. Coverage map — per-country count + freshness pill
 *
 * Bypasses the logged-in workspace chrome entirely (ExploreLayout).
 * Designed for organic search landings + share links — first paint
 * must look intentional even before data arrives, hence the
 * skeleton placeholders sized to the final layout.
 */
export default function ExploreHomeView() {
	const stats = useQuery({ queryKey: qk.explore.stats(), queryFn: getExploreStats });
	const industries = useQuery({ queryKey: qk.explore.industries(), queryFn: getExploreIndustries });
	const coverage = useQuery({ queryKey: qk.explore.coverage(), queryFn: getExploreCoverage });

	return (
		<ExploreLayout>
			<Container maxWidth="lg" sx={{ py: { xs: 4, md: 8 } }}>
				{/* Hero */}
				<Box sx={{ textAlign: 'center', mb: 6 }}>
					<Typography
						variant="h2"
						component="h1"
						sx={{
							fontWeight: 700,
							fontSize: { xs: 32, md: 48 },
							lineHeight: 1.15,
								letterSpacing: 0,
							mb: 2,
						}}
					>
						{t('explore.heroTitle')}
					</Typography>
					<Typography
						variant="body1"
						color="text.secondary"
						sx={{ fontSize: { xs: 15, md: 17 }, mb: 3, maxWidth: 640, mx: 'auto' }}
					>
						{t('explore.heroBody')}
					</Typography>
					{stats.isLoading ? (
						<Skeleton variant="text" width={280} sx={{ mx: 'auto' }} />
					) : stats.data ? (
						<Typography variant="body2" color="text.secondary" sx={{ fontSize: 13 }}>
							{t('explore.statsLine', {
								companies: stats.data.companies.toLocaleString(),
								industries: stats.data.industries,
							})}
						</Typography>
					) : null}
				</Box>

				{/* Industries grid */}
				<Box sx={{ mb: 6 }}>
					<Typography variant="overline" color="text.secondary" sx={{ display: 'block', mb: 2, fontSize: 13 }}>
						{t('explore.browseByIndustry')}
					</Typography>
					{industries.isLoading ? (
						<Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', md: 'repeat(4, 1fr)' }, gap: 2 }}>
							{Array.from({ length: 8 }).map((_, i) => (
								<Skeleton key={i} variant="rounded" height={96} />
							))}
						</Box>
					) : industries.data ? (
						<Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', md: 'repeat(4, 1fr)' }, gap: 2 }}>
							{industries.data.industries
								.sort((a, b) => b.count - a.count)
								.map((row) => (
									<Card key={row.industry} variant="outlined">
										<CardActionArea component={Link} to={`/explore/industry/${encodeURIComponent(row.industry)}`} sx={{ p: 2 }}>
											<Typography variant="subtitle2" sx={{ textTransform: 'capitalize', fontWeight: 600 }}>
												{row.industry}
											</Typography>
											<Typography variant="body2" color="text.secondary" sx={{ fontSize: 13 }}>
												{row.count === 1
													? t('explore.companyCountOne')
													: t('explore.companiesCount', {
															count: row.count,
														})}
											</Typography>
										</CardActionArea>
									</Card>
								))}
						</Box>
					) : null}
				</Box>

				{/* Coverage strip */}
				<Box>
					<Typography variant="overline" color="text.secondary" sx={{ display: 'block', mb: 2, fontSize: 13 }}>
						{t('explore.coverageByCountry')}
					</Typography>
					{coverage.isLoading ? (
						<Stack direction="row" spacing={1} flexWrap="wrap">
							{Array.from({ length: 6 }).map((_, i) => (
								<Skeleton key={i} variant="rounded" width={120} height={32} />
							))}
						</Stack>
					) : coverage.data ? (
						<Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
							{coverage.data.countries.slice(0, 16).map((c) => (
								<Chip
									key={c.country}
									label={`${c.country === 'ZZ' ? t('explore.otherCountry') : c.country} · ${c.companyCount.toLocaleString()}`}
									size="small"
									color={c.fresh ? 'primary' : 'default'}
									variant={c.fresh ? 'filled' : 'outlined'}
								/>
							))}
						</Stack>
					) : null}
				</Box>
			</Container>
		</ExploreLayout>
	);
}
