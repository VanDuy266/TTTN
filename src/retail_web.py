"""Session-isolated storefront backed by the existing retail prototype."""
import csv
import io
import re
import time
from functools import cached_property
from pathlib import Path
from tempfile import TemporaryDirectory
from typing import Literal
from uuid import uuid4

import numpy as np
import pandas as pd
from fastapi import APIRouter, HTTPException, Request, Response
from pydantic import BaseModel, Field

from src.business import RetailStore, funnel, product_group, recommend


router = APIRouter(prefix="/api/store")
COOKIE = "dad_demo_store"
NEW_CUSTOMER = "Khách mới"
SESSION_AGE = 4 * 60 * 60


class StoreDemo:
    def __init__(self, lab, artifacts):
        self.lab = lab
        self.artifacts = artifacts
        self.directory = TemporaryDirectory(prefix="dad-store-")

    @cached_property
    def catalog(self):
        catalog = pd.DataFrame(self.lab.catalog)[["item_id", "title"]]
        catalog["group"] = catalog.title.map(product_group)
        return catalog

    @cached_property
    def arrays(self):
        with np.load(self.artifacts / "serving.npz", allow_pickle=False) as legacy:
            similarity = legacy["similarity"]
        count = len(self.catalog)
        if similarity.shape != (count, count):
            raise RuntimeError("Retail similarity artifact shape mismatch")
        return {"similarity": similarity, "h3": self.lab.arrays["h3"],
                "popularity": self.lab.arrays["popularity"]}

    def session(self, request, response=None):
        key = request.cookies.get(COOKIE, "")
        directory = Path(self.directory.name)
        path = directory / f"{key}.sqlite" if re.fullmatch(r"[a-f0-9]{32}", key) else None
        if path and path.is_file() and time.time() - path.stat().st_mtime < SESSION_AGE:
            return RetailStore(path), key
        if response is None:
            raise HTTPException(409, "Phiên cửa hàng đã hết hạn. Hãy tải lại trang cửa hàng.")
        for candidate in directory.glob("*.sqlite"):
            if time.time() - candidate.stat().st_mtime >= SESSION_AGE:
                candidate.unlink(missing_ok=True)
        key = uuid4().hex
        store = RetailStore(directory / f"{key}.sqlite")
        store.seed_sample(self.catalog)
        response.set_cookie(COOKIE, key, max_age=SESSION_AGE, path="/api/store",
                            httponly=True, samesite="strict",
                            secure=request.url.scheme == "https" or
                            request.headers.get("x-forwarded-proto") == "https")
        return store, key


class Recommendation(BaseModel):
    profile: str = Field(default=NEW_CUSTOMER, max_length=32)
    seed: str = Field(default="", max_length=32)
    group: str = Field(default="Tất cả", max_length=50)
    cart_ids: list[str] = Field(default_factory=list, max_length=30)


class Event(BaseModel):
    item_id: str = Field(min_length=1, max_length=32)
    request_id: str = Field(pattern=r"^[a-f0-9]{32}$")
    event: Literal["click", "cart"]


class CartLine(BaseModel):
    quantity: int = Field(strict=True, ge=1, le=99)
    request_id: str = Field(pattern=r"^[a-f0-9]{32}$")


class Checkout(BaseModel):
    cart: dict[str, CartLine] = Field(min_length=1, max_length=30)
    checkout_key: str = Field(pattern=r"^[a-f0-9-]{36}$")


class InventoryCSV(BaseModel):
    csv: str = Field(min_length=1, max_length=250_000)


class ExperimentMode(BaseModel):
    enabled: bool


def demo(request):
    return request.app.state.store_demo


@router.get("/session")
def session(request: Request, response: Response):
    response.headers["Cache-Control"] = "no-store"
    service = demo(request)
    store, key = service.session(request, response)
    options = service.catalog.merge(store.inventory(), on="item_id")
    sellable = options[(options.active == 1) & (options.stock > 0)]
    return {"new_session": request.cookies.get(COOKIE) != key,
            "groups": sorted(sellable.group.unique()),
            "seeds": sellable[["item_id", "title", "group"]].to_dict("records"),
            "profiles": [profile["profile"] for profile in service.lab.profiles[:30]],
            "experiment_enabled": store.setting("experiment_enabled", "0") == "1"}


