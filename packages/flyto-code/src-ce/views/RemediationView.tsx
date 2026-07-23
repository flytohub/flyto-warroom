import type { TranslationKey } from "../i18n";
import type { WorkflowSummary } from "../types";
import { formatDate } from "../ui/format";
import { Icon } from "../ui/icons";
import { Empty } from "../ui/primitives";

export interface RemediationViewProps {
  workflow: WorkflowSummary;
  busy: boolean;
  verify: (remediationID: string) => Promise<void>;
  t: (key: TranslationKey) => string;
}

export function RemediationView({
  workflow,
  busy,
  verify,
  t,
}: RemediationViewProps) {
  return (
    <>
      <div className="page-heading product-hero compact-hero">
        <div>
          <p className="eyebrow"><Icon name="check" size={14} />CLOSE THE LOOP LOCALLY</p>
          <h1>{t("remediation.title")}</h1>
          <p>{t("remediation.subtitle")}</p>
        </div>
      </div>
      <div className="remediation-board">
        {workflow.remediations.map((item) => (
          <article key={item.id}>
            <header>
              <span className={`verification verification-${item.verification_status}`}>
                {item.verification_status.replaceAll("_", " ")}
              </span>
              <small>{formatDate(item.updated_at)}</small>
            </header>
            <p>{item.recommendation}</p>
            <footer>
              <code>{item.finding_id}</code>
              <button
                className="secondary-button"
                disabled={busy || item.verification_status === "queued"}
                onClick={() => void verify(item.id)}
              >
                <Icon name="refresh" size={15} />{t("app.verify")}
              </button>
            </footer>
          </article>
        ))}
        {!workflow.remediations.length && <Empty text={t("app.empty")} />}
      </div>
    </>
  );
}
