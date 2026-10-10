import json
import httpx

BASE = "http://localhost:8000"
PW = "runout-demo"


def login(email):
    r = httpx.post(f"{BASE}/auth/login", json={"email": email, "password": PW}, timeout=30)
    if r.status_code != 200:
        raise SystemExit(f"Login failed for {email}: {r.status_code} {r.text[:200]}")
    j = r.json()
    return {"Authorization": f"Bearer {j['access_token']}"}, j["user"]


def get(path, h, **extra):
    r = httpx.get(BASE + path, headers={**h, **extra}, timeout=90)
    try:
        return r.status_code, r.json()
    except Exception:
        return r.status_code, r.text[:300]


ops, _ = login("ops@runout.demo")
dist, du = login("germany.consumer@runout.demo")
did = du["distributor_id"]

print("--- 1. /api/incidents?limit=2 as ops")
code, j = get("/api/incidents?limit=2", ops)
print(code, json.dumps(j, indent=1, default=str)[:3500])

print("\n--- 2. /api/my/overview as distributor")
code, a = get("/api/my/overview", dist)
print(code, json.dumps(a, indent=1, default=str)[:3500])

print(f"\n--- 3. /api/my/overview as ops, View as distributor {did}")
code, b = get(f"/api/my/overview?distributor_id={did}", ops, **{"X-View-As": "distributor"})
print(code, "same as the real distributor's response:", a == b)

print("\n--- 4. money leak check on the distributor views")
bad = [w for w in ("money", "cost_usd", "profit", "margin", "evidence", "shap") if w in json.dumps([a, b]).lower()]
print("forbidden words found:", bad or "none")