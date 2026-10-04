"""Test the EXACT seed order loop logic"""
import os, csv
from supabase import create_client
from dotenv import load_dotenv

load_dotenv()
sb = create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_SERVICE_KEY"])

# Replicate seed's dist_map
ILLUSTRATIVE_DISTRIBUTORS = [
    {"name": "West Coast Consumer Supply", "segment": "Consumer",   "market": "USCA"},
    {"name": "East Coast Wholesale Corp",  "segment": "Corporate",  "market": "USCA"},
    {"name": "Central US Home Office",     "segment": "Home Office","market": "USCA"},
    {"name": "Nordic Consumer Goods",      "segment": "Consumer",   "market": "Europe"},
    {"name": "German Industrial Supply",   "segment": "Corporate",  "market": "Europe"},
    {"name": "Iberian Home Office",        "segment": "Home Office","market": "Europe"},
    {"name": "Brazil Consumer Dist",       "segment": "Consumer",   "market": "LATAM"},
    {"name": "Mexico Corporate Logistics", "segment": "Corporate",  "market": "LATAM"},
    {"name": "Andean Home Office Supply",  "segment": "Home Office","market": "LATAM"},
    {"name": "Asia Consumer Hub",          "segment": "Consumer",   "market": "Pacific Asia"},
    {"name": "Pacific Corporate Trading",  "segment": "Corporate",  "market": "Pacific Asia"},
    {"name": "Oceania Home Office",        "segment": "Home Office","market": "Pacific Asia"},
    {"name": "Africa Consumer Dist",       "segment": "Consumer",   "market": "Africa"},
    {"name": "Africa Corporate Logistics", "segment": "Corporate",  "market": "Africa"},
    {"name": "Africa Home Office Supply",  "segment": "Home Office","market": "Africa"},
]
dist_map = {}
for d in ILLUSTRATIVE_DISTRIBUTORS:
    existing = sb.table("distributors").select("distributor_id").eq("name", d["name"]).execute()
    if existing.data:
        dist_map[d["name"]] = existing.data[0]["distributor_id"]
    else:
        r = sb.table("distributors").insert({
            "name": d["name"], "customer_segment": d["segment"], "market": d["market"],
        }).execute()
        dist_map[d["name"]] = r.data[0]["distributor_id"]

print(f"dist_map size: {len(dist_map)}")

# Now process first 10 rows
with open(r"C:\Users\hannah.igboke\Downloads\archive\DataCoSupplyChainDataset.csv",
          encoding="latin-1", newline="") as f:
    rdr = csv.DictReader(f)
    rows = [next(rdr) for _ in range(10)]

for idx, r in enumerate(rows):
    oid = r["Order Id"]
    mkt = r["Market"].strip()
    seg = r["Customer Segment"].strip()
    matching = [d for d in ILLUSTRATIVE_DISTRIBUTORS if d["market"] == mkt and d["segment"] == seg]
    if not matching:
        print(f"  Row {idx}: NO MATCH for {mkt}/{seg}")
        continue
    chosen = matching[int(float(oid)) % len(matching)]
    chosen_name = chosen["name"]
    did = dist_map.get(chosen_name)
    print(f"  Row {idx}: {mkt}/{seg} -> {chosen_name} -> id={did}")
    if did is None:
        print(f"    BUG! {chosen_name!r} not in dist_map keys: {list(dist_map.keys())[:3]}")
        break