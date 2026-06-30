import { ReactNode } from 'react';
import { Link } from 'react-router';
import Box from '@mui/material/Box';
import Container from '@mui/material/Container';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import { t } from '@lib/i18n';

/**
 * ExploreLayout — chrome for every public /explore/* page. Renders a
 * minimal top bar (brand + sign-up button) above the page content.
 * Deliberately distinct from the logged-in workspace shell so visitors
 * don't get confused into thinking they're already in the product.
 *
 * Why a custom shell vs the FuseLayout chrome: the FuseLayout assumes
 * an authenticated user (org switcher, avatar, notifications). Threading
 * "anonymous mode" through Fuse's component tree would create more
 * surface area for auth bugs than just rendering a separate shell.
 */
export default function ExploreLayout({ children }: { children: ReactNode }) {
	return (
		<Box sx={{ minHeight: '100vh', bgcolor: 'background.default', display: 'flex', flexDirection: 'column' }}>
			<Box
				component="header"
				sx={{
					borderBottom: 1,
					borderColor: 'divider',
					bgcolor: 'background.paper',
					py: 1.5,
				}}
			>
				<Container maxWidth="lg" sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
					<Link to="/explore" style={{ textDecoration: 'none' }}>
						<Typography
							variant="h6"
								sx={{ fontWeight: 700, color: 'text.primary', letterSpacing: 0 }}
						>
							{t('explore.headerBrand')}
						</Typography>
					</Link>
					<Box sx={{ display: 'flex', gap: 1 }}>
						<Button
							component={Link}
							to="/sign-in"
							size="small"
							variant="text"
							sx={{ textTransform: 'none' }}
						>
							{t('explore.signIn')}
						</Button>
						<Button
							component={Link}
							to="/sign-up"
							size="small"
							variant="contained"
							sx={{ textTransform: 'none' }}
						>
							{t('explore.signUpFree')}
						</Button>
					</Box>
				</Container>
			</Box>
			<Box component="main" sx={{ flex: 1 }}>
				{children}
			</Box>
			<Box
				component="footer"
				sx={{
					borderTop: 1,
					borderColor: 'divider',
					py: 3,
					mt: 6,
					bgcolor: 'background.paper',
				}}
			>
				<Container maxWidth="lg">
					<Typography variant="body2" color="text.secondary" sx={{ fontSize: 13 }}>
						{t('explore.footer')}
					</Typography>
				</Container>
			</Box>
		</Box>
	);
}
