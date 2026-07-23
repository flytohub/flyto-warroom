import {
  type FormEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { APIError, ceClient } from "./api";
import {
  languages,
  preferredLanguage,
  translate,
  type Language,
  type TranslationKey,
} from "./i18n";
import type {
  Finding,
  Project,
  Repository,
  Scan,
  ServiceBoundary,
  ThemeMode,
  User,
  View,
  WorkflowSummary,
} from "./types";

const emptyWorkflow: WorkflowSummary = {
  attack_paths: [],
  evidence: [],
  remediations: [],
  reports: [],
};

const services: ServiceBoundary[] = [
  {
    name: "engine-ce",
    port: 8080,
    source: "ce/engine-ce",
    responsibility: "Local identity, projects, repositories, API and policy boundary",
  },
  {
    name: "worker-ce",
    port: 8081,
    source: "ce/worker-ce",
    responsibility: "Credential-free clone, secret, SAST, IaC and dependency scans",
  },
  {
    name: "scheduler-ce",
    port: 8082,
    source: "ce/scheduler-ce",
    responsibility: "Durable recurring scan scheduling with one-active-scan safety",
  },
  {
    name: "analysis-ce",
    port: 8083,
    source: "ce/analysis-ce",
    responsibility: "Evidence digests, recommendations and risk-chain hypotheses",
  },
  {
    name: "report-ce",
    port: 8084,
    source: "ce/report-ce",
    responsibility: "Portable local HTML evidence reports",
  },
];

const nav: Array<{ view: View; glyph: string; label: TranslationKey }> = [
  { view: "overview", glyph: "◫", label: "nav.overview" },
  { view: "repositories", glyph: "⌘", label: "nav.repositories" },
  { view: "evidence", glyph: "◇", label: "nav.evidence" },
  { view: "remediation", glyph: "✓", label: "nav.remediation" },
  { view: "reports", glyph: "▤", label: "nav.reports" },
  { view: "architecture", glyph: "⌬", label: "nav.architecture" },
];

function formatDate(value?: string): string {
  if (!value) return "—";
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function severityClass(value: string): string {
  return `severity severity-${value.toLowerCase()}`;
}

function ErrorBanner({
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
      <button type="button" onClick={clear} aria-label="Dismiss">
        ×
      </button>
    </div>
  );
}

function AuthScreen({
  language,
  setLanguage,
  theme,
  cycleTheme,
  initialSetup,
  onAuthenticated,
}: {
  language: Language;
  setLanguage: (language: Language) => void;
  theme: ThemeMode;
  cycleTheme: () => void;
  initialSetup: boolean;
  onAuthenticated: (user: User) => void;
}) {
  const t = (key: TranslationKey) => translate(language, key);
  const [setup, setSetup] = useState(initialSetup);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const session = setup
        ? await ceClient.bootstrap(email, password, name)
        : await ceClient.login(email, password);
      onAuthenticated(session.user);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t("app.error"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="auth-shell">
      <section className="auth-story">
        <div className="brand-lockup brand-lockup-large">
          <span className="brand-mark">F2</span>
          <span>
            <strong>Flyto2 Warroom</strong>
            <small>{t("app.community")}</small>
          </span>
        </div>
        <div className="auth-copy">
          <p className="eyebrow">SELF-HOSTED SECURITY OPERATIONS</p>
          <h1>Evidence first.<br />Your infrastructure.</h1>
          <p>
            Turn repository findings into transparent risk hypotheses,
            remediation guidance, and verification records—without a hosted
            control plane.
          </p>
        </div>
        <div className="trust-strip">
          <span><i>01</i> Local PostgreSQL</span>
          <span><i>02</i> Five Go services</span>
          <span><i>03</i> Source buildable</span>
        </div>
      </section>
      <section className="auth-panel">
        <div className="auth-tools">
          <select
            aria-label={t("app.language")}
            value={language}
            onChange={(event) => setLanguage(event.target.value as Language)}
          >
            {languages.map(([code, label]) => (
              <option key={code} value={code}>{label}</option>
            ))}
          </select>
          <button className="icon-button" type="button" onClick={cycleTheme}>
            {theme === "dark" ? "☾" : theme === "light" ? "☀" : "◐"}
          </button>
        </div>
        <form className="auth-form" onSubmit={submit}>
          <div className="local-badge"><span /> {t("app.local")}</div>
          <h2>{setup ? t("auth.setup") : t("auth.login")}</h2>
          <p>{t("auth.subtitle")}</p>
          {error && <ErrorBanner message={error} clear={() => setError("")} />}
          {setup && (
            <label>
              <span>{t("auth.name")}</span>
              <input
                required
                minLength={2}
                maxLength={100}
                autoComplete="name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Security Operator"
              />
            </label>
          )}
          <label>
            <span>{t("auth.email")}</span>
            <input
              required
              type="email"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="admin@example.com"
            />
          </label>
          <label>
            <span>{t("auth.password")}</span>
            <input
              required
              type="password"
              minLength={12}
              autoComplete={setup ? "new-password" : "current-password"}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="At least 12 characters"
            />
          </label>
          <button className="primary-button auth-submit" disabled={busy}>
            {busy ? "Working…" : setup ? t("auth.submitSetup") : t("auth.submitLogin")}
            <span>→</span>
          </button>
          <button
            className="text-button"
            type="button"
            onClick={() => setSetup((value) => !value)}
          >
            {setup ? t("auth.switchLogin") : t("auth.switchSetup")}
          </button>
        </form>
        <p className="auth-footnote">
          Community results are locally computed and non-comparable.
        </p>
      </section>
    </main>
  );
}

function Panel({
  title,
  description,
  action,
  children,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="panel">
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

export default function App() {
  const [language, setLanguageState] = useState<Language>(preferredLanguage);
  const [theme, setTheme] = useState<ThemeMode>(
    () => (window.localStorage.getItem("flyto-warroom-ce-theme") as ThemeMode) || "system",
  );
  const [user, setUser] = useState<User | null>(null);
  const [bootstrapRequired, setBootstrapRequired] = useState(false);
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [view, setView] = useState<View>("overview");
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectID, setProjectID] = useState("");
  const [repositories, setRepositories] = useState<Repository[]>([]);
  const [scans, setScans] = useState<Record<string, Scan[]>>({});
  const [findings, setFindings] = useState<Finding[]>([]);
  const [workflow, setWorkflow] = useState<WorkflowSummary>(emptyWorkflow);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [repoURL, setRepoURL] = useState("");
  const t = useCallback(
    (key: TranslationKey) => translate(language, key),
    [language],
  );

  const setLanguage = (value: Language) => {
    setLanguageState(value);
    window.localStorage.setItem("flyto-warroom-ce-language", value);
  };

  const cycleTheme = () => {
    const next: ThemeMode =
      theme === "system" ? "dark" : theme === "dark" ? "light" : "system";
    setTheme(next);
    window.localStorage.setItem("flyto-warroom-ce-theme", next);
  };

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.lang = language;
  }, [language, theme]);

  const loadWorkspace = useCallback(
    async (preferredProjectID?: string) => {
      const nextProjects = await ceClient.projects();
      setProjects(nextProjects);
      const selected =
        nextProjects.find((project) => project.id === preferredProjectID)?.id ||
        nextProjects[0]?.id ||
        "";
      setProjectID(selected);
      if (!selected) {
        setRepositories([]);
        setScans({});
        setFindings([]);
        setWorkflow(emptyWorkflow);
        return;
      }
      const [nextRepositories, nextWorkflow] = await Promise.all([
        ceClient.repositories(selected),
        ceClient.workflow(selected),
      ]);
      setRepositories(nextRepositories);
      setWorkflow(nextWorkflow);
      const scanPairs = await Promise.all(
        nextRepositories.map(async (repo) => [repo.id, await ceClient.scans(repo.id)] as const),
      );
      setScans(Object.fromEntries(scanPairs));
      const findingSets = await Promise.all(
        nextRepositories.map((repo) => ceClient.findings(repo.id)),
      );
      setFindings(findingSets.flat());
    },
    [],
  );

  useEffect(() => {
    let active = true;
    async function restore() {
      try {
        if (ceClient.authenticated()) {
          const current = await ceClient.me();
          if (!active) return;
          setUser(current);
          await loadWorkspace();
        } else {
          const status = await ceClient.bootstrapStatus();
          if (active) setBootstrapRequired(status.required);
        }
      } catch (cause) {
        if (cause instanceof APIError && cause.status === 401) {
          const status = await ceClient.bootstrapStatus();
          if (active) setBootstrapRequired(status.required);
        } else if (active) {
          setError(cause instanceof Error ? cause.message : t("app.error"));
        }
      } finally {
        if (active) setCheckingAuth(false);
      }
    }
    void restore();
    return () => {
      active = false;
    };
  }, [loadWorkspace, t]);

  useEffect(() => {
    if (!user || !projectID) return;
    const poll = window.setInterval(() => {
      void loadWorkspace(projectID).catch(() => undefined);
    }, 5_000);
    return () => window.clearInterval(poll);
  }, [loadWorkspace, projectID, user]);

  const activeScans = useMemo(
    () =>
      Object.values(scans)
        .flat()
        .filter((scan) => scan.status === "queued" || scan.status === "running").length,
    [scans],
  );
  const severityCounts = useMemo(() => {
    const counts: Record<string, number> = {
      critical: 0,
      high: 0,
      medium: 0,
      low: 0,
    };
    findings.forEach((finding) => {
      counts[finding.severity] = (counts[finding.severity] || 0) + 1;
    });
    return counts;
  }, [findings]);
  const currentProject = projects.find((project) => project.id === projectID);

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError("");
    try {
      await action();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t("app.error"));
    } finally {
      setBusy(false);
    }
  }

  async function connectRepository(event: FormEvent) {
    event.preventDefault();
    if (!projectID || !repoURL.trim()) return;
    await run(async () => {
      await ceClient.connectRepository(projectID, repoURL.trim());
      setRepoURL("");
      await loadWorkspace(projectID);
    });
  }

  async function startScan(repoID: string) {
    await run(async () => {
      await ceClient.startScan(repoID);
      await loadWorkspace(projectID);
    });
  }

  async function verify(remediationID: string) {
    await run(async () => {
      await ceClient.verifyRemediation(projectID, remediationID);
      await loadWorkspace(projectID);
    });
  }

  function signOut() {
    ceClient.signOut();
    setUser(null);
    setProjects([]);
    setProjectID("");
  }

  if (checkingAuth) {
    return (
      <main className="splash">
        <span className="brand-mark">F2</span>
        <p>{t("app.loading")}</p>
      </main>
    );
  }

  if (!user) {
    return (
      <AuthScreen
        language={language}
        setLanguage={setLanguage}
        theme={theme}
        cycleTheme={cycleTheme}
        initialSetup={bootstrapRequired}
        onAuthenticated={(authenticatedUser) => {
          setUser(authenticatedUser);
          void loadWorkspace();
        }}
      />
    );
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand-lockup">
          <span className="brand-mark">F2</span>
          <span><strong>Warroom</strong><small>{t("app.community")}</small></span>
        </div>
        <div className="instance-state">
          <span className="status-dot status-online" />
          <span><strong>{t("app.local")}</strong><small>PostgreSQL · Source build</small></span>
        </div>
        <nav>
          {nav.map((item) => (
            <button
              type="button"
              key={item.view}
              className={view === item.view ? "active" : ""}
              onClick={() => setView(item.view)}
            >
              <i>{item.glyph}</i>{t(item.label)}
            </button>
          ))}
        </nav>
        <div className="boundary-card">
          <span>CE AUTHORITY</span>
          <strong>{t("overview.boundary")}</strong>
          <p>Commercial correlation, managed providers, and live remediation stay private.</p>
        </div>
        <div className="user-block">
          <span className="avatar">{user.displayName.slice(0, 2).toUpperCase()}</span>
          <span><strong>{user.displayName}</strong><small>{user.email}</small></span>
          <button type="button" onClick={signOut} title={t("app.signout")}>↗</button>
        </div>
      </aside>

      <main className="workspace">
        <header className="topbar">
          <div className="project-switcher">
            <span>Workspace</span>
            <select
              value={projectID}
              onChange={(event) => void loadWorkspace(event.target.value)}
            >
              {projects.map((project) => (
                <option value={project.id} key={project.id}>{project.name}</option>
              ))}
            </select>
          </div>
          <div className="topbar-actions">
            <span className="release-chip">v0.5.0 CE</span>
            <select
              aria-label={t("app.language")}
              value={language}
              onChange={(event) => setLanguage(event.target.value as Language)}
            >
              {languages.map(([code, label]) => (
                <option key={code} value={code}>{label}</option>
              ))}
            </select>
            <button className="icon-button" type="button" onClick={cycleTheme}>
              {theme === "dark" ? "☾" : theme === "light" ? "☀" : "◐"}
            </button>
            <button
              className="secondary-button"
              type="button"
              disabled={busy}
              onClick={() => void run(() => loadWorkspace(projectID))}
            >
              ↻ {t("app.refresh")}
            </button>
          </div>
        </header>
        <div className="content">
          <ErrorBanner message={error} clear={() => setError("")} />

          {view === "overview" && (
            <>
              <div className="page-heading">
                <div>
                  <p className="eyebrow">LOCAL SECURITY CONTROL PLANE</p>
                  <h1>{t("overview.title")}</h1>
                  <p>{t("overview.subtitle")}</p>
                </div>
                <button className="primary-button" onClick={() => setView("repositories")}>
                  + {t("app.connect")}
                </button>
              </div>
              <div className="metric-grid">
                <article><span>{t("overview.repositories")}</span><strong>{repositories.length}</strong><small>Public source targets</small></article>
                <article><span>{t("overview.active")}</span><strong>{activeScans}</strong><small>Queue + worker activity</small></article>
                <article><span>{t("overview.findings")}</span><strong>{findings.length}</strong><small>{severityCounts.critical} critical · {severityCounts.high} high</small></article>
                <article><span>{t("overview.hypotheses")}</span><strong>{workflow.attack_paths.length}</strong><small>Transparent, non-authoritative</small></article>
              </div>
              <div className="overview-grid">
                <Panel title="Risk distribution" description="Latest local findings across connected repositories">
                  <div className="risk-bars">
                    {(["critical", "high", "medium", "low"] as const).map((severity) => (
                      <div key={severity}>
                        <span>{severity}</span>
                        <div><i style={{ width: `${Math.max(4, Math.min(100, severityCounts[severity] * 12))}%` }} /></div>
                        <strong>{severityCounts[severity]}</strong>
                      </div>
                    ))}
                  </div>
                </Panel>
                <Panel title="Service topology" description="Independently buildable CE runtimes">
                  <div className="service-mini-list">
                    {services.map((service) => (
                      <div key={service.name}><span className="status-dot status-online" /><strong>{service.name}</strong><code>:{service.port}</code></div>
                    ))}
                  </div>
                </Panel>
              </div>
              <Panel title="Latest repository activity" description={currentProject?.name || "Local workspace"}>
                <RepositoryTable repositories={repositories} scans={scans} onScan={startScan} busy={busy} />
              </Panel>
            </>
          )}

          {view === "repositories" && (
            <>
              <div className="page-heading">
                <div><p className="eyebrow">PROVIDER-FREE SOURCE SCANNING</p><h1>{t("repo.title")}</h1><p>{t("repo.subtitle")}</p></div>
              </div>
              <Panel title={t("app.connect")} description="HTTPS only · no embedded credentials · public repositories">
                <form className="connect-form" onSubmit={connectRepository}>
                  <label><span>{t("repo.url")}</span><input required type="url" value={repoURL} onChange={(event) => setRepoURL(event.target.value)} placeholder="https://github.com/owner/repository.git" /></label>
                  <button className="primary-button" disabled={busy}>{busy ? "Connecting…" : t("repo.connect")} <span>→</span></button>
                </form>
              </Panel>
              <Panel title={`${repositories.length} connected repositories`} description="Every connection is stored in your local PostgreSQL">
                <RepositoryTable repositories={repositories} scans={scans} onScan={startScan} busy={busy} />
              </Panel>
            </>
          )}

          {view === "evidence" && (
            <>
              <div className="page-heading"><div><p className="eyebrow">DETERMINISTIC LOCAL ANALYSIS</p><h1>{t("evidence.title")}</h1><p>{t("evidence.subtitle")}</p></div></div>
              <div className="evidence-grid">
                <Panel title={`${workflow.attack_paths.length} risk-chain hypotheses`} description="Grouped by scanner category and severity">
                  <div className="card-list">
                    {workflow.attack_paths.map((path) => (
                      <article className="evidence-card" key={path.id}>
                        <div><span className={severityClass(path.severity)}>{path.severity}</span><span className="outline-chip">{path.confidence}</span></div>
                        <h3>{path.title}</h3><p>{path.summary}</p>
                        <small>{path.finding_ids.length} linked findings · {formatDate(path.created_at)}</small>
                      </article>
                    ))}
                    {!workflow.attack_paths.length && <Empty text={t("app.empty")} />}
                  </div>
                </Panel>
                <Panel title={`${workflow.evidence.length} evidence records`} description="SHA-256 digests preserve local traceability">
                  <div className="evidence-log">
                    {workflow.evidence.slice(0, 100).map((item) => (
                      <article key={item.id}><span className="status-dot status-online" /><div><strong>{item.summary}</strong><code>{item.digest}</code></div></article>
                    ))}
                    {!workflow.evidence.length && <Empty text={t("app.empty")} />}
                  </div>
                </Panel>
              </div>
              <Panel title={`${findings.length} scanner findings`} description="Secret, SAST, IaC and dependency findings">
                <FindingTable findings={findings} />
              </Panel>
            </>
          )}

          {view === "remediation" && (
            <>
              <div className="page-heading"><div><p className="eyebrow">CLOSE THE LOOP LOCALLY</p><h1>{t("remediation.title")}</h1><p>{t("remediation.subtitle")}</p></div></div>
              <div className="remediation-board">
                {workflow.remediations.map((item) => (
                  <article key={item.id}>
                    <header><span className={`verification verification-${item.verification_status}`}>{item.verification_status.replaceAll("_", " ")}</span><small>{formatDate(item.updated_at)}</small></header>
                    <p>{item.recommendation}</p>
                    <footer><code>{item.finding_id}</code><button className="secondary-button" disabled={busy || item.verification_status === "queued"} onClick={() => void verify(item.id)}>{t("app.verify")} →</button></footer>
                  </article>
                ))}
                {!workflow.remediations.length && <Empty text={t("app.empty")} />}
              </div>
            </>
          )}

          {view === "reports" && (
            <>
              <div className="page-heading">
                <div><p className="eyebrow">PORTABLE AUDIT EVIDENCE</p><h1>{t("reports.title")}</h1><p>{t("reports.subtitle")}</p></div>
                <button className="primary-button" disabled={!workflow.reports.length || busy} onClick={() => void run(() => ceClient.openLatestReport(projectID))}>{t("app.openReport")} ↗</button>
              </div>
              <Panel title="Generated reports" description="No cloud upload. No external report renderer.">
                <div className="report-list">
                  {workflow.reports.map((report) => (
                    <article key={report.id}><span className="report-icon">HTML</span><div><strong>Warroom CE evidence report</strong><small>{formatDate(report.created_at)} · {report.finding_count} findings · {report.evidence_count} evidence records</small></div><button className="icon-button" onClick={() => void run(() => ceClient.openLatestReport(projectID))}>↗</button></article>
                  ))}
                  {!workflow.reports.length && <Empty text="A report appears automatically after analysis completes." />}
                </div>
              </Panel>
            </>
          )}

          {view === "architecture" && (
            <>
              <div className="page-heading"><div><p className="eyebrow">OPEN-CORE BOUNDARY</p><h1>{t("architecture.title")}</h1><p>{t("architecture.subtitle")}</p></div></div>
              <div className="architecture-flow">
                {services.map((service, index) => (
                  <article key={service.name}>
                    <span className="service-index">0{index + 1}</span><span className="status-dot status-online" />
                    <h3>{service.name}</h3><code>{service.source} · :{service.port}</code><p>{service.responsibility}</p>
                  </article>
                ))}
              </div>
              <div className="boundary-grid">
                <Panel title={t("architecture.public")} description="Useful, buildable, reviewable and PR-friendly">
                  <ul className="check-list"><li>Local account bootstrap and JWT sessions</li><li>Projects and public repositories</li><li>Native repository scanners and scheduling</li><li>Transparent evidence and hypotheses</li><li>Remediation guidance and re-verification</li><li>Portable HTML reports</li></ul>
                </Panel>
                <Panel title={t("architecture.private")} description="The commercial value and operational liability boundary">
                  <ul className="private-list"><li>Authoritative score signing and cross-tenant comparison</li><li>Proprietary correlation datasets and models</li><li>Managed provider credentials and paid connectors</li><li>Live remediation, approval and rollback orchestration</li><li>SaaS / Enterprise control plane, SSO, licensing and support</li></ul>
                </Panel>
              </div>
            </>
          )}
        </div>
      </main>
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return <div className="empty-state"><span>◇</span><p>{text}</p></div>;
}

