import assert from "node:assert/strict";
import { test } from "node:test";
import {
  countMetrics,
  engineBadgeTone,
  filterSources,
  groupByEngine,
} from "../../app/enterprise-react/src/lib/catalogView.js";

const FIXTURE_SOURCES = Object.freeze([
  {
    urn: "urn:answervice:source:pms",
    fqn: "pms.public.pms_stays",
    engine: "PostgreSQL",
    owner: "hotel_operations",
    status: "active",
    metric_ids: ["recognized_room_revenue", "rooms_occupancy_revenue"],
  },
  {
    urn: "urn:answervice:source:pos",
    fqn: "pos.pos_db.pos_orders",
    engine: "MySQL",
    owner: "food_and_beverage_operations",
    status: "active",
    metric_ids: ["fnb_net_revenue", "fnb_revenue_daypart"],
  },
  {
    urn: "urn:answervice:source:crm",
    fqn: "crm.dbo.crm_member_grade_history",
    engine: "SQL Server",
    owner: "membership_operations",
    status: "active",
    metric_ids: ["expired_points", "membership_event_time"],
  },
  {
    urn: "urn:answervice:source:facility",
    fqn: "facility.facility.facility_events",
    engine: "ClickHouse",
    owner: "facility_operations",
    status: "active",
    metric_ids: ["facility_revenue", "facility_operations"],
  },
  {
    urn: "urn:answervice:source:banquet",
    fqn: "banquet.public.banquet_bookings",
    engine: "PostgreSQL",
    owner: "banquet_sales",
    status: "active",
    metric_ids: ["actual_attendees", "banquet_revenue"],
  },
]);

test("fixture shape sanity: five sources with non-empty metric_ids", () => {
  assert.equal(FIXTURE_SOURCES.length, 5);
  for (const source of FIXTURE_SOURCES) {
    assert.ok(source.urn, "urn must exist");
    assert.ok(source.fqn, "fqn must exist");
    assert.ok(source.engine, "engine must exist");
    assert.ok(source.owner, "owner must exist");
    assert.ok(source.status, "status must exist");
    assert.ok(Array.isArray(source.metric_ids), "metric_ids must be an array");
    assert.ok(source.metric_ids.length > 0, `${source.urn} must have at least one metric_id`);
  }
});

test("filterSources is case-insensitive across urn, fqn, engine, owner, metric_ids", () => {
  const byUrn = filterSources(FIXTURE_SOURCES, { query: "URN:ANSWERVICE:SOURCE:PMS" });
  assert.equal(byUrn.length, 1);
  assert.equal(byUrn[0].engine, "PostgreSQL");

  const byFqn = filterSources(FIXTURE_SOURCES, { query: "crm.dbo" });
  assert.equal(byFqn.length, 1);
  assert.equal(byFqn[0].urn, "urn:answervice:source:crm");

  const byEngine = filterSources(FIXTURE_SOURCES, { query: "clickhouse" });
  assert.equal(byEngine.length, 1);
  assert.equal(byEngine[0].urn, "urn:answervice:source:facility");

  const byMetric = filterSources(FIXTURE_SOURCES, { query: "expired_points" });
  assert.equal(byMetric.length, 1);
  assert.equal(byMetric[0].urn, "urn:answervice:source:crm");
});

test("filterSources by engine keeps only matching engine entries", () => {
  const postgresql = filterSources(FIXTURE_SOURCES, { engine: "PostgreSQL" });
  assert.equal(postgresql.length, 2);
  for (const source of postgresql) assert.equal(source.engine, "PostgreSQL");

  const mysql = filterSources(FIXTURE_SOURCES, { engine: "MySQL" });
  assert.equal(mysql.length, 1);
  assert.equal(mysql[0].urn, "urn:answervice:source:pos");
});

