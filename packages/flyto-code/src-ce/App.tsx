import {
  type FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { APIError, ceClient } from "./api";
import {
  preferredLanguage,
  translate,
  type Language,
  type TranslationKey,
} from "./i18n";
import { communityServices, emptyWorkflow } from "./product";
import type {
  Finding,
  Project,
  Repository,
  Scan,
  ThemeMode,
  User,
  View,
  WorkflowSummary,
} from "./types";
import { AuthScreen } from "./ui/AuthScreen";
import { Logo } from "./ui/Logo";
import { ProductShell } from "./ui/ProductShell";
import { ErrorBanner } from "./ui/primitives";
import { ArchitectureView } from "./views/ArchitectureView";
import { EvidenceView } from "./views/EvidenceView";
import { OverviewView } from "./views/OverviewView";
import { RemediationView } from "./views/RemediationView";
import { ReportsView } from "./views/ReportsView";
import { RepositoriesView } from "./views/RepositoriesView";

export default function App() {
  const [language, setLanguageState] = useState<Language>(preferredLanguage);
  const [theme, setTheme] = useState<ThemeMode>(
    () =>
      (window.localStorage.getItem("flyto-warroom-ce-theme") as ThemeMode) ||
      "system",
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
  const [workflow, setWorkflow] =
    useState<WorkflowSummary>(emptyWorkflow);
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
        nextRepositories.map(
          async (repository) =>
            [repository.id, await ceClient.scans(repository.id)] as const,
        ),
      );
      setScans(Object.fromEntries(scanPairs));

      const findingSets = await Promise.all(
        nextRepositories.map((repository) => ceClient.findings(repository.id)),
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
        .filter(
          (scan) => scan.status === "queued" || scan.status === "running",
        ).length,
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

  async function startScan(repositoryID: string) {
    await run(async () => {
      await ceClient.startScan(repositoryID);
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
        <Logo />
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
    <ProductShell
      view={view}
      setView={setView}
      user={user}
      projects={projects}
      projectID={projectID}
      loadWorkspace={loadWorkspace}
      language={language}
      setLanguage={setLanguage}
      theme={theme}
      cycleTheme={cycleTheme}
      busy={busy}
      refresh={() => run(() => loadWorkspace(projectID))}
      signOut={signOut}
      t={t}
    >
      <ErrorBanner message={error} clear={() => setError("")} />
      {view === "overview" && (
        <OverviewView
          repositories={repositories}
          scans={scans}
          activeScans={activeScans}
          findingCount={findings.length}
          severityCounts={severityCounts}
          workflow={workflow}
          services={communityServices}
          currentProject={currentProject}
          busy={busy}
          startScan={startScan}
          setView={setView}
          t={t}
        />
      )}
      {view === "repositories" && (
        <RepositoriesView
          repositories={repositories}
          scans={scans}
          repoURL={repoURL}
          setRepoURL={setRepoURL}
          connectRepository={connectRepository}
          startScan={startScan}
          busy={busy}
          t={t}
        />
      )}
      {view === "evidence" && (
        <EvidenceView workflow={workflow} findings={findings} t={t} />
      )}
      {view === "remediation" && (
        <RemediationView
          workflow={workflow}
          busy={busy}
          verify={verify}
          t={t}
        />
      )}
      {view === "reports" && (
        <ReportsView
          workflow={workflow}
          busy={busy}
          openLatestReport={() =>
            run(() => ceClient.openLatestReport(projectID))
          }
          t={t}
        />
      )}
      {view === "architecture" && (
        <ArchitectureView services={communityServices} t={t} />
      )}
    </ProductShell>
  );
}
