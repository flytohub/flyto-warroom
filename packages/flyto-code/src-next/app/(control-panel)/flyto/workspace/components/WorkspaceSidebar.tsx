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
  ChevronsLeft, ChevronsRight,
  ShieldCheck, GitBranch, Shield, Gauge, Cloud, RadioTower,
  Fingerprint, Database, Clock, BarChart3, HeartPulse, Building,
} from 'lucide-react';
import _ from 'lodash';
import {
  SIDEBAR_GROUP_ORDER,
  getModulesByGroup,
  navPath,
} from '@code/modules';
import type { CountSlot } from '@code/Module';
import { t, tOr } from '@lib/i18n';
import { clickableA11y } from '@lib/a11y';
import useFuseLayoutSettings from '@components/adapters/useLayoutSettings';
import useFuseSettings from '@components/adapters/useFuseSettings';
import { useOrg, useConnectedRepos } from '@hooks/useOrg';
import { useCapabilities } from '@hooks/useCapabilities';
import { useProjectCapabilities } from '@hooks/useProjectCapabilities';
import { useQuery } from '@tanstack/react-query';
import { getOrgHealthSummary, getEnrichedOrgIssues, listPentestProjects, listAttackSurface, listAutofixFindings, listOrgs, type AutofixFindingRow } from '@lib/engine';
import { extractHostFromAssetValue, getExternalPostureKernel } from '@compounds/_shared/externalPosture';

const SIDEBAR_EXPANDED_WIDTH = 312;
const SIDEBAR_COLLAPSED_WIDTH = 76;
const CATEGORY_RAIL_WIDTH = 74;

const GROUP_NAV_META: Record<string, { icon: typeof LayoutDashboard; fallback: string }> = {
  overview: { icon: ShieldCheck, fallback: '總覽' },
  assets: { icon: GitBranch, fallback: '資產' },
  code: { icon: Shield, fallback: '程式碼' },
  exposure: { icon: Gauge, fallback: '外部曝險' },
  cloud: { icon: Cloud, fallback: '雲端' },
  runtime: { icon: RadioTower, fallback: 'AI 防護' },
  identity: { icon: Fingerprint, fallback: '身分' },
  darkweb: { icon: Database, fallback: '情資' },
  history: { icon: Clock, fallback: '歷史' },
  scoring: { icon: BarChart3, fallback: '評分' },
  operations: { icon: HeartPulse, fallback: '維運' },
  enterprise: { icon: Building, fallback: '企業' },
};

/* ── Nav item ── */
function NavItem({
  icon: Icon, label, count, to, active, dim, locked, lockReason, collapsed = false,
}: {
  icon: typeof LayoutDashboard;
  label: string;
  count?: number;
  to: string;
  active: boolean;
  dim?: boolean;
  locked?: boolean;
  lockReason?: string;
  collapsed?: boolean;
}) {
  const navigate = useNavigate();
  const tooltipTitle = collapsed
    ? `${label}${count ? ` (${count})` : ''}${locked ? ` - ${lockReason || t('sidebar.lockedPreview')}` : ''}`
    : '';
  const lockNode = (
    <Box
      component="span"
      sx={{
        display: collapsed ? 'inline-flex' : { xs: 'none', sm: 'inline-flex' },
        alignItems: 'center',
        justifyContent: 'center',
        ml: collapsed ? 0 : 0.5,
        color: 'text.secondary',
        position: collapsed ? 'absolute' : 'static',
        right: collapsed ? 5 : undefined,
        bottom: collapsed ? 3 : undefined,
      }}
    >
      <LockKeyhole size={13} />
    </Box>
  );
  return (
    <Tooltip title={tooltipTitle} placement="right" disableInteractive={!collapsed}>
      <ListItemButton
        aria-label={label}
        selected={active}
        onClick={() => navigate(to)}
        sx={{
          px: collapsed ? 0 : { xs: 1, sm: 2 },
          py: 0.6,
          borderRadius: 1.5,
          mx: collapsed ? 1 : { xs: 0.75, sm: 1 },
          mb: 0.25,
          width: 'auto',
          maxWidth: { xs: 'calc(100% - 12px)', sm: 'none' },
          minHeight: 34,
          overflow: 'hidden',
          boxSizing: 'border-box',
          justifyContent: collapsed ? 'center' : { xs: 'center', sm: 'flex-start' },
          position: 'relative',
          opacity: dim ? 0.45 : 1,
          '&.Mui-selected': { bgcolor: 'rgba(139,92,246,0.12)' },
          '&.Mui-selected:hover': { bgcolor: 'rgba(139,92,246,0.18)' },
        }}
      >
        <ListItemIcon sx={{ minWidth: collapsed ? 0 : { xs: 0, sm: 32 }, color: active ? 'primary.main' : 'text.secondary', justifyContent: 'center' }}>
          <Icon size={16} />
        </ListItemIcon>
        <ListItemText
          primary={label}
          primaryTypographyProps={{ variant: 'body2', fontWeight: active ? 600 : 400, noWrap: true, color: 'text.primary' }}
          sx={{ display: collapsed ? 'none' : { xs: 'none', sm: 'block' } }}
        />
        {!collapsed && count !== undefined && count > 0 && (
          <Chip
            label={count}
            size="small"
            sx={{
              display: { xs: 'none', sm: 'inline-flex' },
              height: 18,
              fontSize: 12,
              bgcolor: 'action.selected',
              color: 'primary.main',
            }}
          />
        )}
        {locked && (
          collapsed ? lockNode : (
            <Tooltip title={lockReason || t('sidebar.lockedPreview')}>
              {lockNode}
            </Tooltip>
          )
        )}
      </ListItemButton>
    </Tooltip>
  );
}

