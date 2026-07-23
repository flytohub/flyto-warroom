import type { ReactNode } from "react";
import {
  languages,
  type Language,
  type TranslationKey,
} from "../i18n";
import type { Project, ThemeMode, User, View } from "../types";
import { CosmicBackground } from "./CosmicBackground";
import { Icon, type IconName } from "./icons";
import { Logo } from "./Logo";

const navigation: Array<{
  view: View;
  icon: IconName;
  label: TranslationKey;
}> = [
  { view: "overview", icon: "overview", label: "nav.overview" },
  { view: "repositories", icon: "repository", label: "nav.repositories" },
  { view: "evidence", icon: "evidence", label: "nav.evidence" },
  { view: "remediation", icon: "check", label: "nav.remediation" },
  { view: "reports", icon: "file", label: "nav.reports" },
  { view: "architecture", icon: "architecture", label: "nav.architecture" },
];

export interface ProductShellProps {
  children: ReactNode;
  view: View;
  setView: (view: View) => void;
  user: User;
  projects: Project[];
  projectID: string;
  loadWorkspace: (projectID?: string) => Promise<void>;
  language: Language;
  setLanguage: (language: Language) => void;
  theme: ThemeMode;
  cycleTheme: () => void;
  busy: boolean;
  refresh: () => Promise<void>;
  signOut: () => void;
  t: (key: TranslationKey) => string;
}

export function ProductShell({
  children,
  view,
  setView,
  user,
  projects,
  projectID,
  loadWorkspace,
  language,
  setLanguage,
  theme,
  cycleTheme,
  busy,
  refresh,
  signOut,
  t,
}: ProductShellProps) {
  return (
    <div className="app-shell product-app-shell">
      <aside className="sidebar product-sidebar">
        <Logo className="product-sidebar-logo" />
        <div className="instance-state">
          <span className="status-dot status-online" />
          <span>
            <strong>{t("app.local")}</strong>
            <small>PostgreSQL · source build</small>
          </span>
        </div>
        <nav aria-label="Community product navigation">
          {navigation.map((item) => (
            <button
              type="button"
              key={item.view}
              className={view === item.view ? "active" : ""}
              onClick={() => setView(item.view)}
            >
              <Icon name={item.icon} size={17} />
              <span>{t(item.label)}</span>
              {view === item.view && <Icon className="nav-chevron" name="chevron" size={14} />}
            </button>
          ))}
        </nav>
        <div className="boundary-card">
          <span>COMMUNITY AUTHORITY</span>
          <strong>{t("overview.boundary")}</strong>
          <p>Transparent local evidence. Commercial orchestration remains outside this build.</p>
        </div>
        <div className="user-block">
          <span className="avatar">{user.displayName.slice(0, 2).toUpperCase()}</span>
          <span><strong>{user.displayName}</strong><small>{user.email}</small></span>
          <button type="button" onClick={signOut} title={t("app.signout")}>
            <Icon name="signout" size={16} />
          </button>
        </div>
      </aside>

      <main className="workspace product-workspace">
        <header className="topbar product-topbar">
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
            <span className="release-chip">Community · v0.5.0</span>
            <label className="select-control topbar-language">
              <Icon name="globe" size={15} />
              <select
                aria-label={t("app.language")}
                value={language}
                onChange={(event) => setLanguage(event.target.value as Language)}
              >
                {languages.map(([code, label]) => (
                  <option key={code} value={code}>{label}</option>
                ))}
              </select>
            </label>
            <button
              aria-label={t("app.theme")}
              className="icon-button"
              type="button"
              onClick={cycleTheme}
            >
              <Icon name={theme === "light" ? "sun" : "moon"} size={16} />
            </button>
            <button
              className="secondary-button refresh-button"
              type="button"
              disabled={busy}
              onClick={() => void refresh()}
            >
              <Icon name="refresh" size={15} />{t("app.refresh")}
            </button>
          </div>
        </header>
        <section className="product-stage">
          <CosmicBackground />
          <div className="content">{children}</div>
        </section>
      </main>
    </div>
  );
}
