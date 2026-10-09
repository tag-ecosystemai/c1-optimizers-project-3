"""Live role matrix. Needs the API running and the demo accounts seeded. Run: pytest tests/test_roles.py -q
Nothing here changes data: write attempts are only the ones that must be refused."""
import json

import httpx
import pytest

pytestmark = pytest.mark.live
FORBIDDEN_KEYS = {"money_at_risk_usd", "profit", "profit_ratio", "margin", "benefit", "cost_usd", "evidence", "shap", "recommended_options",
                  "decisions", "distributors", "distributors_affected", "probable_cause", "cause_confidence", "cost_per_unit_covered"}


def all_keys(obj):
    if isinstance(obj, dict):
        for k, v in obj.items():
            yield k
            yield from all_keys(v)
    elif isinstance(obj, list):
        for v in obj:
            yield from all_keys(v)


def leaks(payload):
    bad = {k for k in all_keys(payload) if k in FORBIDDEN_KEYS or "money" in k or "margin" in k or "profit" in k}
    if "$" in json.dumps(payload):
        bad.add("a dollar sign in a value")
    return bad


# (who, path, expected status)
MATRIX = [
    (None, "/api/me", 401),
    ("dist_a", "/api/me", 200), ("ops", "/api/me", 200),
    ("dist_a", "/api/ops/summary", 403), ("dist_a", "/api/ops/network", 403), ("dist_a", "/api/decisions", 403),
    ("dist_a", "/api/observability", 403), ("dist_a", "/api/observability/models", 403), ("dist_a", "/api/warehouse/overview", 403),
    ("wh_europe", "/api/ops/summary", 403), ("wh_europe", "/api/decisions", 403), ("wh_europe", "/api/observability", 403),
    ("wh_europe", "/api/my/orders", 403),
    ("ops", "/api/ops/summary", 200), ("ops", "/api/ops/network", 200), ("ops", "/api/decisions", 200),
    ("ops", "/api/observability", 403), ("ops", "/api/my/orders", 403),
    ("data", "/api/observability", 200), ("data", "/api/observability/pipeline", 200), ("data", "/api/observability/agent", 200),
    ("wh_europe", "/api/warehouse/overview", 200), ("wh_europe", "/api/warehouse/inventory", 200),
    ("dist_a", "/api/my/overview", 200), ("dist_a", "/api/my/orders", 200), ("dist_a", "/api/my/stock", 200),
]


@pytest.mark.parametrize("who,path,status", MATRIX)
def test_access_matrix(get, who, path, status):
    assert get(who, path).status_code == status


@pytest.mark.parametrize("path", ["/api/incidents", "/api/my/overview", "/api/my/orders", "/api/my/stock", "/api/dates"])
@pytest.mark.parametrize("who", ["dist_a", "dist_b"])
def test_distributor_responses_have_no_internal_fields(get, who, path):
    r = get(who, path)
    assert r.status_code == 200
    assert not leaks(r.json()), leaks(r.json())


def test_distributor_incident_detail_is_clean_and_scoped(get):
    for who in ("dist_a", "dist_b"):
        for item in get(who, "/api/incidents").json()["items"]:
            d = get(who, f"/api/incidents/{item['incident_id']}")
            assert d.status_code == 200
            assert not leaks(d.json()), leaks(d.json())
            for o in d.json()["affected_orders"]:
                assert get(who, f"/api/my/orders/{o['order_id']}").status_code == 200, "an order that is not theirs"

def test_distributor_cannot_open_another_distributors_order(get):
    mine = get("dist_a", "/api/my/orders?limit=5").json()["items"]
    if not mine:
        pytest.skip("no orders for dist_a")
    assert get("dist_b", f"/api/my/orders/{mine[0]['order_id']}").status_code == 404


def test_wrong_warehouse_cannot_see_an_incident(get):
    items = get("ops", "/api/incidents").json()["items"]
    if not items:
        pytest.skip("no incidents")
    market = items[0]["warehouse"]["market"]
    who = "wh_usca" if market != "USCA" else "wh_europe"
    assert get(who, f"/api/incidents/{items[0]['incident_id']}").status_code == 404


def test_decisions_are_refused_for_the_wrong_roles_and_bad_input(api, auth, get):
    items = get("ops", "/api/incidents").json()["items"]
    if not items:
        pytest.skip("no incidents")
    iid = items[0]["incident_id"]
    url = f"{api}/api/incidents/{iid}/decision"
    for who in ("dist_a", "data"):
        assert httpx.post(url, headers=auth[who], json={"action": "approved"}, timeout=30).status_code == 403
    assert httpx.post(url, headers=auth["wh_europe"], json={"action": "approved"}, timeout=30).status_code in (403,)
    assert httpx.post(url, headers=auth["ops"], json={"action": "dismissed"}, timeout=30).status_code == 422      # note required
    assert httpx.post(url, headers=auth["ops"], json={"action": "teleport"}, timeout=30).status_code == 422
    assert httpx.post(f"{api}/api/incidents/99999999/decision", headers=auth["ops"], json={"action": "approved"}, timeout=30).status_code in (404, 422)


def test_roles_cannot_be_chosen_by_the_caller(api):
    r = httpx.post(f"{api}/auth/signup", json={"email": "x@y.z", "password": "x", "role": "ops"}, timeout=30)
    assert r.status_code in (404, 405)                    # the signup endpoint no longer exists