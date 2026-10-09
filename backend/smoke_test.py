"""Role smoke test. Run with the server up:  python backend/smoke_test.py"""
import json
import httpx

BASE = "http://localhost:8000"
FORBIDDEN = ["money", "evidence", "shap", "recommended_options", "cost_usd", "benefit", "profit", "margin",
             "distributors_affected", "decisions"]


def login(email):
    r = httpx.post(f"{BASE}/auth/login", json={"email": email, "password": "runout-demo"}, timeout=30)
    r.raise_for_status()
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


def get(path, h):
    return httpx.get(BASE + path, headers=h, timeout=60)


ops, data, wh = login("ops@runout.demo"), login("data@runout.demo"), login("europe.warehouse@runout.demo")
dist_emails = ["germany.consumer@runout.demo", "germany.corporate@runout.demo", "germany.homeoffice@runout.demo"]

lst = get("/api/incidents", ops).json()
print(f"ops sees {len(lst['items'])} incidents for {lst['as_of_date']}")
ids = [i["incident_id"] for i in lst["items"]]
for i in lst["items"]:
    print("  ", i["incident_id"], i["severity"], i["product"]["name"], i["warehouse"]["market"], i["money_at_risk_usd"])

print("\nwarehouse (Europe) list:", len(get("/api/incidents", wh).json()["items"]))
usca = login("usca.warehouse@runout.demo")
print("warehouse (USCA) list:", len(get("/api/incidents", usca).json()["items"]), "(expected 0 on a Europe-only date)")

problems = 0
for em in dist_emails:
    h = login(em)
    dl = get("/api/incidents", h).json()
    text = json.dumps(dl).lower()
    bad = [w for w in FORBIDDEN if w in text]
    print(f"\n{em}: {len(dl['items'])} incidents; forbidden in list: {bad or 'none'}")
    problems += len(bad)
    for iid in ids:
        r = get(f"/api/incidents/{iid}", h)
        if r.status_code == 200:
            text = json.dumps(r.json()).lower()
            bad = [w for w in FORBIDDEN if w in text]
            print(f"   incident {iid}: 200, forbidden: {bad or 'none'}")
            problems += len(bad)
        else:
            print(f"   incident {iid}: {r.status_code} (not theirs)")
    r = httpx.post(f"{BASE}/api/incidents/{ids[0]}/decision", headers=h, json={"action": "approved"}, timeout=30)
    print("   distributor tries to approve ->", r.status_code, "(expected 403)")

print("\nops detail keys:", sorted(get(f"/api/incidents/{ids[0]}", ops).json().keys()))
print("\nRESULT:", "PASS, no forbidden fields" if problems == 0 else f"FAIL, {problems} forbidden hits")