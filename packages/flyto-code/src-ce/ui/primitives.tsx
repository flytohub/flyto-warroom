import type { ReactNode } from "react";
import type { Finding, Repository, Scan } from "../types";
import { formatDate, severityClass } from "./format";
import { Icon } from "./icons";

export function ErrorBanner({
  message,
  clear,
}: {
  message: string;
  clear: () => void;
}) {
  if (!message) return null;
  return (
    <div className="error-banner" role="alert">
      <span className="status-dot status-error" />
      <span>{message}</span>
      <button type="button" onClick={clear} aria-label="Dismiss">×</button>
    </div>
  );
}

export function Panel({
  title,
  description,
  action,
  children,
  className = "",
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`panel ${className}`.trim()}>
      <header className="panel-header">
        <div>
          <h2>{title}</h2>
          {description && <p>{description}</p>}
        </div>
        {action}
      </header>
      {children}
    </section>
  );
}

export function Empty({ text }: { text: string }) {
  return (
    <div className="empty-state">
      <span className="empty-icon"><Icon name="scan" size={24} /></span>
      <p>{text}</p>
    </div>
  );
}

export function RepositoryTable({
  repositories,
  scans,
  onScan,
  busy,
}: {
  repositories: Repository[];
  scans: Record<string, Scan[]>;
  onScan: (repoID: string) => Promise<void>;
  busy: boolean;
}) {
  if (!repositories.length) {
    return <Empty text="Connect your first public repository to begin." />;
  }
  return (
    <div className="table-scroll">
      <table className="data-table">
        <thead>
          <tr>
            <th>Repository</th>
            <th>Language</th>
            <th>Last scan</th>
            <th>Status</th>
            <th><span className="visually-hidden">Actions</span></th>
          </tr>
        </thead>
        <tbody>
          {repositories.map((repository) => {
            const latest = scans[repository.id]?.[0];
            const status =
              latest?.status || repository.lastScanStatus || "not scanned";
            return (
              <tr key={repository.id}>
                <td>
                  <strong>{repository.fullName}</strong>
                  <small>{repository.defaultBranch || "main"} · public HTTPS</small>
                </td>
                <td><span className="outline-chip">{repository.language || "detecting"}</span></td>
                <td>{formatDate(latest?.completedAt || repository.lastScannedAt)}</td>
                <td>
                  <span className={`scan-status scan-${status.replace(" ", "-")}`}>
                    <i />{status}
                  </span>
                </td>
                <td>
                  <button
                    className="secondary-button"
                    disabled={busy || status === "queued" || status === "running"}
                    onClick={() => void onScan(repository.id)}
                  >
                    <Icon name="scan" size={15} />Run scan
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function FindingTable({ findings }: { findings: Finding[] }) {
  if (!findings.length) return <Empty text="No findings are available yet." />;
  return (
    <div className="table-scroll">
      <table className="data-table finding-table">
        <thead>
          <tr><th>Severity</th><th>Finding</th><th>Location</th><th>Rule</th></tr>
        </thead>
        <tbody>
          {findings.slice(0, 250).map((finding) => (
            <tr key={finding.id}>
              <td><span className={severityClass(finding.severity)}>{finding.severity}</span></td>
              <td><strong>{finding.name}</strong><small>{finding.detail || finding.type}</small></td>
              <td><code>{finding.file}{finding.line ? `:${finding.line}` : ""}</code></td>
              <td><code>{finding.rule || "local"}</code></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
