import { useState, useRef, useEffect } from 'react';
import { useNavigate, useLocation, useParams } from 'react-router';
import { qk } from '@lib/queryKeys';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { ThemeProvider, createTheme, useTheme } from '@mui/material/styles';
import themesConfig from 'src/configs/themesConfig';
import List from '@mui/material/List';
import ListItemButton from '@mui/material/ListItemButton';
import ListItemIcon from '@mui/material/ListItemIcon';
import ListItemText from '@mui/material/ListItemText';
import Collapse from '@mui/material/Collapse';
import IconButton from '@mui/material/IconButton';
import TextField from '@mui/material/TextField';
import InputAdornment from '@mui/material/InputAdornment';
import Chip from '@mui/material/Chip';
import Skeleton from '@mui/material/Skeleton';
import Tooltip from '@mui/material/Tooltip';
import {
  ChevronDown, Search, LayoutDashboard,
  Pencil, Check, X, LockKeyhole,
} from 'lucide-react';
import {
  SIDEBAR_GROUP_ORDER,
  getModulesByGroup,
  navPath,
} from '@code/modules';
import type { CountSlot, Module } from '@code/Module';
import { t, tOr } from '@lib/i18n';
import { clickableA11y } from '@lib/a11y';
import { useOrg, useConnectedRepos } from '@hooks/useOrg';
import { useCapabilities } from '@hooks/useCapabilities';
import { useProjectCapabilities } from '@hooks/useProjectCapabilities';
import { useQuery } from '@tanstack/react-query';
import { getOrgHealthSummary, getEnrichedOrgIssues, listPentestProjects, listAttackSurface, listAutofixFindings, listOrgs, type AutofixFindingRow } from '@lib/engine';

/* ── Nav item ── */
function NavItem({
  icon: Icon, label, count, to, active, dim, locked, lockReason,
}: {
  icon: typeof LayoutDashboard;
  label: string;
  count?: number;
  to: string;
  active: boolean;
  dim?: boolean;
  locked?: boolean;
  lockReason?: string;
}) {
  const navigate = useNavigate();
  return (
    <ListItemButton
      aria-label={label}
      selected={active}
      onClick={() => navigate(to)}
      sx={{
        px: { xs: 1, sm: 2 }, py: 0.6, borderRadius: 1.5, mx: { xs: 0.75, sm: 1 }, mb: 0.25,
        width: 'auto',
        maxWidth: { xs: 'calc(100% - 12px)', sm: 'none' },
        overflow: 'hidden',
        boxSizing: 'border-box',
        justifyContent: { xs: 'center', sm: 'flex-start' },
        opacity: dim ? 0.45 : 1,
        '&.Mui-selected': { bgcolor: 'rgba(139,92,246,0.12)' },
        '&.Mui-selected:hover': { bgcolor: 'rgba(139,92,246,0.18)' },
      }}
    >
      <ListItemIcon sx={{ minWidth: { xs: 0, sm: 32 }, color: active ? 'primary.main' : 'text.secondary' }}>
        <Icon size={16} />
      </ListItemIcon>
      <ListItemText
        primary={label}
        primaryTypographyProps={{ variant: 'body2', fontWeight: active ? 600 : 400, noWrap: true, color: 'text.primary' }}
        sx={{ display: { xs: 'none', sm: 'block' } }}
      />
      {count !== undefined && count > 0 && (
        <Chip label={count} size="small" sx={{ display: { xs: 'none', sm: 'inline-flex' }, height: 18, fontSize: 12, bgcolor: 'action.selected', color: 'primary.main' }} />
      )}
      {locked && (
        <Tooltip title={lockReason || t('sidebar.lockedPreview')}>
          <Box
            component="span"
            sx={{
              display: { xs: 'none', sm: 'inline-flex' },
              alignItems: 'center',
              justifyContent: 'center',
              ml: 0.5,
              color: 'text.secondary',
            }}
          >
            <LockKeyhole size={13} />
          </Box>
        </Tooltip>
      )}
    </ListItemButton>
  );
}

/** Placeholder rendered while capabilities resolve, so the nav doesn't
 *  flash an empty or stale module subset before settling on the backend
 *  capability snapshot. Mimics a couple of grouped nav rows. */
