import type { FormEvent } from "react";
import type { TranslationKey } from "../i18n";
import type { Repository, Scan } from "../types";
import { Icon } from "../ui/icons";
import { Panel, RepositoryTable } from "../ui/primitives";

export interface RepositoriesViewProps {
  repositories: Repository[];
  scans: Record<string, Scan[]>;
  repoURL: string;
  setRepoURL: (value: string) => void;
  connectRepository: (event: FormEvent) => Promise<void>;
  startScan: (repoID: string) => Promise<void>;
  busy: boolean;
  t: (key: TranslationKey) => string;
}

export function RepositoriesView({
  repositories,
  scans,
  repoURL,
  setRepoURL,
  connectRepository,
  startScan,
  busy,
  t,
}: RepositoriesViewProps) {
  return (
    <>
      <div className="page-heading product-hero compact-hero">
        <div>
          <p className="eyebrow"><Icon name="code" size={14} />PROVIDER-FREE SOURCE SCANNING</p>
          <h1>{t("repo.title")}</h1>
          <p>{t("repo.subtitle")}</p>
        </div>
      </div>
      <Panel
        title={t("app.connect")}
        description="HTTPS only · no embedded credentials · public repositories"
        className="connect-panel"
      >
        <form className="connect-form" onSubmit={connectRepository}>
          <label>
            <span>{t("repo.url")}</span>
            <input
              required
              type="url"
              value={repoURL}
              onChange={(event) => setRepoURL(event.target.value)}
              placeholder="https://github.com/owner/repository.git"
            />
          </label>
          <button className="primary-button" disabled={busy}>
            <Icon name="repository" size={16} />
            {busy ? "Connecting…" : t("repo.connect")}
          </button>
        </form>
      </Panel>
      <Panel
        title={`${repositories.length} connected repositories`}
        description="Every connection is stored in your local PostgreSQL"
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
