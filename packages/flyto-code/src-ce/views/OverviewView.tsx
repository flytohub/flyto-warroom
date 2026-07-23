import type {
  Project,
  Repository,
  Scan,
  ServiceBoundary,
  View,
  WorkflowSummary,
} from "../types";
import type { TranslationKey } from "../i18n";
import { Icon } from "../ui/icons";
import { Panel, RepositoryTable } from "../ui/primitives";

export interface OverviewViewProps {
  repositories: Repository[];
  scans: Record<string, Scan[]>;
  activeScans: number;
  findingCount: number;
  severityCounts: Record<string, number>;
  workflow: WorkflowSummary;
  services: ServiceBoundary[];
  currentProject?: Project;
  busy: boolean;
  startScan: (repoID: string) => Promise<void>;
  setView: (view: View) => void;
  t: (key: TranslationKey) => string;
}

export function OverviewView({
  repositories,
  scans,
  activeScans,
  findingCount,
  severityCounts,
  workflow,
  services,
  currentProject,
  busy,
  startScan,
  setView,
  t,
}: OverviewViewProps) {
  const metrics = [
    {
      label: t("overview.repositories"),
      value: repositories.length,
      detail: "Public source targets",
      icon: "repository" as const,
      tone: "brand",
    },
    {
      label: t("overview.active"),
      value: activeScans,
      detail: "Queue and worker activity",
      icon: "activity" as const,
      tone: "tech",
    },
    {
      label: t("overview.findings"),
      value: findingCount,
      detail: `${severityCounts.critical || 0} critical · ${severityCounts.high || 0} high`,
      icon: "shield" as const,
      tone: "danger",
    },
    {
      label: t("overview.hypotheses"),
      value: workflow.attack_paths.length,
      detail: "Transparent, non-authoritative",
      icon: "architecture" as const,
      tone: "warning",
    },
  ];

  return (
    <>
      <div className="page-heading product-hero">
        <div>
          <p className="eyebrow"><Icon name="shield" size={14} />LOCAL SECURITY CONTROL PLANE</p>
          <h1>{t("overview.title")}</h1>
          <p>{t("overview.subtitle")}</p>
        </div>
        <button className="primary-button" onClick={() => setView("repositories")}>
          <Icon name="repository" size={16} />{t("app.connect")}
        </button>
      </div>

      <div className="metric-grid">
        {metrics.map((metric) => (
          <article className={`metric-card metric-${metric.tone}`} key={metric.label}>
            <span className="metric-icon"><Icon name={metric.icon} size={19} /></span>
            <span>{metric.label}</span>
            <strong>{metric.value}</strong>
            <small>{metric.detail}</small>
          </article>
        ))}
      </div>

      <div className="overview-grid">
        <Panel
          title="Risk distribution"
          description="Latest local findings across connected repositories"
        >
          <div className="risk-bars">
            {(["critical", "high", "medium", "low"] as const).map((severity) => (
              <div key={severity}>
                <span>{severity}</span>
                <div>
                  <i
                    className={`risk-${severity}`}
                    style={{
                      width: `${Math.max(4, Math.min(100, (severityCounts[severity] || 0) * 12))}%`,
                    }}
                  />
                </div>
                <strong>{severityCounts[severity] || 0}</strong>
              </div>
            ))}
          </div>
        </Panel>
        <Panel
          title="Service topology"
          description="Independently buildable Community runtimes"
        >
          <div className="service-mini-list">
            {services.map((service) => (
              <div key={service.name}>
                <span className="status-dot status-online" />
                <strong>{service.name}</strong>
                <code>:{service.port}</code>
              </div>
            ))}
          </div>
        </Panel>
      </div>

      <Panel
        title="Latest repository activity"
        description={currentProject?.name || "Local workspace"}
      >
        <RepositoryTable
          repositories={repositories}
          scans={scans}
          onScan={startScan}
          busy={busy}
        />
      </Panel>
    </>
  );
}
