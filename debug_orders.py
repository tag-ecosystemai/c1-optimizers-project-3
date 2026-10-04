"""Debug order matching."""
import csv, os
from supabase import create_client
from dotenv import load_dotenv

load_dotenv()
sb = create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_SERVICE_KEY"])

# Get distributors
dists_raw = sb.table("distributors").select("name,distributor_id,market,customer_segment").execute().data
print(f"Distributors in DB: {len(dists_raw)}")

# Build lookup by name
dists = {}
for d in dists_raw:
    dists[d["name"]] = d

# Check first CSV row matching
with open(r"C:\Users\hannah.igboke\Downloads\archive\DataCoSupplyChainDataset.csv",
          encoding="latin-1", newline="") as f:
    r = csv.DictReader(f)
    rows = [next(r) for _ in range(10)]

total_matched = 0
for row in rows:
    oid = row["Order Id"]
    mkt = row["Market"].strip()
    seg = row["Customer Segment"].strip()
    
    matching_names = [n for n, d in dists.items() if d["market"] == mkt and d["customer_segment"] == seg]
    
    if matching_names:
        idx = int(float(oid)) % len(matching_names)
        chosen = matching_names[idx]
        did = dists[chosen]["distributor_id"]
        total_matched += 1
        print(f"  MATCH: id={chosen} ({did}) for order {oid} [{mkt}/{seg}]")
    else:
        print(f"  NO MATCH for order {oid} [{mkt}/{seg}]")

print(f"\nMatched {total_matched}/10")