"""Create the 22 demo accounts in app_users (password: runout-demo). Safe to re-run."""
import os
import sys
from dotenv import load_dotenv

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
load_dotenv()
from backend.auth import data_client, hash_password  # noqa: E402

PASSWORD = "runout-demo"
norm = lambda s: str(s or "").lower().replace("_", "").replace(" ", "")

sb = data_client()
wh = {norm(w["market"]): w["warehouse_id"] for w in sb.table("warehouses").select("warehouse_id,market").execute().data}
dist = {(norm(d["market"]), norm(d["customer_segment"])): d["distributor_id"]
        for d in sb.table("distributors").select("distributor_id,market,customer_segment").execute().data}

users = [("ops@runout.demo", "ops", "Jane Doe", None, None), ("data@runout.demo", "data", "Tunde Bakare", None, None)]
for code, market, label in [("europe", "Europe", "Europe"), ("usca", "USCA", "USCA"), ("latam", "LATAM", "LATAM"),
                            ("africa", "Africa", "Africa"), ("apac", "Pacific Asia", "Pacific Asia")]:
    users.append((f"{code}.warehouse@runout.demo", "warehouse", f"{label} warehouse manager", market, None))
for code, country, market in [("germany", "Germany", "Europe"), ("us", "US", "USCA"), ("brazil", "Brazil", "LATAM"),
                              ("nigeria", "Nigeria", "Africa"), ("australia", "Australia", "Pacific Asia")]:
    for seg_code, seg in [("consumer", "Consumer"), ("corporate", "Corporate"), ("homeoffice", "Home Office")]:
        users.append((f"{code}.{seg_code}@runout.demo", "distributor", f"{country} {seg}", market, seg))

rows, skipped = [], 0
for email, role, name, market, seg in users:
    d_id = w_id = None
    if role == "warehouse":
        w_id = wh.get(norm(market))
    if role == "distributor":
        d_id = dist.get((norm(market), norm(seg)))
    if (role == "warehouse" and w_id is None) or (role == "distributor" and d_id is None):
        print(f"SKIPPED {email}: no matching {'warehouse' if role == 'warehouse' else 'distributor'} for {market} {seg or ''}")
        skipped += 1
        continue
    rows.append({"email": email, "password_hash": hash_password(PASSWORD), "role": role,
                 "display_name": name, "distributor_id": d_id, "warehouse_id": w_id})

sb.table("app_users").upsert(rows, on_conflict="email").execute()
print(f"Upserted {len(rows)} users, skipped {skipped}.")