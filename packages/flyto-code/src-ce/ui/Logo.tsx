export interface LogoProps {
  compact?: boolean;
  className?: string;
}

/**
 * Public CE copy of the existing Flyto2 theme-layout Logo.
 * The artwork remains the canonical /public/favicon.svg asset.
 */
export function Logo({ compact = false, className = "" }: LogoProps) {
  return (
    <div className={`flyto-logo ${className}`.trim()}>
      <img
        className="flyto-logo-icon"
        src="/favicon.svg"
        alt="Warroom"
      />
      {!compact && (
        <span className="flyto-logo-wordmark">
          <span>War</span>room
        </span>
      )}
    </div>
  );
}
