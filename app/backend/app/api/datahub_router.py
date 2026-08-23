from __future__ import annotations

from fastapi import APIRouter

from app.services.datahub_catalog import build_catalog

datahub_router = APIRouter(prefix="/api/v1", include_in_schema=False)


@datahub_router.get("/datahub/catalog")
def datahub_catalog() -> dict[str, object]:
    return build_catalog()