function RepositoryTable({
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
  if (!repositories.length) return <Empty text="Connect your first public repository to begin." />;
  return (
    <div className="table-scroll">
      <table className="data-table">
        <thead><tr><th>Repository</th><th>Language</th><th>Last scan</th><th>Status</th><th /></tr></thead>
        <tbody>
          {repositories.map((repo) => {
            const latest = scans[repo.id]?.[0];
            const status = latest?.status || repo.lastScanStatus || "not scanned";
            return (
              <tr key={repo.id}>
                <td><strong>{repo.fullName}</strong><small>{repo.defaultBranch || "main"} · public HTTPS</small></td>
                <td><span className="outline-chip">{repo.language || "detecting"}</span></td>
                <td>{formatDate(latest?.completedAt || repo.lastScannedAt)}</td>
                <td><span className={`scan-status scan-${status.replace(" ", "-")}`}><i />{status}</span></td>
                <td><button className="secondary-button" disabled={busy || status === "queued" || status === "running"} onClick={() => void onScan(repo.id)}>Run scan</button></td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function FindingTable({ findings }: { findings: Finding[] }) {
  if (!findings.length) return <Empty text="No findings are available yet." />;
  return (
    <div className="table-scroll">
      <table className="data-table finding-table">
        <thead><tr><th>Severity</th><th>Finding</th><th>Location</th><th>Rule</th></tr></thead>
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