test("filterSources combines query and engine filters", () => {
  const result = filterSources(FIXTURE_SOURCES, { engine: "PostgreSQL", query: "banquet" });
  assert.equal(result.length, 1);
  assert.equal(result[0].urn, "urn:answervice:source:banquet");

  const noneMatch = filterSources(FIXTURE_SOURCES, { engine: "MySQL", query: "crm" });
  assert.equal(noneMatch.length, 0);

  const allMysql = filterSources(FIXTURE_SOURCES, { engine: "MySQL", query: "" });
  assert.equal(allMysql.length, 1);
  assert.equal(allMysql[0].engine, "MySQL");
});

test("filterSources handles unknown / empty inputs safely", () => {
  assert.deepEqual(filterSources(null), []);
  assert.deepEqual(filterSources(undefined), []);
  assert.deepEqual(filterSources(FIXTURE_SOURCES, { query: "" }), FIXTURE_SOURCES);
  assert.deepEqual(filterSources(FIXTURE_SOURCES, { query: "   " }), FIXTURE_SOURCES);
});

test("countMetrics sums every source's metric_ids", () => {
  // 2 + 2 + 2 + 2 + 2 = 10
  assert.equal(countMetrics(FIXTURE_SOURCES), 10);
  assert.equal(countMetrics([{ metric_ids: ["a", "b", "c"] }, { metric_ids: [] }]), 3);
  assert.equal(countMetrics([]), 0);
  assert.equal(countMetrics(null), 0);
});

test("engineBadgeTone maps every known engine to a deterministic tone key", () => {
  assert.equal(engineBadgeTone("PostgreSQL"), "tone-blue");
  assert.equal(engineBadgeTone("MySQL"), "tone-amber");
  assert.equal(engineBadgeTone("SQL Server"), "tone-blue");
  assert.equal(engineBadgeTone("ClickHouse"), "tone-gold");
  // Unknown / empty engine falls back to the muted tone.
  assert.equal(engineBadgeTone("DuckDB"), "tone-muted");
  assert.equal(engineBadgeTone(""), "tone-muted");
  assert.equal(engineBadgeTone(null), "tone-muted");
});

test("groupByEngine preserves engine order and groups every source", () => {
  const groups = groupByEngine(FIXTURE_SOURCES);
  const engines = groups.map((group) => group.engine);
  assert.deepEqual(engines, ["PostgreSQL", "MySQL", "SQL Server", "ClickHouse"]);
  // Two sources share PostgreSQL (pms + banquet).
  const postgresql = groups.find((group) => group.engine === "PostgreSQL");
  assert.equal(postgresql.sources.length, 2);
  assert.equal(postgresql.tone, "tone-blue");
  const clickhouse = groups.find((group) => group.engine === "ClickHouse");
  assert.equal(clickhouse.sources.length, 1);
  assert.equal(clickhouse.sources[0].urn, "urn:answervice:source:facility");
});

test("groupByEngine buckets unknown engines under 'Other' last", () => {
  const groups = groupByEngine([
    { urn: "u1", fqn: "f", engine: "PostgreSQL", owner: "o", status: "active", metric_ids: [] },
    { urn: "u2", fqn: "f", engine: "DuckDB", owner: "o", status: "active", metric_ids: [] },
  ]);
  assert.deepEqual(groups.map((g) => g.engine), ["PostgreSQL", "Other"]);
  assert.equal(groups[1].sources[0].urn, "u2");
});

test("view helpers are deterministic — repeated calls produce identical output", () => {
  const first = filterSources(FIXTURE_SOURCES, { query: "pms" });
  const second = filterSources(FIXTURE_SOURCES, { query: "pms" });
  assert.deepEqual(first, second);
  const countA = countMetrics(FIXTURE_SOURCES);
  const countB = countMetrics(FIXTURE_SOURCES);
  assert.equal(countA, countB);
  const groupsA = groupByEngine(FIXTURE_SOURCES);
  const groupsB = groupByEngine(FIXTURE_SOURCES);
  assert.deepEqual(groupsA, groupsB);
});
