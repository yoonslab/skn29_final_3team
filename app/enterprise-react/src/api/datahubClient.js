// DataHub catalog client. Mirrors the analysisClient pattern: a default mock
// fixture client derived from catalogFixtures plus an HTTP branch when
// VITE_DATAHUB_MODE is not "mock". HTTP failures (network, non-2xx, malformed
// JSON, shape mismatch) fall back to the fixture payload so the page never
// shows a dead error block in development.

import { catalogSources, I3_DATA_CONTRACT_VERSION } from "../data/catalogFixtures.ts";

export const DATAHUB_CONTRACT_VERSION = "I1-v1.0.0";
export const OPENAPI_VERSION = "OPENAPI-v1.0.0";

const METRIC_BY_DOMAIN = Object.freeze({
  pms: ["recognized_room_revenue", "rooms_occupancy_revenue"],
  pos: ["fnb_net_revenue", "fnb_revenue_daypart"],
  crm: ["expired_points", "membership_event_time"],
  facility: ["facility_revenue", "facility_operations"],
  banquet: ["actual_attendees", "banquet_revenue"],
});

const FQN_BY_DOMAIN = Object.freeze({
  pms: "pms.public.pms_stays",
  pos: "pos.pos_db.pos_orders",
  crm: "crm.dbo.crm_member_grade_history",
  facility: "facility.facility.facility_events",
  banquet: "banquet.public.banquet_bookings",
});

const SOURCE_URN_PREFIX = "urn:li:dataset:(urn:li:dataPlatform:";

function buildFixturePayload() {
  const sources = catalogSources.map((entry) => {
    const domain = entry.sourceId;
    const metricIds = METRIC_BY_DOMAIN[domain] ?? [];
    const urn = `${SOURCE_URN_PREFIX}${entry.engine.toLowerCase().replace(/\s+/g, "")},${entry.datasetUrn.split(",")[1] ?? entry.fqn},PROD)`;
    return {
      urn,
      fqn: FQN_BY_DOMAIN[domain] ?? entry.fqn,
      engine: entry.engine,
      owner: entry.sourceId.replace(/_/g, " "),
      status: entry.ingestionStatus === "CONFIG_VALIDATED" ? "active" : entry.ingestionStatus.toLowerCase(),
      metric_ids: metricIds,
    };
  });
  return {
    version: DATAHUB_CONTRACT_VERSION,
    sources,
  };
}

function getEnv() {
  // import.meta.env is replaced at build time by Vite. Guard for SSR / tests
  // where the object may not exist.
  return (typeof import.meta !== "undefined" && import.meta.env) || {};
}

export const usesMockDatahubClient = (() => {
  const env = getEnv();
  return env.VITE_DATAHUB_MODE === "mock";
})();

function resolveBaseUrl() {
  const env = getEnv();
  const configured = env.VITE_DATAHUB_CATALOG_URL;
  if (configured && String(configured).trim()) return String(configured).trim();
  return "http://127.0.0.1:18000";
}

export function getFixturePayload() {
  return buildFixturePayload();
}

export function listFixtureMetricIds() {
  return Object.values(METRIC_BY_DOMAIN).flat();
}

async function fetchHttpPayload(baseUrl, request = fetch) {
  const url = `${baseUrl.replace(/\/$/, "")}/api/v1/datahub/catalog`;
  const response = await request(url, {
    method: "GET",
    headers: {
      Accept: "application/json",
      "X-Contract-Version": OPENAPI_VERSION,
      "X-Client": "answervice-frontend",
    },
  });
  if (!response || !response.ok) {
    throw new Error(`datahub http ${response ? response.status : "no-response"}`);
  }
  const payload = await response.json();
  if (!payload || !Array.isArray(payload.sources)) {
    throw new Error("datahub http payload missing sources[]");
  }
  return payload;
}

export function createHttpDatahubClient(baseUrl = resolveBaseUrl(), request = fetch) {
  return {
    async loadCatalog() {
      const fallback = buildFixturePayload();
      try {
        const payload = await fetchHttpPayload(baseUrl, request);
        if (!payload.version) {
          return { ...fallback, sources: payload.sources, origin: "http+fallback-version" };
        }
        return { ...payload, origin: "http" };
      } catch (error) {
        return { ...fallback, origin: "http-fallback", error: String(error && error.message || error) };
      }
    },
  };
}

export function createMockDatahubClient() {
  return {
    async loadCatalog() {
      // Mirror the 250ms simulated latency used by the analysis mock client so
      // the loading state is visible during local development.
      await new Promise((resolve) => {
        const timer = typeof setTimeout === "function" ? setTimeout : null;
        if (timer) timer(resolve, 120);
        else resolve();
      });
      return { ...buildFixturePayload(), origin: "mock" };
    },
  };
}

export function createDatahubClient() {
  return usesMockDatahubClient ? createMockDatahubClient() : createHttpDatahubClient();
}

export const DATASET_URN_TEMPLATES = Object.freeze({
  contract: I3_DATA_CONTRACT_VERSION,
  fixture: DATAHUB_CONTRACT_VERSION,
});
