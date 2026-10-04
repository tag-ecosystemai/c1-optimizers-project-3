"""Debug: check dist_map content from seed."""
from ingestion.common.client import get_client
from dotenv import load_dotenv
load_dotenv()
sb = get_client()

# Simulate what the seed does
dists = sb.table("distributors").select("distributor_id,name").execute().data
dist_map = {}
for d in dists:
    dist_map[d["name"]] = d["distributor_id"]

print(f"dist_map has {len(dist_map)} entries")
for name, did in sorted(dist_map.items()):
    print(f"  {did:>5} -> {name}")

# Check if all 15 expected names are there
expected = [
    "West Coast Consumer Supply", "East Coast Wholesale Corp", "Central US Home Office",
    "Nordic Consumer Goods", "German Industrial Supply", "Iberian Home Office",
    "Brazil Consumer Dist", "Mexico Corporate Logistics", "Andean Home Office Supply",
    "Asia Consumer Hub", "Pacific Corporate Trading", "Oceania Home Office",
    "Africa Consumer Dist", "Africa Corporate Logistics", "Africa Home Office Supply",
]
missing = [n for n in expected if n not in dist_map]
print(f"\nMissing from dist_map: {missing}")
print(f"All present: {len(missing) == 0}")