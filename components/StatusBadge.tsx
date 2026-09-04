export function StatusBadge({ tone="neutral", children }: { tone?: "success"|"warning"|"danger"|"purple"|"neutral"; children: React.ReactNode }) {
  return <span className={`badge ${tone}`}>{children}</span>;
}
