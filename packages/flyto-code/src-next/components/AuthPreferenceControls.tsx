import Paper from '@mui/material/Paper';
import { LocalePicker } from '@atoms/LocalePicker';
import LightDarkModeToggle from '@components/LightDarkModeToggle';
import themeOptions from '@/configs/themeOptions';
import { t } from '@lib/i18n';

function requireTheme(id: string) {
	const theme = themeOptions.find((option) => option.id === id);
	if (!theme) throw new Error(`Required theme is missing: ${id}`);
	return theme;
}

const lightTheme = requireTheme('Default');
const darkTheme = requireTheme('Default Dark');

/** Language and appearance controls available before authentication. */
export function AuthPreferenceControls() {
	return (
		<Paper
			component="aside"
			aria-label={`${t('settings.language')} / ${t('layout.themeSettings')}`}
			elevation={3}
			sx={{
				position: 'absolute',
				top: { xs: 12, sm: 16 },
				right: { xs: 12, sm: 16 },
				zIndex: 30,
				display: 'flex',
				alignItems: 'center',
				gap: 0.25,
				p: 0.5,
				border: 1,
				borderColor: 'divider',
				borderRadius: 2.5,
				bgcolor: 'background.paper'
			}}
		>
			<LocalePicker showLabel />
			<LightDarkModeToggle lightTheme={lightTheme} darkTheme={darkTheme} />
		</Paper>
	);
}
