import { buildTrustRow, TRUST_ROW } from "../../lib/trustRow.js";

// Trust row rendered directly under every result card. Pure presentation:
// receives the normalized run object, runs buildTrustRow, and renders the
// resulting { asOfLabel, synthetic, sources } triple.
export function TrustRow({ run }) {
  const trust = buildTrustRow(run);
  return (
    <section className="trust-row" aria-label="데이터 신뢰 정보">
      <span className="trust-row__as-of">{trust.asOfLabel}</span>
      {trust.synthetic ? (
        <span className="trust-row__synthetic" aria-label="합성 데이터">
          {TRUST_ROW.SYNTHETIC_LABEL}
        </span>
      ) : null}
      {trust.sources.length > 0 ? (
        <ul className="trust-row__sources" aria-label="근거 원천">
          {trust.sources.map((source) => (
            <li key={source.title}>
              <code title={source.title}>{source.label}</code>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
