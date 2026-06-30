import Toolbar from '@mui/material/Toolbar';
import Box from '@mui/material/Box';
import themeOptions from 'src/configs/themeOptions';
import _ from 'lodash';
import LightDarkModeToggle from 'src/components/LightDarkModeToggle';
import FullScreenToggle from '@/components/theme-layouts/components/FullScreenToggle';
import LanguageSwitcher from '@/components/theme-layouts/components/LanguageSwitcher';
import { ExperienceToggle } from '@compounds/_shared/ExperienceToggle';
import { useLocation, useParams } from 'react-router';
import { getDualModePaths } from '@code/modules';

/**
 * Content-area toolbar — renders inside the workspace content area.
 * Repo filter dropdown removed (2026-05-18); filtering moved into the
 * per-view UI where context is clearer. `useRepoFilter` is still
 * available globally for views that want it.
 */
export default function ContentToolbar() {
  const { orgId } = useParams<{ orgId: string }>();
  const location = useLocation();
  const base = orgId ? `/projects/${orgId}` : '';
  const subPath = base && location.pathname.startsWith(base)
    ? location.pathname.slice(base.length) || '/dashboard'
    : location.pathname;
  const showExperienceToggle = isDualModePath(subPath);

  return (
    <Toolbar className="min-h-12 p-0 md:min-h-14" sx={{ flexShrink: 0, minWidth: 0, overflow: 'hidden' }}>
      <Box sx={{ flex: 1, minWidth: 0 }} />
      <Box sx={{
        display: 'flex',
        alignItems: 'center',
        gap: { xs: 0.5, sm: 1 },
        px: { xs: 0.5, sm: 1 },
        py: 0.5,
        minWidth: 0,
        maxWidth: '100%',
        overflow: 'hidden',
        '& > *': { flexShrink: 0 },
      }}>
        {showExperienceToggle && <ExperienceToggle />}
        <Box sx={{ display: { xs: 'none', sm: 'contents' } }}>
          <LanguageSwitcher />
        </Box>
        <Box sx={{ display: { xs: 'none', sm: 'contents' } }}>
          <FullScreenToggle />
        </Box>
        <LightDarkModeToggle
          lightTheme={_.find(themeOptions, { id: 'Default' })}
          darkTheme={_.find(themeOptions, { id: 'Default Dark' })}
        />
      </Box>
    </Toolbar>
  );
}

const DUAL_MODE_PATH_PREFIXES = [...getDualModePaths(), '/warroom'];

function isDualModePath(path: string): boolean {
  return DUAL_MODE_PATH_PREFIXES.some((prefix) => path === prefix || path.startsWith(`${prefix}/`));
}
