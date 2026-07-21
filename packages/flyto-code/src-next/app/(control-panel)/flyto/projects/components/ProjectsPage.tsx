import { qk } from '@lib/queryKeys'
import { useState, useMemo } from 'react';
import { keyframes } from '@emotion/react';
import { useNavigate } from 'react-router';
import { useQuery, useQueries, useMutation, useQueryClient } from '@tanstack/react-query';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import TextField from '@mui/material/TextField';
import Paper from '@mui/material/Paper';
import Box from '@mui/material/Box';
import CircularProgress from '@mui/material/CircularProgress';
import Alert from '@mui/material/Alert';
import {
  Plus, Radar, Users, AlertTriangle,
  Shield, Globe, Search, Flame, CheckCircle2,
} from 'lucide-react';
import { useAuth } from '@hooks/useAuth';
import { listOrgs, deleteOrg, getOrgHealthSummary, type Organization, type ProjectType } from '@lib/engine';
import { t } from '@lib/i18n';
import { PulseTile } from './PulseTile';
import { OrgCard } from './OrgCard';
import { CreateProjectWizard } from './CreateProjectWizard';
import { PlatformCoverage } from './PlatformCoverage';
import { CosmicBackground } from './CosmicBackground';
import { CommunityProductLoopPanel } from '@compounds/onboarding/CommunityProductLoopPanel';

// Drifting aurora blobs behind the hero — ambient "tech" motion.
const auroraA = keyframes`
  0%, 100% { transform: translate3d(0,0,0) scale(1); }
  50%      { transform: translate3d(-6%, 5%, 0) scale(1.18); }
`;
const auroraB = keyframes`
  0%, 100% { transform: translate3d(0,0,0) scale(1.12); }
  50%      { transform: translate3d(8%, -6%, 0) scale(1); }
`;

// formatTimeAgo — "2h ago" / "3d ago" / "just now". Used on OrgCard
// to surface scan recency without burning a row on a full timestamp.
function formatTimeAgo(dateStr: string | undefined): string {
  if (!dateStr) return '';
  const diff = Date.now() - new Date(dateStr).getTime();
  if (diff < 0) return '';
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return `${Math.floor(days / 30)}mo ago`;
}

// PulseTile extracted to ./PulseTile.tsx (2026-05-19)

const PROJECT_TYPE_COLOR = '#7c3aed';

// SeverityDot + OrgCard extracted to ./OrgCard.tsx (2026-05-19)
// — kept as one file because SeverityDot is only used inside OrgCard.


