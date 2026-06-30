import { Link, useParams } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import Box from '@mui/material/Box';
import Container from '@mui/material/Container';
import Typography from '@mui/material/Typography';
import Card from '@mui/material/Card';
import CardActionArea from '@mui/material/CardActionArea';
import Chip from '@mui/material/Chip';
import Skeleton from '@mui/material/Skeleton';
import Breadcrumbs from '@mui/material/Breadcrumbs';
import MuiLink from '@mui/material/Link';
import { getExploreIndustry } from '@lib/engine/apiExplore';
import { t } from '@lib/i18n';
import { qk } from '@lib/queryKeys';
import ExploreLayout from './ExploreLayout';

/**
 * ExploreIndustryView — companies inside one industry cell. Each row
 * is a public scorecard link; no grade is shown here (intentional —
 * the teaser grade appears only on the per-domain page so the click-
 * through has a payoff).
 */
export default function ExploreIndustryView() {
	const { industry = '' } = useParams<{ industry: string }>();
	const decoded = decodeURIComponent(industry);
	const q = useQuery({
		queryKey: qk.explore.industry(decoded),
		queryFn: () => getExploreIndustry(decoded),
		enabled: Boolean(decoded),
	});

	return (
		<ExploreLayout>
			<Container maxWidth="lg" sx={{ py: { xs: 4, md: 6 } }}>
				<Breadcrumbs sx={{ mb: 2, fontSize: 14 }}>
					<MuiLink component={Link} to="/explore" underline="hover" color="text.secondary">
						{t('explore.industries')}
					</MuiLink>
					<Typography color="text.primary" sx={{ textTransform: 'capitalize', fontSize: 14 }}>
						{decoded}
					</Typography>
				</Breadcrumbs>

				<Typography
					variant="h3"
					component="h1"
					sx={{
						fontWeight: 700,
						fontSize: { xs: 28, md: 40 },
						lineHeight: 1.15,
						textTransform: 'capitalize',
						mb: 1,
					}}
				>
					{decoded}
				</Typography>
				{q.data && (
					<Typography variant="body2" color="text.secondary" sx={{ mb: 4, fontSize: 14 }}>
						{q.data.count === 1
							? t('explore.tenantsTrackedOne')
							: t('explore.tenantsTracked', {
									count: q.data.count,
								})}
					</Typography>
				)}

				{q.isLoading ? (
					<Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(2, 1fr)' }, gap: 2 }}>
						{Array.from({ length: 6 }).map((_, i) => (
							<Skeleton key={i} variant="rounded" height={80} />
						))}
					</Box>
				) : q.isError ? (
					<Typography color="error">
						{t('explore.failedLoadIndustry')}
					</Typography>
				) : q.data ? (
					<Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(2, 1fr)' }, gap: 2 }}>
						{q.data.companies.map((c) => (
							<Card key={c.primary_domain} variant="outlined">
								<CardActionArea
									component={Link}
									to={`/explore/${encodeURIComponent(c.primary_domain)}`}
									sx={{ p: 2 }}
								>
									<Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 1 }}>
										<Box sx={{ minWidth: 0 }}>
											<Typography variant="subtitle1" sx={{ fontWeight: 600, lineHeight: 1.2 }}>
												{c.brand_name || c.legal_name}
											</Typography>
											<Typography variant="body2" color="text.secondary" sx={{ fontSize: 13 }}>
												{c.primary_domain}
											</Typography>
										</Box>
										{c.country && c.country !== '' && (
											<Chip label={c.country} size="small" variant="outlined" />
										)}
									</Box>
								</CardActionArea>
							</Card>
						))}
					</Box>
				) : null}
			</Container>
		</ExploreLayout>
	);
}
