"""
RunOut — Shared Supabase client
Location: ingestion/common/client.py

Every ingester uses the Supabase HTTPS client (port 443) rather than a
direct Postgres connection, because some networks block the raw
Postgres ports.
"""

import os
from dotenv import load_dotenv
from supabase import create_client

load_dotenv()


def get_client():
    url = os.environ.get("SUPABASE_URL")
    key = os.environ.get("SUPABASE_SERVICE_KEY")
    if not url or not key:
        raise RuntimeError("SUPABASE_URL or SUPABASE_SERVICE_KEY not set — check your .env file")
    return create_client(url, key)


def load_location_maps(sb):
    """Returns {name: seaport_id} and {name: location_id} so signals can
    carry real entity FKs instead of only free-text names."""
    ports = {r["name"]: r["seaport_id"] for r in sb.table("seaports").select("name,seaport_id").execute().data}
    locs = {r["name"]: r["location_id"] for r in sb.table("supplier_locations").select("name,location_id").execute().data}
    return ports, locs
