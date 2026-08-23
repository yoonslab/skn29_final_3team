// DataHub catalog page. Reads via datahubClient (HTTP with fixture fallback)
// and applies pure view helpers from lib/catalogView. Card → drawer interaction
// uses a single sourceUrn state so only one detail panel is open at a time.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MetaStrip } from "../components/common/EnterpriseUi";
import { createDatahubClient } from "../api/datahubClient.js";
import {
  countMetrics,
  filterSources,
} from "../lib/catalogView.js";
import { I3_DATA_CONTRACT_VERSION, I3_SCHEMA_VERSION, I3_SEED_VERSION } from "../data/catalogFixtures";
import { CatalogHeader } from "../components/catalog/CatalogHeader.jsx";
import { CatalogFilters } from "../components/catalog/CatalogFilters.jsx";
import { SourceCard } from "../components/catalog/SourceCard.jsx";
import { SourceDetailDrawer } from "../components/catalog/SourceDetailDrawer.jsx";
import "../styles.datahub.css";

const datahubClient = createDatahubClient();

function LoadingState() {
  return (
    <div className="dh-loading" role="status" aria-live="polite">
      <div className="dh-loading-bar" aria-hidden="true" />
      <p style={{ marginTop: 12 }}>DataHub 카탈로그를 불러오는 중…</p>
    </div>
  );
}

function ErrorState({ message }) {
  return (
    <div className="dh-error" role="alert">
      <b>카탈로그를 불러올 수 없습니다</b>
      <span>{message}</span>
    </div>
  );
}

function EmptyState({ hasFilter, onReset }) {
  return (
    <div className="dh-empty">
      <b>{hasFilter ? "조건에 맞는 데이터 원천이 없습니다" : "표시할 데이터 원천이 없습니다"}</b>
      <span>
        {hasFilter
          ? "검색어 또는 engine 필터를 조정하거나 초기화해 다시 시도하세요."
          : "DataHub 카탈로그가 비어 있습니다."}
      </span>
      {hasFilter ? (
        <div className="dh-empty__actions">
          <button
            type="button"
            className="dh-empty__reset"
            onClick={onReset}
            aria-label="카탈로그 필터 초기화"
          >
            필터 초기화
          </button>
        </div>
      ) : null}
    </div>
  );
}

function KpiStrip({ totalSources, totalEngines, totalMetrics }) {
  return (
    <section className="dh-kpis" aria-label="DataHub 카탈로그 핵심 지표">
      <article className="dh-kpi">
        <span className="dh-kpi__label">원천</span>
        <span className="dh-kpi__value">{totalSources}</span>
        <span className="dh-kpi__hint">연결된 데이터 원천 수</span>
      </article>
      <article className="dh-kpi">
        <span className="dh-kpi__label">엔진</span>
        <span className="dh-kpi__value">{totalEngines}</span>
        <span className="dh-kpi__hint">고유 엔진 종류</span>
      </article>
      <article className="dh-kpi">
        <span className="dh-kpi__label">승인 지표</span>
        <span className="dh-kpi__value">{totalMetrics}</span>
        <span className="dh-kpi__hint">합성 metric_id 누적</span>
      </article>
    </section>
  );
}

export function CatalogPage() {
  const [payload, setPayload] = useState(null);
  const [error, setError] = useState(null);
  const [query, setQuery] = useState("");
  const [engine, setEngine] = useState("");
  const [expandedUrn, setExpandedUrn] = useState(null);
  const triggerRefs = useRef(new Map());
  const drawerRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    datahubClient
      .loadCatalog()
      .then((result) => {
        if (cancelled) return;
        setPayload(result);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : String(err));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const sources = useMemo(() => {
    if (!payload || !Array.isArray(payload.sources)) return [];
    return payload.sources;
  }, [payload]);

  const filtered = useMemo(
    () => filterSources(sources, { query, engine }),
    [sources, query, engine],
  );

  const expandedSource = useMemo(() => {
    if (!expandedUrn) return null;
    return sources.find((source) => source.urn === expandedUrn) || null;
  }, [expandedUrn, sources]);

  const totalMetrics = useMemo(() => countMetrics(sources), [sources]);
  const totalEngines = useMemo(() => {
    const engines = new Set();
    for (const source of sources) {
      if (source && source.engine) engines.add(String(source.engine));
    }
    return engines.size;
  }, [sources]);

  const closeDrawer = useCallback(() => {
    const previousUrn = expandedUrn;
    setExpandedUrn(null);
    if (previousUrn) {
      const trigger = triggerRefs.current.get(previousUrn);
      if (trigger && typeof trigger.focus === "function") {
        trigger.focus();
      }
    }
  }, [expandedUrn]);

  useEffect(() => {
    if (!expandedSource) return undefined;
    const handleKey = (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeDrawer();
      }
    };
    window.addEventListener("keydown", handleKey);
    window.requestAnimationFrame(() => drawerRef.current?.focus());
    return () => window.removeEventListener("keydown", handleKey);
  }, [expandedSource, closeDrawer]);

  const registerTrigger = useCallback((urn, node) => {
    if (node) triggerRefs.current.set(urn, node);
    else triggerRefs.current.delete(urn);
  }, []);

  const resetFilters = useCallback(() => {
    setQuery("");
    setEngine("");
  }, []);

  if (error) {
    return (
      <div className="page-content">
        <ErrorState message={error} />
      </div>
    );
  }

  if (!payload) {
    return (
      <div className="page-content">
        <LoadingState />
      </div>
    );
  }

  return (
    <div className="page-content">
      <MetaStrip
        meta={{
          synthetic: true,
          seed: I3_SEED_VERSION,
          schemaVersion: I3_SCHEMA_VERSION,
        }}
      />
      <div className="dh-page">
        <CatalogHeader
          title="DataHub 카탈로그"
          description={`${I3_DATA_CONTRACT_VERSION} · 5개 합성 원천의 URN, FQN, engine, owner, status, 승인 지표를 한 화면에서 확인합니다.`}
          version={payload.version}
          totalSources={sources.length}
          totalMetrics={totalMetrics}
        />

        <KpiStrip
          totalSources={sources.length}
          totalEngines={totalEngines}
          totalMetrics={totalMetrics}
        />

        <CatalogFilters
          query={query}
          engine={engine}
          onQueryChange={setQuery}
          onEngineChange={setEngine}
          totalShown={filtered.length}
        />

        {filtered.length === 0 ? (
          <EmptyState hasFilter={Boolean(query || engine)} onReset={resetFilters} />
        ) : (
          <div className="dh-grid" role="list" aria-label="데이터 원천 카드">
            {filtered.map((source) => (
              <div role="listitem" key={source.urn}>
                <SourceCard
                  source={source}
                  expanded={expandedUrn === source.urn}
                  onToggle={(urn) => {
                    if (expandedUrn === urn) {
                      setExpandedUrn(null);
                      return;
                    }
                    setExpandedUrn(urn);
                    const trigger = triggerRefs.current.get(urn);
                    if (trigger && typeof trigger.focus === "function") {
                      trigger.focus();
                    }
                  }}
                  buttonRef={(node) => registerTrigger(source.urn, node)}
                />
              </div>
            ))}
          </div>
        )}

        {expandedSource ? (
          <SourceDetailDrawer
            ref={drawerRef}
            source={expandedSource}
            onClose={closeDrawer}
          />
        ) : null}
      </div>
    </div>
  );
}
