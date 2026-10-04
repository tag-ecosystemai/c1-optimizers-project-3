"""Full dataset matching check."""
import os, csv
from dotenv import load_dotenv
from supabase import create_client

load_dotenv()
sb = create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_SERVICE_KEY"])

d = sb.table("distributors").select("name,distributor_id,market,customer_segment").execute().data
dists = {x["name"]: x for x in d}
names = list(dists.keys())

import time
t0 = time.time()
matched = 0
skipped = 0
with open(r"C:\Users\hannah.igboke\Downloads\archive\DataCoSupplyChainDataset.csv",
          encoding="latin-1", newline="") as f:
    r = csv.DictReader(f)
    for row in r:
        oid = row["Order Id"]
        mkt = row["Market"].strip()
        seg = row["Customer Segment"].strip()
        m = [n for n in names if dists[n]["market"] == mkt and dists[n]["customer_segment"] == seg]
        if m:
            matched += 1
        else:
            skipped += 1

t1 = time.time()
print(f"Matched: {matched:,}")
print(f"Skipped: {skipped:,}")
print(f"Total:   {matched+skipped:,}")
print(f"Time:    {t1-t0:.1f}s")
print(f"Match rate: {matched/(matched+skipped)*100:.1f}%")