function NavSkeleton() {
  const rows = [3, 2, 4]; // items per faux-group
  return (
    <Box aria-hidden sx={{ px: { xs: 0.75, sm: 1 }, pt: 1 }}>
      {rows.map((count, g) => (
        <Box key={g} sx={{ mb: 1.5 }}>
          <Skeleton
            variant="text"
            width={64}
            sx={{ mx: { xs: 'auto', sm: 1.5 }, mb: 0.5, display: { xs: 'none', sm: 'block' } }}
          />
          {Array.from({ length: count }).map((_, i) => (
            <Box key={i} sx={{ display: 'flex', alignItems: 'center', gap: 1, px: { xs: 1, sm: 2 }, py: 0.7 }}>
              <Skeleton variant="rounded" width={16} height={16} sx={{ flexShrink: 0 }} />
              <Skeleton variant="text" sx={{ flex: 1, display: { xs: 'none', sm: 'block' } }} />
            </Box>
          ))}
        </Box>
      ))}
    </Box>
  );
}

/** Compact org switcher — shows other orgs the user belongs to. */
function OrgSwitcher({ currentOrgId }: { currentOrgId?: string }) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const { data } = useQuery({
    queryKey: qk.platform.orgs(),
    queryFn: listOrgs,
    staleTime: 60_000,
  });
  const orgs = (data?.organizations ?? []).filter(o => o.id !== currentOrgId);
  if (orgs.length === 0) return null;
  return (
    <Box sx={{ mt: 1 }}>
      <Typography
        variant="caption"
        color="text.secondary"
        sx={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 0.5, '&:hover': { color: 'text.secondary' } }}
        onClick={() => setOpen(v => !v)}
        {...clickableA11y(() => setOpen(v => !v), { label: t('sidebar.switchOrg') })}
      >
        <ChevronDown size={12} style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
        {t('sidebar.switchOrg')}
      </Typography>
      <Collapse in={open}>
        <List dense disablePadding sx={{ mt: 0.5 }}>
          {orgs.map(o => (
            <ListItemButton key={o.id} sx={{ borderRadius: 1.5, py: 0.5, px: 1 }}
              onClick={() => { navigate(`/projects/${o.id}`); setOpen(false); }}>
              <ListItemText primary={o.name} primaryTypographyProps={{ variant: 'caption', fontWeight: 600 }} />
            </ListItemButton>
          ))}
        </List>
      </Collapse>
    </Box>
  );
}

