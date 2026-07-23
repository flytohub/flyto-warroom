import type { TranslationKey } from "../i18n";
import type { WorkflowSummary } from "../types";
import { formatDate } from "../ui/format";
import { Icon } from "../ui/icons";
import { Empty, Panel } from "../ui/primitives";

export interface ReportsViewProps {
  workflow: WorkflowSummary;
  busy: boolean;
  openLatestReport: () => Promise<void>;
  t: (key: TranslationKey) => string;
}

export function ReportsView({
  workflow,
  busy,
  openLatestReport,
  t,
}: ReportsViewProps) {
  return (
    <>
      <div className="page-heading product-hero compact-hero">
        <div>
          <p className="eyebrow"><Icon name="file" size={14} />PORTABLE AUDIT EVIDENCE</p>
          <h1>{t("reports.title")}</h1>
          <p>{t("reports.subtitle")}</p>
        </div>
        <button
          className="primary-button"
          disabled={!workflow.reports.length || busy}
          onClick={() => void openLatestReport()}
        >
          <Icon name="file" size={16} />{t("app.openReport")}
        </button>
      </div>
      <Panel
        title="Generated reports"
        description="No cloud upload. No external report renderer."
      >
        <div className="report-list">
          {workflow.reports.map((report) => (
            <article key={report.id}>
              <span className="report-icon"><Icon name="file" size={18} /></span>
              <div>
                <strong>Warroom CE evidence report</strong>
                <small>
                  {formatDate(report.created_at)} · {report.finding_count} findings ·{" "}
                  {report.evidence_count} evidence records
                </small>
              </div>
              <button
                aria-label="Open report"
                className="icon-button"
                onClick={() => void openLatestReport()}
              >
                <Icon name="chevron" size={16} />
              </button>
            </article>
          ))}
          {!workflow.reports.length && (
            <Empty text="A report appears automatically after analysis completes." />
          )}
        </div>
      </Panel>
    </>
  );
}
