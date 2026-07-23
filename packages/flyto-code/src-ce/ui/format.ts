export function formatDate(value?: string): string {
  if (!value) return "—";
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export function severityClass(value: string): string {
  return `severity severity-${value.toLowerCase()}`;
}
