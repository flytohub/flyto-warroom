import type { TranslationKey } from "../i18n";
import type { Finding, WorkflowSummary } from "../types";
import { formatDate, severityClass } from "../ui/format";
import { Icon } from "../ui/icons";
import {
  Empty,
  FindingTable,
  Panel,
} from "../ui/primitives";

export interface EvidenceViewProps {
  workflow: WorkflowSummary;
  findings: Finding[];
  t: (key: TranslationKey) => string;
}

export function EvidenceView({ workflow, findings, t }: EvidenceViewProps) {
  return (
    <>
      <div className="page-heading product-hero compact-hero">
        <div>
          <p className="eyebrow"><Icon name="evidence" size={14} />DETERMINISTIC LOCAL ANALYSIS</p>
          <h1>{t("evidence.title")}</h1>
          <p>{t("evidence.subtitle")}</p>
        </div>
      </div>
      <div className="evidence-grid">
        <Panel
          title={`${workflow.attack_paths.length} risk-chain hypotheses`}
          description="Grouped by scanner category and severity"
        >
          <div className="card-list">
            {workflow.attack_paths.map((path) => (
              <article className="evidence-card" key={path.id}>
                <div>
                  <span className={severityClass(path.severity)}>{path.severity}</span>
                  <span className="outline-chip">{path.confidence}</span>
                </div>
                <h3>{path.title}</h3>
                <p>{path.summary}</p>
                <small>{path.finding_ids.length} linked findings · {formatDate(path.created_at)}</small>
              </article>
            ))}
            {!workflow.attack_paths.length && <Empty text={t("app.empty")} />}
          </div>
        </Panel>
        <Panel
          title={`${workflow.evidence.length} evidence records`}
          description="SHA-256 digests preserve local traceability"
        >
          <div className="evidence-log">
            {workflow.evidence.slice(0, 100).map((item) => (
              <article key={item.id}>
                <span className="status-dot status-online" />
                <div><strong>{item.summary}</strong><code>{item.digest}</code></div>
              </article>
            ))}
            {!workflow.evidence.length && <Empty text={t("app.empty")} />}
          </div>
        </Panel>
      </div>
      <Panel
        title={`${findings.length} scanner findings`}
        description="Secret, SAST, IaC and dependency findings"
      >
        <FindingTable findings={findings} />
      </Panel>
    </>
  );
}
