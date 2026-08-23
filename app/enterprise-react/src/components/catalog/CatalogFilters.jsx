// CatalogFilters — search input + engine select. Fully controlled.

import { Search } from "lucide-react";
import { ENGINE_BUCKET_NAMES } from "../../lib/catalogView.js";

function engineLabel(value) {
  if (!value) return "전체 engine";
  return `engine: ${value}`;
}

export function CatalogFilters({ query, engine, onQueryChange, onEngineChange, totalShown }) {
  return (
    <div className="dh-filters" role="search" aria-label="카탈로그 필터">
      <label className="dh-search">
        <Search size={14} aria-hidden="true" />
        <input
          type="search"
          aria-label="카탈로그 검색"
          placeholder="URN, FQN, engine, owner, metric_id 검색"
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
        />
      </label>
      <label className="dh-select">
        <span aria-hidden="true">{engineLabel(engine)}</span>
        <select
          aria-label="engine 필터"
          value={engine}
          onChange={(event) => onEngineChange(event.target.value)}
        >
          <option value="">전체</option>
          {ENGINE_BUCKET_NAMES.map((name) => (
            <option key={name} value={name === "Other" ? "__other__" : name}>
              {name}
            </option>
          ))}
        </select>
      </label>
      <small style={{ marginLeft: "auto", color: "var(--muted)", fontSize: 11 }}>
        {totalShown}건 표시
      </small>
    </div>
  );
}
