import { useState, type FormEvent } from "react";
import { ceClient } from "../api";
import {
  languages,
  translate,
  type Language,
  type TranslationKey,
} from "../i18n";
import type { ThemeMode, User } from "../types";
import { Icon } from "./icons";
import { Logo } from "./Logo";
import { ErrorBanner } from "./primitives";

export interface AuthScreenProps {
  language: Language;
  setLanguage: (language: Language) => void;
  theme: ThemeMode;
  cycleTheme: () => void;
  initialSetup: boolean;
  onAuthenticated: (user: User) => void;
}

export function AuthScreen({
  language,
  setLanguage,
  theme,
  cycleTheme,
  initialSetup,
  onAuthenticated,
}: AuthScreenProps) {
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
    <main className="original-auth-root">
      <aside
        className="original-auth-preferences"
        aria-label={`${t("app.language")} / ${t("app.theme")}`}
      >
        <label className="select-control">
          <Icon name="globe" size={16} />
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
          <Icon name={theme === "light" ? "sun" : "moon"} size={17} />
        </button>
      </aside>

      <section className="original-auth-paper">
        <form className="original-auth-form" onSubmit={submit}>
          <div className="original-auth-title">
            <Logo compact />
            <h1>{setup ? t("auth.setup") : t("auth.login")}</h1>
          </div>
          <p className="original-auth-subtitle">{t("auth.subtitle")}</p>
          <div className="local-badge">
            <span className="status-dot status-online" />
            {t("app.local")}
          </div>
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
              placeholder="admin@flyto2.com"
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
          <button className="primary-button original-auth-submit" disabled={busy}>
            {busy
              ? "Working…"
              : setup
                ? t("auth.submitSetup")
                : t("auth.submitLogin")}
          </button>
          <button
            className="text-button"
            type="button"
            onClick={() => setSetup((value) => !value)}
          >
            {setup ? t("auth.switchLogin") : t("auth.switchSetup")}
          </button>
        </form>
      </section>

      <section className="original-auth-message">
        <svg
          className="original-auth-circles"
          viewBox="0 0 960 540"
          width="100%"
          height="100%"
          preserveAspectRatio="xMidYMax slice"
          aria-hidden="true"
        >
          <g fill="none" stroke="currentColor" strokeWidth="100">
            <circle r="234" cx="196" cy="23" />
            <circle r="234" cx="790" cy="491" />
          </g>
        </svg>
        <svg
          className="original-auth-dots"
          viewBox="0 0 220 192"
          width="220"
          height="192"
          fill="none"
          aria-hidden="true"
        >
          <defs>
            <pattern
              id="auth-dot-pattern"
              x="0"
              y="0"
              width="20"
              height="20"
              patternUnits="userSpaceOnUse"
            >
              <rect width="4" height="4" fill="currentColor" />
            </pattern>
          </defs>
          <rect width="220" height="192" fill="url(#auth-dot-pattern)" />
        </svg>
        <div className="original-auth-message-content">
          <div className="original-auth-welcome">
            <div>Welcome to</div>
            <div>Flyto2 Warroom</div>
          </div>
          <p>
            One workspace for repository risk, deterministic evidence,
            remediation verification, and portable local reports.
          </p>
          <div className="original-auth-pillars">
            <div><strong>5</strong><span>CE runtimes</span></div>
            <div><strong>4</strong><span>Native scanners</span></div>
            <div><strong>16</strong><span>Local languages</span></div>
          </div>
          <ul>
            <li><span />Scan source without a hosted control plane</li>
            <li><span />Keep findings and evidence in your PostgreSQL</li>
            <li><span />Build every Community runtime from public source</li>
          </ul>
        </div>
      </section>
    </main>
  );
}
