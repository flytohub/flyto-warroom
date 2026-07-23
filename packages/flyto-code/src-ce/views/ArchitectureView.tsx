import type { TranslationKey } from "../i18n";
import type { ServiceBoundary } from "../types";
import { Icon } from "../ui/icons";
import { Panel } from "../ui/primitives";

export interface ArchitectureViewProps {
  services: ServiceBoundary[];
  t: (key: TranslationKey) => string;
}

export function ArchitectureView({ services, t }: ArchitectureViewProps) {
  return (
    <>
      <div className="page-heading product-hero compact-hero">
        <div>
          <p className="eyebrow"><Icon name="architecture" size={14} />OPEN-CORE BOUNDARY</p>
          <h1>{t("architecture.title")}</h1>
          <p>{t("architecture.subtitle")}</p>
        </div>
      </div>
      <div className="architecture-flow">
        {services.map((service, index) => (
          <article key={service.name}>
            <span className="service-index">0{index + 1}</span>
            <span className="status-dot status-online" />
            <span className="architecture-icon"><Icon name="architecture" size={18} /></span>
            <h3>{service.name}</h3>
            <code>{service.source} · :{service.port}</code>
            <p>{service.responsibility}</p>
          </article>
        ))}
      </div>
      <div className="boundary-grid">
        <Panel
          title={t("architecture.public")}
          description="Useful, buildable, reviewable and PR-friendly"
        >
          <ul className="check-list">
            <li>Local account bootstrap and JWT sessions</li>
            <li>Projects and public repositories</li>
            <li>Native repository scanners and scheduling</li>
            <li>Transparent evidence and hypotheses</li>
            <li>Remediation guidance and re-verification</li>
            <li>Portable HTML reports</li>
          </ul>
        </Panel>
        <Panel
          title={t("architecture.private")}
          description="The commercial value and operational liability boundary"
        >
          <ul className="private-list">
            <li>Authoritative score signing and cross-tenant comparison</li>
            <li>Proprietary correlation datasets and models</li>
            <li>Managed provider credentials and paid connectors</li>
            <li>Live remediation, approval and rollback orchestration</li>
            <li>SaaS and Enterprise control plane, SSO, licensing and support</li>
          </ul>
        </Panel>
      </div>
    </>
  );
}
