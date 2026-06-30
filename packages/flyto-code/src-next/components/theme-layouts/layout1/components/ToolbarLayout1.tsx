import Toolbar from '@mui/material/Toolbar';
import clsx from 'clsx';
import { memo, useState } from 'react';
import NavbarToggleButton from 'src/components/theme-layouts/components/navbar/NavbarToggleButton';
import themeOptions from 'src/configs/themeOptions';
import _ from 'lodash';
import LightDarkModeToggle from 'src/components/LightDarkModeToggle';
import useFuseLayoutSettings from '@components/adapters/useLayoutSettings';
import FullScreenToggle from '../../components/FullScreenToggle';
import LanguageSwitcher from '../../components/LanguageSwitcher';
import { Layout1ConfigDefaultsType } from '@/components/theme-layouts/layout1/Layout1Config';
import useThemeMediaQuery from '../../../../@fuse/hooks/useThemeMediaQuery';
import { AppBar, Box, Divider, Avatar, IconButton, Menu, MenuItem, ListItemIcon, ListItemText, Typography } from '@mui/material';
import { LogOut, Settings, User } from 'lucide-react';
import ToolbarTheme from 'src/contexts/ToolbarTheme';
import { useAuth } from '@hooks/useAuth';
import { useOrg } from '@hooks/useOrg';
import { t } from '@lib/i18n';

type ToolbarLayout1Props = {
	className?: string;
};

/**
 * The toolbar layout 1.
 */
function ToolbarLayout1(props: ToolbarLayout1Props) {
	const { className } = props;

	const settings = useFuseLayoutSettings();
	const config = settings.config as Layout1ConfigDefaultsType;
	const isMobile = useThemeMediaQuery((theme) => theme.breakpoints.down('lg'));
	const { user, signOut } = useAuth();
	const { org } = useOrg();
	const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
	const initial = user?.displayName?.[0] ?? user?.email?.[0] ?? '?';

	return (
		<ToolbarTheme>
			<AppBar
				id="fuse-toolbar"
				className={clsx('relative z-20 flex', className)}
				sx={(theme) => ({
					backgroundColor: theme.vars.palette.background.default,
					color: theme.vars.palette.text.primary
				})}
			>
				<Toolbar className="min-h-12 p-0 md:min-h-16">
					<div className="flex flex-1 items-center gap-3 px-2 md:px-4">
						{config.navbar.display && config.navbar.position === 'left' && (
							<>
								<NavbarToggleButton />

								<Divider
									orientation="vertical"
									flexItem
									variant="middle"
								/>
							</>
						)}

						{/* NavigationShortcuts (star icon) removed */}
					</div>

					<div className="flex items-center overflow-x-auto px-2 py-2 md:px-4">
						<LanguageSwitcher />
						<FullScreenToggle />
						<LightDarkModeToggle
							lightTheme={_.find(themeOptions, { id: 'Default' })}
							darkTheme={_.find(themeOptions, { id: 'Default Dark' })}
						/>

						{user && (
							<>
								<IconButton
									onClick={(e) => setAnchorEl(e.currentTarget)}
									size="small"
									sx={{ ml: 0.5, p: 0, width: 30, height: 30, '&:hover': { bgcolor: 'transparent' } }}
								>
									<Box sx={{
										position: 'relative', width: 28, height: 28, flexShrink: 0,
										'& .avatar-spin-ring': {
											position: 'absolute', inset: 0, borderRadius: '50%',
											background: 'conic-gradient(from 0deg, #06b6d4, #8b5cf6, #ec4899, #f59e0b, #22c55e, #06b6d4)',
											animation: 'avatar-ring-rotate 4s linear infinite',
											'&::before': {
												content: '""', position: 'absolute', inset: '2.5px', borderRadius: '50%',
												bgcolor: 'background.default',
											},
										},
										'@keyframes avatar-ring-rotate': {
											from: { transform: 'rotate(0deg)' },
											to: { transform: 'rotate(360deg)' },
										},
									}}>
										<Box className="avatar-spin-ring" />
										{user.photoURL ? (
											<Avatar src={user.photoURL} sx={{
												width: 22, height: 22,
												position: 'absolute', top: '50%', left: '50%',
												transform: 'translate(-50%, -50%)',
											}} />
										) : (
											<Avatar sx={{
												width: 22, height: 22, bgcolor: '#8b5cf6',
												fontSize: 12, fontWeight: 700,
												position: 'absolute', top: '50%', left: '50%',
												transform: 'translate(-50%, -50%)',
											}}>
												{initial}
											</Avatar>
										)}
									</Box>
								</IconButton>
								<Menu
									anchorEl={anchorEl}
									open={Boolean(anchorEl)}
									onClose={() => setAnchorEl(null)}
									slotProps={{ paper: { sx: { minWidth: 200, mt: 1 } } }}
									anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
									transformOrigin={{ vertical: 'top', horizontal: 'right' }}
								>
									<MenuItem disabled>
										<Typography variant="body2" fontWeight={600}>
											{user.displayName || user.email}
										</Typography>
									</MenuItem>
									<Divider />
									{org && (
										<MenuItem onClick={() => { setAnchorEl(null) }}>
											<ListItemIcon><Settings size={16} /></ListItemIcon>
											<ListItemText>{t('settings.title') || 'Settings'}</ListItemText>
										</MenuItem>
									)}
									<MenuItem onClick={() => { setAnchorEl(null); signOut() }} sx={{ color: 'error.main' }}>
										<ListItemIcon><LogOut size={16} color="#ef4444" /></ListItemIcon>
										<ListItemText>{t('topbar.signOut') || 'Sign Out'}</ListItemText>
									</MenuItem>
								</Menu>
							</>
						)}
					</div>

					{config.navbar.display && config.navbar.position === 'right' && (
						<>
							{!isMobile && (
								<>
									<Divider
										orientation="vertical"
										flexItem
										variant="middle"
									/>
									<NavbarToggleButton />
								</>
							)}

							{isMobile && <NavbarToggleButton className="h-10 w-10 p-0 sm:mx-2" />}
						</>
					)}
				</Toolbar>
			</AppBar>
		</ToolbarTheme>
	);
}

export default memo(ToolbarLayout1);