@router.post("/recommendations")
def recommendations(payload: Recommendation, request: Request):
    service = demo(request)
    store, visitor = service.session(request)
    if payload.profile != NEW_CUSTOMER and payload.profile not in service.lab.by_id:
        raise HTTPException(422, "Hồ sơ kiểm tra không hợp lệ.")
    if payload.seed and payload.seed not in set(service.catalog.item_id):
        raise HTTPException(422, "Sản phẩm quan tâm không có trong danh mục.")
    variant = store.variant(visitor)
    started = time.perf_counter()
    items, route = recommend(service.catalog, service.arrays, service.lab.profiles, payload.profile,
                             [payload.seed] if payload.seed else [], store.inventory(), variant,
                             payload.group, payload.cart_ids)
    elapsed = (time.perf_counter() - started) * 1000
    request_id = store.expose(visitor, variant, route, items.item_id, elapsed)
    return {"items": items.to_dict("records"), "route": route, "variant": variant, "request_id": request_id}


@router.post("/events")
def event(payload: Event, request: Request):
    store, visitor = demo(request).session(request)
    try:
        store.action(visitor, payload.request_id, payload.item_id, payload.event)
    except ValueError as error:
        raise HTTPException(409, str(error)) from error
    return {"status": "ok"}


@router.post("/orders")
def order(payload: Checkout, request: Request):
    store, visitor = demo(request).session(request)
    try:
        order_id = store.checkout(visitor, {key: line.model_dump() for key, line in payload.cart.items()},
                                  payload.checkout_key)
    except ValueError as error:
        raise HTTPException(409, str(error)) from error
    return {"id": order_id}


@router.get("/operations")
def operations(request: Request, response: Response):
    response.headers["Cache-Control"] = "no-store"
    service = demo(request)
    store, _ = service.session(request)
    tables = store.tables()
    orders = tables["orders"][["id", "total", "created_at"]].tail(30).iloc[::-1]
    lines = tables["order_items"].merge(store.inventory()[["item_id", "stock"]], on="item_id")
    lines = lines.merge(service.catalog[["item_id", "title"]], on="item_id")
    inventory = store.inventory()
    return {"orders": orders.to_dict("records"),
            "lines": lines[lines.order_id.isin(orders.id)].to_dict("records"),
            "funnel": funnel(tables).to_dict("records"),
            "sellable": int(((inventory.active == 1) & (inventory.stock > 0)).sum()),
            "inventory_source": store.setting("inventory_source")}


@router.get("/inventory.csv")
def inventory_csv(request: Request):
    store, _ = demo(request).session(request)
    return Response(store.inventory().to_csv(index=False), media_type="text/csv",
                    headers={"Content-Disposition": 'attachment; filename="ton-kho-mo-phong.csv"',
                             "Cache-Control": "no-store"})


@router.get("/events.csv")
def events_csv(request: Request):
    store, _ = demo(request).session(request)
    events = store.tables()["events"].drop(columns=["visitor"])
    return Response(events.to_csv(index=False), media_type="text/csv",
                    headers={"Content-Disposition": 'attachment; filename="su-kien-mo-phong.csv"',
                             "Cache-Control": "no-store"})


@router.post("/inventory")
def import_inventory(payload: InventoryCSV, request: Request):
    service = demo(request)
    store, _ = service.session(request)
    try:
        reader = csv.DictReader(io.StringIO(payload.csv.lstrip("\ufeff")), strict=True)
        required = {"item_id", "stock", "price", "active"}
        if set(reader.fieldnames or []) != required or len(reader.fieldnames) != len(required):
            raise ValueError("CSV cần bốn cột item_id, stock, price, active.")
        rows = list(reader)
        if any(None in row for row in rows):
            raise ValueError("Số cột CSV không hợp lệ.")
        count = store.import_inventory(pd.DataFrame(rows), service.catalog.item_id)
    except (csv.Error, ValueError) as error:
        raise HTTPException(422, str(error)) from error
    return {"imported": count}


@router.post("/experiment")
def experiment(payload: ExperimentMode, request: Request):
    store, _ = demo(request).session(request)
    store.configure("experiment_enabled", "1" if payload.enabled else "0")
    return {"enabled": payload.enabled}
