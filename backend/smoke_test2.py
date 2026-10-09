"""Second smoke test (views). Server must be running:  python backend/smoke_test2.py"""
import json
import httpx

BASE = "http://localhost:8000"
FORBIDDEN = ["money", "profit", "margin", "benefit", "cost_usd", "days_for_shipping_real", "shap", "evidence"]


def login(email):
    r = httpx.post(f"{BASE}/auth/login", json={"email": email, "password": "runout-demo"}, timeout=30)
    r.raise_for_status()
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


def get(path, h):
    return httpx.get(BASE + path, headers=h, timeout=90)


ops, data = login("ops@runout.demo"), login("data@runout.demo")
wh, dist = login("europe.warehouse@runout.demo"), login("germany.consumer@runout.demo")
fails = 0


def check(label, ok, extra=""):
    global fails
    fails += 0 if ok else 1
    print(("PASS " if ok else "FAIL ") + label, extra)


for path in ["/api/ops/summary", "/api/ops/network", "/api/decisions"]:
    r = get(path, ops)
    check(f"ops {path}", r.status_code == 200, r.status_code)
    check(f"distributor blocked from {path}", get(path, dist).status_code == 403)
s = get("/api/ops/summary", ops).json()
print("   summary:", {k: s[k] for k in ("as_of_date", "open_incidents", "money_at_risk_usd", "units_short", "orders_in_transit")})

check("data role can read observability", get("/api/observability", data).status_code == 200)
check("ops blocked from observability", get("/api/observability", ops).status_code == 403)

o = get("/api/warehouse/overview?warehouse_id=1", ops)
check("ops warehouse overview needs/accepts warehouse_id", o.status_code in (200, 422), o.status_code)
w = get("/api/warehouse/overview", wh)
check("warehouse overview", w.status_code == 200, w.status_code)
if w.status_code == 200:
    print("   ", {k: w.json()[k] for k in ("open_incidents", "total_stock_units", "skus_under_5_days_cover")})
check("warehouse inventory", get("/api/warehouse/inventory", wh).status_code == 200)
check("distributor blocked from warehouse overview", get("/api/warehouse/overview", dist).status_code == 403)

ov, orders = get("/api/my/overview", dist), get("/api/my/orders?limit=5", dist)
check("my/overview", ov.status_code == 200, ov.status_code)
check("my/orders", orders.status_code == 200, orders.status_code)
for label, resp in [("my/overview", ov), ("my/orders", orders)]:
    if resp.status_code == 200:
        bad = [w for w in FORBIDDEN if w in json.dumps(resp.json()).lower()]
        check(f"{label} has no forbidden fields", not bad, bad)
if orders.status_code == 200 and orders.json()["items"]:
    oid = orders.json()["items"][0]["order_id"]
    d = get(f"/api/my/orders/{oid}", dist)
    check("my/orders/{id} own order", d.status_code == 200, d.status_code)
    other = login("germany.corporate@runout.demo")
    check("other distributor cannot open it", get(f"/api/my/orders/{oid}", other).status_code == 404)
check("ops blocked from /api/my/orders", get("/api/my/orders", ops).status_code == 403)

print("\nRESULT:", "ALL PASS" if fails == 0 else f"{fails} FAILED")