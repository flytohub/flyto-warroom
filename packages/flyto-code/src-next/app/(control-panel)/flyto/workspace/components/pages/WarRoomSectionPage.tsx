import { useCallback, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router';
import Box from '@mui/material/Box';
import Tabs from '@mui/material/Tabs';
import Tab from '@mui/material/Tab';
import CircularProgress from '@mui/material/CircularProgress';
import { Compass, LockKeyhole, RefreshCw } from 'lucide-react';
import { PageShell } from '@atoms/PageShell';
import { WorkspaceRouteFallback } from '@atoms/WorkspaceRouteFallback';
import EmptyStateGuide from '@atoms/EmptyStateGuide';
import { t, tOr } from '@lib/i18n';
import { useOrg } from '@hooks/useOrg';
import { useCapabilities } from '@hooks/useCapabilities';
import { sections, type Section } from '@code/sections';
import { sectionToPath } from './sectionNav';
import { WarRoomView } from '@compounds/warroom';

/**
 * WarRoomSectionPage — the modern home for the two technical surfaces
 * that used to live in the legacy below-the-divider accordion:
 * Architecture (arch-*) and Code Scans (sec-*).
 *
 * The accordion is gone; these are now first-class MODULES entries
 * (`architecture` / `code-scans`) with a splat path. The deep section
 * id rides in the URL splat — `/architecture/arch-deps` — so every
 * technical view is individually deep-linkable. The render engine is
 * still WarRoomView + sectionRegistry (we do NOT rewrite those deep
 * views); this wrapper only supplies the inner sub-tab nav that the
 * accordion used to provide.
 *
 * Bare `/architecture` (empty splat) falls back to the section's first
 * item. Old `/warroom/arch-*` bookmarks still resolve via
 * WarRoomDispatch (route.tsx), which forwards here.
 */
export default function WarRoomSectionPage({ sectionKey }: { sectionKey: Section['id'] }) {
  const { orgId, '*': splat } = useParams<{ orgId: string; '*': string }>();
  const navigate = useNavigate();
  const caps = useCapabilities(useOrg().org?.id);

  const section = useMemo(() => sections.find(s => s.id === sectionKey), [sectionKey]);

  // Feature-gated sub-items (cspm / runtime / reachability / red_team).
  const items = useMemo(
    () =>
      (section?.items ?? []).filter(
        it => !it.requires || it.requires.length === 0 || it.requires.every(f => caps.hasFeature(f)),
      ),
    [section, caps],
  );

  const requestedItem = useMemo(
    () => (splat ? section?.items.find(it => it.id === splat) : undefined),
    [section, splat],
  );
  const requestedIsHidden = !!requestedItem && !items.some(it => it.id === requestedItem.id);

  // Active sub-section: the splat, or the first visible item. If a
  // deep-link targets a capability-gated item, keep the URL honest and
  // render an explicit unavailable state instead of silently falling
  // back to a different section.
  const active = requestedIsHidden
    ? requestedItem.id
    : splat && items.some(it => it.id === splat) ? splat : items[0]?.id;

  const onNavigate = useCallback(
    (s: string) => {
      if (orgId) navigate(sectionToPath(s, orgId));
    },
    [navigate, orgId],
  );

  if (!orgId) return <WorkspaceRouteFallback />;
  if (!section) return <WorkspaceRouteFallback kind="section" orgId={orgId} />;

  const base = `/projects/${orgId}/${sectionKey === 'architecture' ? 'architecture' : 'code-scans'}`;

  if (caps.isError) {
    return (
      <PageShell padded={false} scroll="host">
        <Box sx={{ display: 'grid', placeItems: 'center', height: '100%', minHeight: 360, p: 4 }}>
          <EmptyStateGuide
            icon={<LockKeyhole size={28} />}
            title={t('warroom.capabilitiesUnavailable')}
            description={t('warroom.capabilitiesUnavailableDesc')}
            primaryAction={{
              label: t('warroom.retryCapabilities'),
              icon: <RefreshCw size={16} />,
              onClick: caps.refetch,
            }}
          />
        </Box>
      </PageShell>
    );
  }

  if (!caps.ready || caps.isLoading) {
    return (
      <PageShell padded={false} scroll="host">
        <Box sx={{ display: 'grid', placeItems: 'center', height: '100%', minHeight: 360 }}>
          <CircularProgress size={20} />
        </Box>
      </PageShell>
    );
  }

  return (
    <PageShell padded={false} scroll="host">
      <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
        <Box sx={{ borderBottom: '1px solid', borderColor: 'divider', flexShrink: 0 }}>
          <Tabs
            value={requestedIsHidden ? false : active ?? false}
            onChange={(_, v: string) => navigate(`${base}/${v}`)}
            variant="scrollable"
            scrollButtons="auto"
            sx={{ minHeight: 40, px: 1, '& .MuiTab-root': { minHeight: 40, py: 1, textTransform: 'none' } }}
          >
            {items.map(it => {
              const Icon = it.icon;
              return (
                <Tab
                  key={it.id}
                  value={it.id}
                  iconPosition="start"
                  icon={<Icon size={15} />}
                  label={tOr(it.labelKey, it.fallback)}
                />
              );
            })}
          </Tabs>
        </Box>
        <Box sx={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
          {requestedIsHidden && requestedItem ? (
            <Box sx={{ p: 4 }}>
              <EmptyStateGuide
                icon={<LockKeyhole size={28} />}
                title={t('warroom.sectionUnavailable')}
                description={t('warroom.sectionUnavailableDesc')}
                primaryAction={orgId ? {
                  label: t('warroom.goSettings'),
                  icon: <Compass size={16} />,
                  onClick: () => navigate(`/projects/${orgId}/settings`),
                } : undefined}
              />
            </Box>
          ) : (
            active && <WarRoomView activeSection={active} onNavigate={onNavigate} />
          )}
        </Box>
      </Box>
    </PageShell>
  );
}
