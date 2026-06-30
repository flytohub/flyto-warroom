import { t } from '@lib/i18n';
import FuseScrollbars from '@components/adapters/Scrollbars';
import IconButton from '@mui/material/IconButton';
import FuseSvgIcon from '@components/adapters/Icon';
import Typography from '@mui/material/Typography';
import FuseThemeSelector from '@fuse/core/FuseThemeSelector/FuseThemeSelector';
import { styled, useTheme } from '@mui/material/styles';
import Dialog from '@mui/material/Dialog';
import Slide from '@mui/material/Slide';
import { SwipeableHandlers } from 'react-swipeable';
import themeOptions from 'src/configs/themeOptions';
import { FuseThemeOption } from '@fuse/core/FuseThemeSelector/ThemePreview';
import useUser from '@auth/useUser';
import useFuseSettings from '@components/adapters/useFuseSettings';
import { FuseSettingsConfigType } from '@fuse/core/FuseSettings/FuseSettings';
import { useSnackbar } from 'notistack';
const StyledDialog = styled(Dialog)(({ theme }) => ({
	'& .MuiDialog-paper': {
		position: 'fixed',
		width: '100%',
		maxWidth: '40%',
		[theme.breakpoints.down('md')]: {
			maxWidth: '90%'
		},
		backgroundColor: theme.vars.palette.background.paper,
		top: 0,
		height: '100%',
		minHeight: '100%',
		bottom: 0,
		right: 0,
		margin: 0,
		zIndex: 1000,
		borderRadius: 0
	}
}));

type TransitionProps = {
	children?: React.ReactElement;
	ref?: React.RefObject<HTMLDivElement>;
};

function Transition(props: TransitionProps) {
	const { children, ref, ...other } = props;

	const theme = useTheme();

	if (!children) {
		return null;
	}

	return (
		<Slide
			direction={theme.direction === 'ltr' ? 'left' : 'right'}
			ref={ref}
			{...other}
		>
			{children}
		</Slide>
	);
}

type ThemesPanelProps = {
	schemesHandlers: SwipeableHandlers;
	onClose: () => void;
	open: boolean;
};

function ThemesPanel(props: ThemesPanelProps) {
	const { schemesHandlers, onClose, open } = props;
	const { setSettings } = useFuseSettings();
	const { isGuest, updateUserSettings } = useUser();
	const { enqueueSnackbar } = useSnackbar();

	async function handleThemeSelect(_theme: FuseThemeOption) {
		const _newSettings = setSettings({ theme: { ..._theme?.section } } as Partial<FuseSettingsConfigType>);

		if (!isGuest) {
			const updatedUserData = await updateUserSettings(_newSettings);

			if (updatedUserData) {
				enqueueSnackbar(t('hardcoded.user.settings.saved.602a3d2a'), {
					variant: 'success'
				});
			}
		}
	}

	return (
		<StyledDialog
			slots={{
				transition: Transition
			}}
			aria-labelledby="schemes-panel"
			aria-describedby="schemes"
			open={open}
			onClose={onClose}
			slotProps={{
				backdrop: {
					invisible: true
				}
			}}
			fullScreen
			classes={{
				paper: 'shadow-lg'
			}}
			disableRestoreFocus
			{...schemesHandlers}
		>
			<FuseScrollbars className="p-4 sm:p-6">
				<IconButton
					className="fixed top-0 z-10 ltr:right-0 rtl:left-0"
					onClick={onClose}
					size="large"
				>
					<FuseSvgIcon>lucide:x</FuseSvgIcon>
				</IconButton>

				<Typography
					className="mb-8"
					variant="h6"
				>
					{t('layout.themeColorOptions')}
				</Typography>

				<Typography
					className="text-md mb-6 text-justify italic"
					color="text.secondary"
				>
					* Selected option will be applied to all layout elements (navbar, toolbar, etc.). You can also
					create your own theme options and color schemes.
				</Typography>

				<FuseThemeSelector
					options={themeOptions}
					onSelect={handleThemeSelect}
				/>
			</FuseScrollbars>
		</StyledDialog>
	);
}

export default ThemesPanel;