/* ── Main Page ── */
function ProjectsPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const [creating, setCreating] = useState(false);
  const [createPreset, setCreatePreset] = useState<ProjectType>('all');
  const [createModule, setCreateModule] = useState<string | undefined>(undefined);
  const [wizardKey, setWizardKey] = useState(0);
  const [deleteTarget, setDeleteTarget] = useState<Organization | null>(null);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');

  // Each open bumps the key so the wizard remounts fresh and re-seeds
  // its module selection from the preset (avoids setState-in-effect).
  const openCreateDialog = (preset?: ProjectType) => {
    setCreatePreset(preset ?? 'all');
    setCreateModule(undefined);
    setWizardKey((k) => k + 1);
    setCreating(true);
  };
  // Open pre-selecting a single specific module — used by the Platform
  // Coverage tiles, where every surface (incl. mcp/container/dark_web/
  // vuln_mgmt/identity) must seed itself, not collapse to the 'all' preset.
  const openCreateForModule = (moduleId: string) => {
    setCreateModule(moduleId);
    setWizardKey((k) => k + 1);
    setCreating(true);
  };
  const closeCreateDialog = () => setCreating(false);

  const { data, isLoading } = useQuery({
    queryKey: qk.platform.orgs(),
    queryFn: listOrgs,
    enabled: !!user,
  });

  const deleteMut = useMutation({
    mutationFn: async (id: string) => {
      try { return await deleteOrg(id); }
      catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (/\b404\b/.test(msg) || /not found/i.test(msg)) return undefined;
        throw e;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.platform.orgs() });
      setDeleteTarget(null);
      setDeleteConfirmText('');
    },
  });

  const orgs = data?.organizations ?? [];
  const greeting = user?.displayName || '';

  // Fan-out health-summary fetches across all orgs in parallel. React
  // Query dedupes against OrgCard's own fetch (same key), so this
  // costs zero extra HTTP — we just read the cached value to compute
  // a cross-org risk pulse for the hero tiles. Without this the
  // landing page is a static catalog; with it the page tells you
  // "you have 8 unattended criticals" the moment you log in.
  const healthQueries = useQueries({
    queries: orgs.map((o) => ({
      queryKey: qk.repos.healthSummary(o.id),
      queryFn: () => getOrgHealthSummary(o.id),
      staleTime: 60_000,
      enabled: (o.repoCount ?? 0) > 0,
    })),
  });

  const pulse = useMemo(() => {
    let critical = 0, high = 0, atRisk = 0, secure = 0, scanned = 0, total = 0;
    let latestScanAt: string | undefined;
    for (const q of healthQueries) {
      const d = q.data;
      if (!d) continue;
      const agg = d.aggregated;
      if (agg) {
        critical += agg.critical_count ?? 0;
        high += agg.high_count ?? 0;
        atRisk += agg.at_risk_count ?? 0;
        secure += agg.secure_count ?? 0;
      }
      scanned += d.scanned_count ?? 0;
      total += d.total_count ?? 0;
      // Pull the freshest scan timestamp across every repo of every
      // org. RepoHealthSummary doesn't have a typed `last_scan_at`
      // field on every backend version, so we read it as `any` and
      // null-coalesce; missing fields silently skip.
      for (const r of d.repos ?? []) {
        const rt = (r as unknown as { last_scan_at?: string }).last_scan_at;
        if (rt && (!latestScanAt || rt > latestScanAt)) latestScanAt = rt;
      }
    }
    return { critical, high, atRisk, secure, scanned, total, latestScanAt };
  }, [healthQueries]);

  return (
    <Box sx={{
      // overflowX hidden: the aurora blobs below intentionally bleed past
      // the left/right edges — clip them horizontally so they never create
      // a horizontal scrollbar; keep vertical scroll.
      flex: 1, overflowY: 'auto', overflowX: 'hidden', position: 'relative',
      // Drifting violet + blue aurora blobs — ambient motion that gives
      // the landing a live, "tech" feel without competing with content.
      // pointer-events:none so they never block a click; behind content.
      '&::before': {
        content: '""', position: 'absolute', top: '-12%', right: '-8%',
        width: 720, height: 720, borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(139,92,246,0.22), transparent 62%)',
        pointerEvents: 'none', zIndex: 0, willChange: 'transform',
        animation: `${auroraA} 19s ease-in-out infinite`,
      },
      '&::after': {
        content: '""', position: 'absolute', top: '8%', left: '-12%',
        width: 620, height: 620, borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(59,130,246,0.16), transparent 62%)',
        pointerEvents: 'none', zIndex: 0, willChange: 'transform',
        animation: `${auroraB} 24s ease-in-out infinite`,
      },
      '@media (prefers-reduced-motion: reduce)': {
        '&::before, &::after': { animation: 'none' },
      },
    }}>
      <CosmicBackground />
      <Box sx={{ maxWidth: 1100, mx: 'auto', px: { xs: 2, sm: 4 }, py: 5, position: 'relative', zIndex: 1 }}>

        {/* Hero */}
        <Box sx={{ mb: 4, display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 2 }}>
          <Box>
            <Typography variant="h4" fontWeight={800} className="tracking-tight">
              {greeting ? `${t('projects.welcome')}, ${greeting}` : t('projects.title')}
            </Typography>
            <Typography variant="body1" color="text.secondary" sx={{ mt: 0.5 }}>
              {pulse.latestScanAt
                ? `${t('projects.lastScan')} ${formatTimeAgo(pulse.latestScanAt)} · ${pulse.scanned}/${orgs.reduce((s, o) => s + (o.repoCount ?? 0), 0)} ${t('projects.reposScanned')}`
                : t('projects.subtitle')}
            </Typography>
          </Box>
          <Button
            variant="contained"
            size="large"
            startIcon={<Plus size={18} />}
            onClick={() => openCreateDialog()}
            sx={{
              borderRadius: 3, textTransform: 'none', fontWeight: 600, px: 4,
              background: 'linear-gradient(135deg, #7c3aed 0%, #3b82f6 100%)', boxShadow: 'none',
              '&:hover': { background: 'linear-gradient(135deg, #6d28d9 0%, #2563eb 100%)', boxShadow: 'none' },
            }}
          >
            {t('projects.create')}
          </Button>
        </Box>

        <Box sx={{ mb: 4 }}>
          <CommunityProductLoopPanel />
        </Box>

        {/* Risk Pulse tiles — replaces the flat "1 Projects 24 Repos
            1 Members" line with four live counters that change the
            user's posture toward the page. Colour is semantic: red /
            orange for finding severity, yellow for D+F-graded repos
            ("at risk"), green for A+B ("secure"). A tile with zero
            uses muted slate so the eye anchors on active ones. */}
        {orgs.length > 0 && (
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'repeat(2, 1fr)', sm: 'repeat(4, 1fr)' }, gap: 2, mb: 4 }}>
            <PulseTile
              icon={Flame}
              label={t('projects.critical')}
              value={pulse.critical}
              color="#ef4444"
              onClick={orgs.length === 1 ? () => navigate(`/projects/${orgs[0].id}/issues?severity=critical`) : undefined}
            />
            <PulseTile
              icon={AlertTriangle}
              label={t('projects.high')}
              value={pulse.high}
              color="#f97316"
              onClick={orgs.length === 1 ? () => navigate(`/projects/${orgs[0].id}/issues?severity=high`) : undefined}
            />
            <PulseTile
              icon={Shield}
              label={t('projects.atRiskRepos')}
              value={pulse.atRisk}
              color="#eab308"
              onClick={orgs.length === 1 ? () => navigate(`/projects/${orgs[0].id}/repos`) : undefined}
            />
            <PulseTile
              icon={CheckCircle2}
              label={t('projects.secureRepos')}
              value={pulse.secure}
              color="#22c55e"
              onClick={orgs.length === 1 ? () => navigate(`/projects/${orgs[0].id}/repos`) : undefined}
            />
          </Box>
        )}

        {/* Quick action cards — actionable shortcuts.
            Previously this row mirrored the Create-dialog project-type
            picker (3 cards that just opened the same dialog), which
            looked busy and did nothing the big "Create" button didn't.
            Now each card is a direct action: jump straight into the
            first repo, add a member, or add a domain. When there's no
            project yet we fall back to a single create-CTA per scope. */}
        <Typography variant="overline" color="text.secondary" sx={{ mb: 1.5, display: 'block', fontWeight: 600 }}>
          {t('projects.quickStart')}
        </Typography>
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr 1fr' }, gap: 2, mb: 4 }}>
          {(() => {
            const firstOrg = orgs[0];
            const hasOrg = !!firstOrg;
            const shortcuts = [
              {
                id: 'run-scan',
                icon: Search,
                title: t('projects.quick.runScan'),
                desc: hasOrg
                  ? t('projects.quick.runScanDesc')
                  : t('projects.quick.runScanEmpty'),
                onClick: hasOrg
                  ? () => navigate(`/projects/${firstOrg.id}/repos`)
                  : () => openCreateDialog('code'),
              },
              {
                id: 'invite-member',
                icon: Users,
                title: t('projects.quick.inviteMember'),
                desc: hasOrg
                  ? t('projects.quick.inviteMemberDesc')
                  : t('projects.quick.inviteMemberEmpty'),
                onClick: hasOrg
                  ? () => navigate(`/projects/${firstOrg.id}/settings?tab=members`)
                  : () => openCreateDialog('all'),
              },
              {
                id: 'add-domain',
                icon: Globe,
                title: t('projects.quick.addDomain'),
                desc: hasOrg
                  ? t('projects.quick.addDomainDesc')
                  : t('projects.quick.addDomainEmpty'),
                onClick: hasOrg
                  ? () => navigate(`/projects/${firstOrg.id}/domains`)
                  : () => openCreateDialog('ctem'),
              },
            ];
            return shortcuts.map((s) => {
              const Icon = s.icon;
              return (
                <Paper
                  key={s.id}
                  elevation={1}
                  className="rounded-xl cursor-pointer"
                  onClick={s.onClick}
                  sx={{
                    p: 2.5, border: 1, borderColor: 'divider',
                    transition: 'all 0.2s',
                    '&:hover': { borderColor: PROJECT_TYPE_COLOR, transform: 'translateY(-2px)' },
                  }}
                >
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                    <Box sx={{
                      width: 36, height: 36, borderRadius: 2,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      bgcolor: `${PROJECT_TYPE_COLOR}15`,
                    }}>
                      <Icon size={18} style={{ color: PROJECT_TYPE_COLOR }} />
                    </Box>
                    <Box>
                      <Typography variant="body2" fontWeight={600}>{s.title}</Typography>
                      <Typography variant="caption" color="text.secondary">{s.desc}</Typography>
                    </Box>
                  </Box>
                </Paper>
              );
            });
          })()}
        </Box>

        {/* Platform coverage — animated showcase of the full surface set
            (reflects the now-rich module catalogue, not a sparse row). */}
        <PlatformCoverage onPick={openCreateForModule} />

        {/* Loading */}
        {isLoading && (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 10 }}>
            <CircularProgress size={28} />
          </Box>
        )}

        {/* Empty */}
        {!isLoading && orgs.length === 0 && (
          <Paper elevation={0} className="rounded-2xl" sx={{ p: 6, textAlign: 'center', border: '2px dashed', borderColor: 'divider' }}>
            <Radar size={48} style={{ opacity: 0.2, marginBottom: 16 }} />
            <Typography variant="h6" fontWeight={600} sx={{ mb: 1 }}>
              {t('projects.emptyTitle')}
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 3, maxWidth: 320, mx: 'auto' }}>
              {t('projects.emptyDesc')}
            </Typography>
            <Button
              variant="contained"
              startIcon={<Plus size={14} />}
              onClick={() => openCreateDialog()}
              sx={{
                textTransform: 'none', fontWeight: 600, borderRadius: 2,
                background: 'linear-gradient(135deg, #7c3aed 0%, #3b82f6 100%)', boxShadow: 'none',
              }}
            >
              {t('projects.createFirst')}
            </Button>
          </Paper>
        )}

        {/* Grid */}
        {!isLoading && orgs.length > 0 && (
          <>
          <Typography variant="overline" color="text.secondary" sx={{ mb: 1.5, display: 'block', fontWeight: 600 }}>
            {t('projects.yourProjects')}
          </Typography>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 2.5 }}>
            {orgs.map((org: Organization, i: number) => (
              <OrgCard key={org.id} org={org} index={i} onDelete={setDeleteTarget} />
            ))}
          </Box>
          </>
        )}
      </Box>

      {/* Create — guided multi-step wizard (modules → sources → review).
          Replaces the old single-dialog type+checklist. `key` remounts
          it per open so the preset re-seeds. See CreateProjectWizard. */}
      <CreateProjectWizard
        key={wizardKey}
        open={creating}
        initialPreset={createPreset}
        initialModule={createModule}
        onClose={closeCreateDialog}
        onCreated={(org) => { closeCreateDialog(); navigate(`/projects/${org.id}`); }}
      />

      {/* Delete Dialog */}
      <Dialog
        open={!!deleteTarget}
        onClose={() => { setDeleteTarget(null); setDeleteConfirmText(''); }}
        maxWidth="xs"
        fullWidth
        PaperProps={{ sx: { borderRadius: 3, backgroundImage: 'none' } }}
      >
        <Box sx={{ p: 3, display: 'flex', flexDirection: 'column', gap: 2.5 }}>
          <Typography variant="h6" fontWeight={600}>{t('projects.delete')}</Typography>
          <Alert severity="error" className="rounded-lg">
            {t('projects.deleteConfirm')}
          </Alert>
          <TextField
            label={`${t('projects.deleteConfirmLabel')} "${deleteTarget?.name}" ${t('common.toConfirm')}`}
            value={deleteConfirmText}
            onChange={(e) => setDeleteConfirmText(e.target.value)}
            autoFocus
            fullWidth
            onKeyDown={(e) => {
              if (e.key === 'Enter' && deleteTarget && deleteConfirmText === deleteTarget.name) {
                deleteMut.mutate(deleteTarget.id);
              }
            }}
          />
          <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 1.5 }}>
            <Button onClick={() => { setDeleteTarget(null); setDeleteConfirmText(''); }} sx={{ textTransform: 'none' }}>
              {t('common.cancel')}
            </Button>
            <Button
              variant="contained"
              color="error"
              disabled={deleteConfirmText !== deleteTarget?.name || deleteMut.isPending}
              onClick={() => deleteTarget && deleteMut.mutate(deleteTarget.id)}
              sx={{ textTransform: 'none', borderRadius: 2 }}
            >
              {deleteMut.isPending ? <CircularProgress size={20} /> : t('projects.delete')}
            </Button>
          </Box>
        </Box>
      </Dialog>
    </Box>
  );
}

export default ProjectsPage;
