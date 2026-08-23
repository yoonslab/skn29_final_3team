// Shimmer skeleton row used while the trace is running. Lives in a JSX file
// rather than the page so future pages (e.g. report revalidation) can reuse
// the same placeholder shapes.

export function ResultCardSkeleton() {
  return (
    <div
      className="result-skeleton"
      aria-hidden="true"
      data-testid="result-card-skeleton"
    >
      <div className="result-skeleton__line result-skeleton__line--title" />
      <div className="result-skeleton__line result-skeleton__line--meta" />
      <div className="result-skeleton__kpis">
        <div className="result-skeleton__kpi" />
        <div className="result-skeleton__kpi" />
        <div className="result-skeleton__kpi" />
      </div>
      <div className="result-skeleton__chart" />
    </div>
  );
}

// Three pulsing dots used in the delegation card "running" state and any
// other place we want to indicate that the agent is still working.
export function TypingDots({ label = "에이전트가 응답을 준비하고 있습니다" }) {
  return (
    <span
      className="typing-dots"
      role="status"
      aria-live="polite"
      aria-label={label}
    >
      <i /><i /><i />
    </span>
  );
}