/** Placeholder rendered while capabilities resolve, so the nav doesn't
 *  flash an empty or stale module subset before settling on the backend
 *  capability snapshot. Mimics a couple of grouped nav rows. */
function NavSkeleton({ collapsed = false }: { collapsed?: boolean }) {
  const rows = [3, 2, 4]; // items per faux-group
  return (
    <Box aria-hidden sx={{ px: collapsed ? 1 : { xs: 0.75, sm: 1 }, pt: 1 }}>
      {rows.map((count, g) => (
        <Box key={g} sx={{ mb: 1.5 }}>
          <Skeleton
            variant="text"
            width={64}
            sx={{ mx: { xs: 'auto', sm: 1.5 }, mb: 0.5, display: collapsed ? 'none' : { xs: 'none', sm: 'block' } }}
          />
          {Array.from({ length: count }).map((_, i) => (
            <Box key={i} sx={{ display: 'flex', alignItems: 'center', justifyContent: collapsed ? 'center' : 'flex-start', gap: 1, px: collapsed ? 0 : { xs: 1, sm: 2 }, py: 0.7 }}>
              <Skeleton variant="rounded" width={16} height={16} sx={{ flexShrink: 0 }} />
              <Skeleton variant="text" sx={{ flex: 1, display: collapsed ? 'none' : { xs: 'none', sm: 'block' } }} />
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

function isConfirmedAttackSurfaceDomain(row: { review_status?: string; tier?: string; confidence?: number }): boolean {
  const review = row.review_status?.toLowerCase()
  if (review) return review === 'auto_confirmed' || review === 'confirmed' || review === 'verified'
  const tier = row.tier?.toLowerCase()
  if (tier && tier !== 'unranked') return tier === 'confirmed'
  return (row.confidence ?? 0) >= 100
}

function isCountedKernelDomain(row: { current_tier?: string }): boolean {
  const tier = row.current_tier?.toLowerCase()
  if (!tier || tier === 'unranked' || tier === 'confirmed') return true
  return !['candidate', 'lead', 'weak', 'rejected', 'suppressed', 'noise'].includes(tier)
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
  const { config } = useFuseLayoutSettings();
  const { setSettings } = useFuseSettings();
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
  const [activeGroupId, setActiveGroupId] = useState<string>('overview');
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
  const sidebarCollapsed = Boolean(config?.navbar?.folded);
  const toggleSidebarCollapsed = () => {
    setSettings(_.set({}, 'layout.config.navbar.folded', !sidebarCollapsed));
  };
  const toggleLabel = sidebarCollapsed ? t('common.expand') : t('common.collapse');

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
  const { data: domainKernel } = useQuery({
    queryKey: qk.externalPostureKernel(org?.id),
    queryFn: () => getExternalPostureKernel(org!.id),
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
  // Domain badge count mirrors DomainsView: external-posture/kernel is the
  // confirmed inventory source, while pentest projects are only merged in as
  // explicit targets. The legacy attack-surface count remains a last fallback.
  const projectDomains = new Set(
    (pentestProjects?.projects ?? [])
      .map(p => extractHostFromAssetValue(p.target_url))
      .filter(Boolean),
  );
  const resolvingSubs = (attackSurface?.assets ?? []).filter(a => {
    if (a.asset_type !== 'subdomain') return false;
    try { return JSON.parse(a.metadata).resolves && !projectDomains.has(a.value); } catch { return false; }
  });
  const domainSignals = attackSurface?.domains ?? [];
  const discoveredDomainCount = domainSignals.length > 0
    ? domainSignals.filter(isConfirmedAttackSurfaceDomain).length
    : attackSurface?.count ?? resolvingSubs.length;
  const kernelDomains = new Set(
    (domainKernel?.assets ?? [])
      .filter(isCountedKernelDomain)
      .map(asset => extractHostFromAssetValue(asset.canonical_value))
      .filter(Boolean),
  )
  const kernelDomainCount = domainKernel
    ? kernelDomains.size > 0
      ? new Set([...kernelDomains, ...projectDomains]).size
      : Math.max(domainKernel.asset_count ?? 0, projectDomains.size)
    : undefined
  const domainCount = kernelDomainCount ?? (projectDomains.size > 0 ? projectDomains.size : discoveredDomainCount);
  const visibleGroups = caps.ready && projectCaps.ready
    ? SIDEBAR_GROUP_ORDER.filter(group => group.id !== 'admin').map(group => ({
      ...group,
      label: group.showHeader
        ? tOr(group.headerKey, group.headerFallback)
        : GROUP_NAV_META[group.id]?.fallback ?? '總覽',
      items: getModulesByGroup(group.id).filter(m =>
        caps.canOpenPage(m.capability ?? m.id) && projectCaps.canOpenPage(m.capability ?? m.id),
      ),
    })).filter(group => group.items.length > 0)
    : [];
  const currentGroupId = visibleGroups.find(group =>
    group.items.some(mod => isActive(navPath(mod.path))),
  )?.id;

  useEffect(() => {
    if (currentGroupId) setActiveGroupId(currentGroupId);
  }, [currentGroupId]);

  const activeGroup = visibleGroups.find(group => group.id === activeGroupId)
    ?? visibleGroups.find(group => group.id === currentGroupId)
    ?? visibleGroups[0];

  return (
    <ThemeProvider theme={sidebarTheme}>
    <Box data-testid="workspace-sidebar" component="nav" aria-label={t('sidebar.navLabel')} sx={{
      width: { xs: 52, sm: sidebarCollapsed ? SIDEBAR_COLLAPSED_WIDTH : SIDEBAR_EXPANDED_WIDTH }, flexShrink: 0,
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
      transition: theme => theme.transitions.create('width', {
        duration: theme.transitions.duration.shorter,
        easing: theme.transitions.easing.easeInOut,
      }),
    }}>
      {/* Logo — click to go back to projects */}
      <Box
        sx={{
          px: sidebarCollapsed ? { xs: 0.75, sm: 0.75 } : { xs: 0.75, sm: 1.5 },
          py: sidebarCollapsed ? { xs: 1.25, sm: 1.35 } : 1.25,
          minHeight: { xs: 58, sm: sidebarCollapsed ? 88 : 58 },
          display: 'flex',
          alignItems: 'center',
          justifyContent: { xs: 'center', sm: sidebarCollapsed ? 'center' : 'space-between' },
          flexDirection: { xs: 'row', sm: sidebarCollapsed ? 'column' : 'row' },
          gap: sidebarCollapsed ? { xs: 1, sm: 1.25 } : 1,
          borderBottom: '1px solid', borderColor: 'divider',
        }}
      >
        <Tooltip title={sidebarCollapsed ? 'Warroom' : ''} placement="right">
          <Box
            onClick={() => navigate('/projects')}
            {...clickableA11y(() => navigate('/projects'), { label: t('sidebar.backToProjects') })}
            sx={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: sidebarCollapsed ? 'center' : 'flex-start',
              gap: 1.5,
              minWidth: 0,
              flex: sidebarCollapsed ? '0 0 auto' : 1,
              px: sidebarCollapsed ? 0 : 0.5,
              py: 0.5,
              borderRadius: 1.5,
              cursor: 'pointer',
              '&:hover': { bgcolor: 'action.hover' },
            }}
          >
            <img src="/favicon.svg" alt="Warroom" style={{ width: 28, height: 28 }} />
            <Typography variant="body1" fontWeight={700} sx={{ display: sidebarCollapsed ? 'none' : { xs: 'none', sm: 'block' }, letterSpacing: 0 }}>
              <span style={{ color: '#a78bfa' }}>War</span>room
            </Typography>
          </Box>
        </Tooltip>
        <Tooltip title={toggleLabel}>
          <IconButton
            size="small"
            aria-label={toggleLabel}
            aria-pressed={sidebarCollapsed}
            onClick={toggleSidebarCollapsed}
            sx={{
              display: { xs: 'none', sm: 'inline-flex' },
              width: sidebarCollapsed ? 36 : 34,
              height: sidebarCollapsed ? 28 : 30,
              flexShrink: 0,
              color: sidebarCollapsed ? '#c4b5fd' : 'text.secondary',
              bgcolor: sidebarCollapsed ? 'rgba(255,255,255,0.055)' : 'rgba(255,255,255,0.035)',
              background: sidebarCollapsed
                ? 'linear-gradient(180deg, rgba(255,255,255,0.075), rgba(255,255,255,0.035))'
                : 'rgba(255,255,255,0.035)',
              border: '1px solid',
              borderColor: sidebarCollapsed ? 'rgba(196,181,253,0.24)' : 'rgba(196,181,253,0.16)',
              borderRadius: 1.25,
              boxShadow: sidebarCollapsed
                ? 'inset 0 1px 0 rgba(255,255,255,0.1)'
                : 'inset 0 1px 0 rgba(255,255,255,0.06)',
              position: 'relative',
              overflow: 'hidden',
              '&::before': sidebarCollapsed ? {
                content: '""',
                position: 'absolute',
                left: 5,
                top: 7,
                bottom: 7,
                width: 2,
                borderRadius: 1,
                bgcolor: 'rgba(34,211,238,0.72)',
                pointerEvents: 'none',
              } : undefined,
              '& svg': {
                ml: sidebarCollapsed ? 0.5 : 0,
                filter: 'none',
              },
              '&:hover': sidebarCollapsed ? {
                bgcolor: 'rgba(255,255,255,0.08)',
                background: 'linear-gradient(180deg, rgba(255,255,255,0.105), rgba(255,255,255,0.045))',
                borderColor: 'rgba(34,211,238,0.42)',
                color: '#ede9fe',
                boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.14)',
              } : {
                bgcolor: 'rgba(255,255,255,0.07)',
                borderColor: 'rgba(196,181,253,0.28)',
              },
            }}
          >
            {sidebarCollapsed ? <ChevronsRight size={17} strokeWidth={2.4} /> : <ChevronsLeft size={17} />}
          </IconButton>
        </Tooltip>
      </Box>

      {/* Org header + switcher */}
      <Box sx={{ display: sidebarCollapsed ? 'none' : { xs: 'none', sm: 'block' }, p: 2, borderBottom: '1px solid', borderColor: 'divider' }}>
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
      <Box sx={{ display: sidebarCollapsed ? 'none' : { xs: 'none', sm: 'block' }, px: 1.5, py: 1 }}>
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
      <Box sx={{ flex: 1, minHeight: 0, overflow: 'hidden', pb: 1 }}>
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
          <NavSkeleton collapsed={sidebarCollapsed} />
        ) : sidebarCollapsed ? (
          <Box sx={{ minHeight: 0, height: '100%', overflow: 'auto', overflowX: 'hidden', py: 0.5 }}>
            {visibleGroups.map(group => group.items.map(mod => {
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
                  collapsed
                />
              )
            }))}
          </Box>
        ) : (
          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: `${CATEGORY_RAIL_WIDTH}px minmax(0, 1fr)`,
              gap: 1.25,
              minHeight: 0,
              height: '100%',
              px: 0.9,
            }}
          >
            <Box
              sx={{
                minHeight: 0,
                overflow: 'auto',
                overflowX: 'hidden',
                px: 0.2,
                py: 0.6,
                borderRight: '1px solid',
                borderColor: 'rgba(196,181,253,0.12)',
              }}
            >
              {visibleGroups.map(group => {
                const meta = GROUP_NAV_META[group.id] ?? { icon: LayoutDashboard, fallback: group.label }
                const Icon = meta.icon
                  const active = activeGroup?.id === group.id
                  const railLabel = meta.fallback
                return (
                  <Tooltip key={group.id} title={group.label} placement="right">
                    <ListItemButton
                      aria-label={group.label}
                      selected={active}
                      onClick={() => setActiveGroupId(group.id)}
                      sx={{
                        minHeight: 54,
                        width: 62,
                        mb: 0.45,
                        px: 0.35,
                        py: 0.55,
                        borderRadius: 1.5,
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 0.45,
                        position: 'relative',
                        color: active ? '#f8fafc' : 'rgba(226,232,240,0.66)',
                        bgcolor: active ? 'rgba(139,92,246,0.18)' : 'transparent',
                        border: '1px solid',
                        borderColor: active ? 'rgba(167,139,250,0.22)' : 'transparent',
                        boxShadow: active
                          ? 'inset 0 1px 0 rgba(255,255,255,0.09)'
                          : 'none',
                        '&::before': active ? {
                          content: '""',
                          position: 'absolute',
                          left: -4,
                          top: 10,
                          bottom: 10,
                          width: 3,
                          borderRadius: 2,
                          bgcolor: '#a78bfa',
                          boxShadow: '0 0 10px rgba(167,139,250,0.36)',
                        } : undefined,
                        '&.Mui-selected': { bgcolor: 'rgba(139,92,246,0.18)' },
                        '&.Mui-selected:hover': { bgcolor: 'rgba(139,92,246,0.22)' },
                        '&:hover': { bgcolor: 'rgba(255,255,255,0.07)', color: '#f8fafc' },
                      }}
                    >
                      <Icon size={18} />
                      <Typography
                        variant="caption"
                        sx={{
                          maxWidth: 54,
                          fontSize: 10.5,
                          fontWeight: active ? 800 : 700,
                          lineHeight: 1.05,
                          textAlign: 'center',
                          overflow: 'hidden',
                          display: '-webkit-box',
                          WebkitLineClamp: 2,
                          WebkitBoxOrient: 'vertical',
                        }}
                      >
                          {railLabel}
                      </Typography>
                    </ListItemButton>
                  </Tooltip>
                )
              })}
            </Box>
            <Box
              sx={{
                minHeight: 0,
                overflow: 'auto',
                overflowX: 'hidden',
                py: 0.65,
                pr: 0.2,
              }}
            >
              {activeGroup && (
                <Box
                  sx={{
                    overflow: 'hidden',
                    borderRadius: 1.25,
                    bgcolor: 'rgba(255,255,255,0.026)',
                    border: '1px solid',
                    borderColor: 'rgba(196,181,253,0.085)',
                    boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.035)',
                  }}
                >
                  <Box
                    sx={{
                      px: 1.25,
                      py: 0.8,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: 1,
                      borderBottom: '1px solid',
                      borderColor: 'rgba(196,181,253,0.075)',
                      background: 'linear-gradient(90deg, rgba(139,92,246,0.075), rgba(139,92,246,0.015))',
                    }}
                  >
                    <Box sx={{ minWidth: 0, display: 'flex', alignItems: 'center', gap: 0.9 }}>
                      <Typography
                        variant="subtitle2"
                        sx={{
                          color: 'text.primary',
                          fontWeight: 850,
                          lineHeight: 1.15,
                          letterSpacing: 0,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {activeGroup.label}
                      </Typography>
                    </Box>
                    <Chip
                      label={activeGroup.items.length}
                      size="small"
                      sx={{
                        height: 20,
                        minWidth: 28,
                        fontSize: 11,
                        bgcolor: 'rgba(255,255,255,0.08)',
                        color: 'rgba(226,232,240,0.88)',
                        fontWeight: 850,
                        flexShrink: 0,
                      }}
                    />
                  </Box>
                  <Box sx={{ maxHeight: 'calc(100vh - 285px)', overflow: 'auto', overflowX: 'hidden', py: 0.45 }}>
                    <List dense disablePadding>
                      {activeGroup.items.map(mod => {
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
                </Box>
              )}
            </Box>
          </Box>
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
                collapsed={sidebarCollapsed}
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
