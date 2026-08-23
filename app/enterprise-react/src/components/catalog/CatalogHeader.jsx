// CatalogHeader — page title + version badge + total count pill.

import { Layers } from "lucide-react";

function safeVersion(version) {
  return typeof version === "string" && version.trim() ? version.trim() : "version unknown";
}

export function CatalogHeader({ title, description, version, totalSources, totalMetrics }) {
  return (
    <header className="dh-header">
      <div className="dh-header__copy">
        <p className="dh-header__eyebrow">DataHub · Trino Federation</p>
        <h1 className="dh-header__title">{title}</h1>
        {description ? <p className="dh-header__sub">{description}</p> : null}
      </div>
      <div className="dh-header__meta">
        <span className="dh-version-pill" aria-label="DataHub contract version">
          <Layers size={12} />
          {safeVersion(version)}
        </span>
        <span className="dh-count-pill" aria-label={`총 원천 ${totalSources}건`}>
          <em>{totalSources}</em>총 원천
          <span aria-hidden="true">·</span>
          <em>{totalMetrics}</em>승인 지표
        </span>
      </div>
    </header>
  );
}
