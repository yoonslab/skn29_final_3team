from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path
from typing import Any


def _repo_root() -> Path:
    # app/backend/app/services/datahub_catalog.py -> repo root
    return Path(__file__).resolve().parents[4]


@lru_cache(maxsize=1)
def _load_json(relative: str) -> dict[str, Any]:
    path = _repo_root() / relative
    return json.loads(path.read_text(encoding="utf-8"))


def _metric_glossary() -> dict[str, Any]:
    return _load_json("src/ai/contracts/metric_glossary.i5.v1.json")


def _context_contract() -> dict[str, Any]:
    return _load_json("src/data/analytics_context_contract.i4.v2.json")


def _serving_contract() -> dict[str, Any]:
    return _load_json("src/data/serving_analytics_contract.i4.v1.json")


def _source_registry() -> dict[str, Any]:
    return _load_json("src/data/source_registry.v1.json")


def _source_for_asset_fqn(fqn: str) -> str | None:
    """Map an asset FQN to its source catalog id (pms/pos/crm/facility/banquet)."""
    if fqn.startswith("crm."):
        return "crm"
    for view in _serving_contract().get("views", ()):
        if view.get("fqn") == fqn:
            upstream = view.get("upstream_fqns") or []
            if upstream:
                return str(upstream[0]).split(".", 1)[0]
    return None


def build_catalog() -> dict[str, Any]:
    """Read-only DataHub-style catalog derived from the frozen data contracts."""
    glossary = _metric_glossary()
    context = _context_contract()
    registry = _source_registry()

    metric_ids = list(glossary.get("metrics", {}))
    metric_asset = {
        str(metric.get("id")): str(metric.get("asset_fqn"))
        for metric in context.get("metrics", ())
        if isinstance(metric, dict) and metric.get("id") in metric_ids
    }

    sources_by_id = {
        str(source.get("source_id")): source
        for source in registry.get("sources", ())
        if isinstance(source, dict)
    }

    metric_ids_by_source: dict[str, list[str]] = {}
    for metric_id in metric_ids:
        asset_fqn = metric_asset.get(metric_id)
        source_id = _source_for_asset_fqn(asset_fqn) if asset_fqn else None
        if source_id and source_id in sources_by_id:
            metric_ids_by_source.setdefault(source_id, []).append(metric_id)

    sources = []
    for source_id, source in sources_by_id.items():
        sources.append(
            {
                "urn": f"urn:answervice:source:{source_id}",
                "fqn": source_id,
                "engine": str(source.get("engine", "")),
                "owner": str(source.get("data_owner", "")),
                "status": str(source.get("active_status", "")),
                "metric_ids": sorted(metric_ids_by_source.get(source_id, [])),
            }
        )

    return {
        "version": str(glossary.get("version", "")),
        "sources": sources,
    }