export default function WorkspaceSidebar() {
  const { orgId } = useParams<{ orgId: string }>();
  const location = useLocation();
  const navigate = useNavigate();
  const { org, renameOrg } = useOrg();
  const { data: repos } = useConnectedRepos(org?.id);
  // Sidebar gets the dark-indigo Fuse chrome ONLY when the user is
  // in LIGHT mode (the navbar is intentional brand contrast against
  // a light content area). In dark mode the sidebar should follow
  // the main theme — no need to paint a different shade of dark on
  // top of dark, that just reads as "two dark surfaces colliding".
  const mainTheme = useTheme();
  const sidebarTheme = mainTheme.palette.mode === 'light' ? navbarTheme : mainTheme;
  // Capabilities decide which nav items render. The backend
  // (/api/v1/me/capabilities) is the policy source; we just gate
  // rendering. While the request is in flight `canSeePage` returns
  // false for everything — the sidebar shows the always-on items
  // (dashboard / projects / settings) plus a small skeleton, instead
  // of flashing inaccessible items.
  const caps = useCapabilities(org?.id);
  const projectCaps = useProjectCapabilities(org?.id);
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState('');
  const editRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing && editRef.current) {
      editRef.current.focus();
      editRef.current.select();
    }
  }, [editing]);

  function confirmRename() {
    const name = editName.trim();
    if (name && name !== org?.name) renameOrg(name);
    setEditing(false);
  }

  const base = `/projects/${orgId}`;
  const currentPath = location.pathname;
  const isActive = (path: string) => currentPath === `${base}/${path}` || currentPath.startsWith(`${base}/${path}/`);

  // Counts
  const repoCount = repos?.length ?? 0;
  // Warm the org health-summary cache so sibling views (Dashboard) mount
  // with data already resolved. Result intentionally unconsumed here.
  useQuery({
    queryKey: qk.repos.healthSummary(org?.id),
    queryFn: () => getOrgHealthSummary(org!.id),
    enabled: !!org?.id, staleTime: 60_000,
  });
  // Issue count from enriched issues endpoint (same source as IssuesView)
  const { data: issueCount } = useQuery({
    queryKey: qk.security.issuesEnriched(org?.id),
    queryFn: () => getEnrichedOrgIssues(org!.id),
    enabled: !!org?.id, staleTime: 60_000,
    select: (d) => d.issues?.filter(i => i.status === 'open').length ?? 0,
  });

  const { data: pentestProjects } = useQuery({
    queryKey: qk.pentest.projects(org?.id),
    queryFn: () => listPentestProjects(org!.id),
    enabled: !!org?.id, staleTime: 60_000,
  });
  const { data: attackSurface } = useQuery({
    queryKey: qk.attackSurface(org?.id),
    queryFn: () => listAttackSurface(org!.id),
    enabled: !!org?.id, staleTime: 60_000,
  });
  const { data: autofixData } = useQuery({
    queryKey: qk.autofix.findingsCount(org?.id),
    queryFn: () => listAutofixFindings(org!.id),
    enabled: !!org?.id, staleTime: 60_000,
  });
  // Same filter as AutofixView — exclude tier2-ai with no_preview
  const autofixCount = (autofixData?.findings ?? []).filter(
    (f: AutofixFindingRow) => !(f.rule_id === 'tier2-ai' && f.patch_status === 'no_preview')
  ).length;
  // Domain badge count. Canonical source is the kernel-backed
  // /attack-surface handler's top-level `count` (68e2e78) — same store
  // as Asset Map, which is what reconciles the old sidebar(=pentest
  // projects) / page / asset-map three-way mismatch. Falls back to the
  // legacy projects+resolving-subs heuristic only if the engine predates
  // that field (the legacy path also can't work post-convergence anyway,
  // since kernel domain rows no longer carry `metadata.resolves`).
  const projectDomains = new Set((pentestProjects?.projects ?? []).map(p => p.target_url.replace(/^https?:\/\//, '').replace(/\/.*$/, '')));
  const resolvingSubs = (attackSurface?.assets ?? []).filter(a => {
    if (a.asset_type !== 'subdomain') return false;
    try { return JSON.parse(a.metadata).resolves && !projectDomains.has(a.value); } catch { return false; }
  });
  const domainCount = attackSurface?.count ?? (projectDomains.size + resolvingSubs.length);

  return (
    <ThemeProvider theme={sidebarTheme}>
    <Box data-testid="workspace-sidebar" component="nav" aria-label={t('sidebar.navLabel')} sx={{
      width: { xs: 52, sm: 260 }, flexShrink: 0,
      boxSizing: 'border-box',
      position: 'relative',
      zIndex: 0,
      minHeight: 0, overflow: 'hidden',
      borderRight: '1px solid', borderColor: 'divider',
      // Light mode → sidebarTheme = navbarTheme (dark-indigo Fuse
      //                chrome, theme tokens resolve to dark-mode values).
      // Dark mode  → sidebarTheme = mainTheme (same as content,
      //                so the whole UI is one cohesive dark surface
      //                instead of "purple-dark on neutral-dark").
      bgcolor: 'background.paper',
      color: 'text.primary',
      display: 'flex', flexDirection: 'column',
    }}>
      {/* Logo — click to go back to projects */}
      <Box
        onClick={() => navigate('/projects')}
        {...clickableA11y(() => navigate('/projects'), { label: t('sidebar.backToProjects') })}
        sx={{
          px: { xs: 0.75, sm: 2 }, py: 1.5,
          display: 'flex', alignItems: 'center', justifyContent: { xs: 'center', sm: 'flex-start' }, gap: 1.5,
          cursor: 'pointer',
          borderBottom: '1px solid', borderColor: 'divider',
          '&:hover': { bgcolor: 'action.hover' },
        }}
      >
        <img src="/favicon.svg" alt="Warroom" style={{ width: 28, height: 28 }} />
        <Typography variant="body1" fontWeight={700} sx={{ display: { xs: 'none', sm: 'block' }, letterSpacing: 0 }}>
          <span style={{ color: '#a78bfa' }}>War</span>room
        </Typography>
      </Box>

      {/* Org header + switcher */}
      <Box sx={{ display: { xs: 'none', sm: 'block' }, p: 2, borderBottom: '1px solid', borderColor: 'divider' }}>
        {editing ? (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <input
              ref={editRef}
              value={editName}
              aria-label={t('sidebar.orgNameInput')}
              onChange={(e) => setEditName(e.target.value)}
              onKeyDown={(e) => {
                if (e.nativeEvent.isComposing) return;
                if (e.key === 'Enter') confirmRename();
                if (e.key === 'Escape') setEditing(false);
              }}
              style={{
                flex: 1, background: 'transparent', border: '1px solid', borderColor: 'var(--mui-palette-divider, rgba(255,255,255,0.15))',
                borderRadius: 6, padding: '4px 8px', color: 'inherit', fontSize: 14, outline: 'none',
              }}
            />
            <IconButton size="small" aria-label={t('sidebar.confirmRename')} onClick={confirmRename}><Check size={14} /></IconButton>
            <IconButton size="small" aria-label={t('sidebar.cancelRename')} onClick={() => setEditing(false)}><X size={14} /></IconButton>
          </Box>
        ) : (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Typography variant="subtitle2" fontWeight={700} noWrap sx={{ flex: 1 }}>
              {org?.name ?? t('common.loading')}
            </Typography>
            {org && (
              <IconButton size="small" aria-label={t('sidebar.editOrgName')} onClick={() => { setEditName(org.name); setEditing(true); }}>
                <Pencil size={12} />
              </IconButton>
            )}
          </Box>
        )}
        <OrgSwitcher currentOrgId={orgId} />
      </Box>

      {/* Search */}
      <Box sx={{ display: { xs: 'none', sm: 'block' }, px: 1.5, py: 1 }}>
        <TextField
          placeholder={t('quick.search')}
          size="small"
          fullWidth
          InputProps={{
            startAdornment: <InputAdornment position="start"><Search size={14} /></InputAdornment>,
          }}
          sx={{
            '& .MuiOutlinedInput-root': {
              borderRadius: 2, fontSize: '0.8rem',
              bgcolor: 'action.hover',
              color: 'text.primary',
              // Close the notch + flush the fieldset. The TextField
              // has no `label` prop so the legend slot is empty,
              // but browser defaults rendered a faint line across
              // the top of the outlined input — combined with
              // polish.css's global focus outline (now scoped to
              // non-MUI inputs) this produced the "double-border"
              // look reported 2026-05-19.
              '& fieldset': { top: 0, borderColor: 'divider' },
              '& legend': { display: 'none' },
              '&:hover fieldset': { borderColor: 'text.disabled' },
            },
            '& .MuiInputBase-input::placeholder': { color: 'text.secondary', opacity: 1 },
            '& .MuiInputAdornment-root': { color: 'text.secondary' },
          }}
        />
      </Box>

      {/* Nav body — each item gated by capabilities.visible_pages.
          The empty-section guards below collapse a category (e.g.
          "SECURITY") when none of its pages are visible, so a CTEM-
          only customer doesn't see an empty "SECURITY" header. */}
      <Box sx={{ flex: 1, minHeight: 0, overflow: 'auto', overflowX: 'hidden', pb: 2 }}>
        {/* Sidebar nav is generated from the MODULES manifest
            (types/modules.ts). Groups render in SIDEBAR_GROUP_ORDER;
            each group's items in the order they appear in MODULES.
            Skip the `admin` group (renders at the bottom; pinned)
            and the `hidden` group (routed-only, no nav entry).
            Empty groups (zero visible items after capability gate)
            collapse out entirely so a code-only customer doesn't
            see an empty "EXPOSURE" header.

            Adding a new module = add one entry to MODULES; sidebar
            picks it up automatically. No more dual-edit between
            this file + the route registry + the full-bleed list. */}

        {/* While capabilities are still loading, `canSeePage` fails closed.
            Gate on `caps.ready`: show a stable skeleton during the brief
            load instead of flashing inaccessible items or rendering an empty
            policy-derived nav. */}
        {!caps.ready || !projectCaps.ready ? (
          <NavSkeleton />
        ) : (
        SIDEBAR_GROUP_ORDER.filter(g => g.id !== 'admin').map(group => {
          const items = getModulesByGroup(group.id).filter(m =>
            caps.canOpenPage(m.capability ?? m.id) && projectCaps.canOpenPage(m.capability ?? m.id),
          )
          if (items.length === 0) return null
          return (
            <Box key={group.id}>
              {group.showHeader && (
                <Typography variant="caption" sx={{ px: 2.5, py: 0.5, display: { xs: 'none', sm: 'block' }, color: 'text.secondary', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', mt: 1 }}>
                  {tOr(group.headerKey, group.headerFallback)}
                </Typography>
              )}
              <List dense disablePadding sx={!group.showHeader ? { pt: 0.5 } : undefined}>
                {items.map(mod => {
                  const Icon = mod.sidebar!.icon
                  const pageId = mod.capability ?? mod.id
                  const pageState = caps.pageState(pageId)
                  const locked = pageState.state === 'locked_preview'
                  const count = resolveCount(mod.sidebar!.count, {
                    issues: issueCount,
                    autofix: autofixCount,
                    repos: repoCount,
                    domains: domainCount,
                  })
                  return (
                    <NavItem
                      key={mod.id}
                      icon={Icon}
                      label={tOr(mod.sidebar!.labelKey, mod.sidebar!.fallback)}
                      count={count}
                      to={`${base}/${navPath(mod.path)}`}
                      active={isActive(navPath(mod.path))}
                      locked={locked}
                      lockReason={pageState.reason}
                      dim={locked}
                    />
                  )
                })}
              </List>
            </Box>
          )
        })
        )}

        {/* Single modern nav — the legacy below-the-divider war-room
            accordion (Architecture + Code Scans) was collapsed into
            first-class MODULES entries in the `code` group on
            2026-06-05. Those technical surfaces now render through the
            same WarRoomView engine via /architecture/* + /code-scans/*
            with an inner sub-tab nav. Old /warroom/:sectionId
            bookmarks still resolve via WarRoomDispatch (route.tsx). */}
      </Box>

      {/* Bottom nav — pinned. Driven from MODULES (admin group)
          so adding/removing an admin item is one edit. Capability
          gate honoured per entry. */}
      <Box sx={{ flexShrink: 0, borderTop: '1px solid', borderColor: 'divider', px: 0.5, py: 0.5 }}>
        {getModulesByGroup('admin')
          .filter(m => caps.canOpenPage(m.capability ?? m.id) && projectCaps.canOpenPage(m.capability ?? m.id))
          .map(mod => {
            const Icon = mod.sidebar!.icon
            const pageId = mod.capability ?? mod.id
            const pageState = caps.pageState(pageId)
            const locked = pageState.state === 'locked_preview'
            return (
              <NavItem
                key={mod.id}
                icon={Icon}
                label={tOr(mod.sidebar!.labelKey, mod.sidebar!.fallback)}
                to={`${base}/${navPath(mod.path)}`}
                active={isActive(navPath(mod.path))}
                locked={locked}
                lockReason={pageState.reason}
                dim={locked}
              />
            )
          })}
      </Box>
    </Box>
    </ThemeProvider>
  );
}

// resolveCount — render-time lookup from a module's declared
// `count` slot ("issues" / "autofix" / "repos" / "domains") to the
// matching live query result. Returns undefined when no slot is
// declared (no count chip) or when the count is zero (avoid an
// empty "0" badge cluttering the row).
function resolveCount(
  slot: CountSlot | undefined,
  counts: { issues?: number; autofix?: number; repos?: number; domains?: number },
): number | undefined {
  if (!slot) return undefined
  const v = counts[slot]
  return v && v > 0 ? v : undefined
}

// navbarTheme — local theme that paints the sidebar in the Fuse
// defaultNavbar dark-indigo palette regardless of the user's
// content-area light/dark choice. Built once at module scope so
// every render reuses the same instance.
const navbarTheme = createTheme(themesConfig.defaultNavbar as Parameters<typeof createTheme>[0]);
