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

const languageFlags: Record<Language, string> = {
  en: "🇺🇸",
  "zh-TW": "🇹🇼",
  "zh-CN": "🇨🇳",
  ja: "🇯🇵",
  ko: "🇰🇷",
  de: "🇩🇪",
  es: "🇪🇸",
  fr: "🇫🇷",
  hi: "🇮🇳",
  id: "🇮🇩",
  it: "🇮🇹",
  pl: "🇵🇱",
  "pt-BR": "🇧🇷",
  th: "🇹🇭",
  tr: "🇹🇷",
  vi: "🇻🇳",
};

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
    <main className="auth-layout">
      <aside
        className="auth-preferences"
        aria-label={`${t("app.language")} / ${t("app.theme")}`}
      >
        <label className="select-control">
          <span className="language-flag" aria-hidden="true">
            {languageFlags[language]}
          </span>
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

      <section className="auth-paper">
        <form className="auth-form" onSubmit={submit}>
          <div className="auth-title">
            <Logo compact />
            <h1>{setup ? t("auth.setup") : t("auth.signIn")}</h1>
          </div>
          {setup && (
            <p className="auth-setup-copy">{t("auth.setupDescription")}</p>
          )}
          {error && <ErrorBanner message={error} clear={() => setError("")} />}
          {setup && (
            <label className="auth-field">
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
          <label className="auth-field">
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
          <label className="auth-field">
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
          <button
            className="primary-button auth-submit"
            disabled={
              busy
              || !email
              || password.length < 12
              || (setup && name.trim().length < 2)
            }
          >
            {busy
              ? "Working…"
              : setup
                ? t("auth.submitSetup")
                : t("auth.submitLogin")}
          </button>
          {setup && (
            <p className="auth-switch">
              {t("auth.hasAdmin")}
              <button
                className="text-button"
                type="button"
                onClick={() => setSetup(false)}
              >
                {t("auth.signIn")}
              </button>
            </p>
          )}
        </form>
      </section>

      <section className="auth-message">
        <svg
          className="auth-circles"
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
          className="auth-dots"
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
        <div className="auth-message-content">
          <div className="auth-welcome">
            <div>{t("auth.welcomeTo")}</div>
            <div>{t("auth.welcomeSubtitle")}</div>
          </div>
          <p>{t("auth.welcomeDescription")}</p>
          <div className="auth-pillars">
            <div><strong>19+</strong><span>{t("auth.pillarScanners")}</span></div>
            <div><strong>12</strong><span>{t("auth.pillarPlaybooks")}</span></div>
            <div><strong>17</strong><span>{t("auth.pillarLocales")}</span></div>
          </div>
          <ul>
            <li><span />{t("auth.pillarBullet1")}</li>
            <li><span />{t("auth.pillarBullet2")}</li>
            <li><span />{t("auth.pillarBullet3")}</li>
          </ul>
        </div>
      </section>
    </main>
  );
}
