"""
RunOut — Shared Supabase client
Location: ingestion/common/client.py

Every ingester uses the Supabase HTTPS client (port 443) rather than a
direct Postgres connection, because some networks block the raw
Postgres ports.
"""

import os
import socket
from pathlib import Path
from urllib.parse import urlparse

from dotenv import load_dotenv
from supabase import create_client

_REPO_ROOT = Path(__file__).resolve().parents[2]
# override=True so a Jupyter kernel that cached a bad URL/key picks up .env edits.
load_dotenv(_REPO_ROOT / ".env", override=True)


def get_client():
    url = (os.environ.get("SUPABASE_URL") or "").strip()
    key = (os.environ.get("SUPABASE_SERVICE_KEY") or "").strip()
    if not url or not key:
        raise RuntimeError("SUPABASE_URL or SUPABASE_SERVICE_KEY not set — check your .env file")

    if key.startswith("sb_publishable_"):
        raise RuntimeError(
            "SUPABASE_SERVICE_KEY is a publishable key (sb_publishable_...). "
            "Ingestion and ML notebooks need a secret key. In Supabase Dashboard go to "
            "Project Settings -> API Keys and paste the secret key (sb_secret_...) "
            "or the legacy service_role JWT into SUPABASE_SERVICE_KEY in the repo-root .env."
        )

    host = urlparse(url).hostname
    if not host:
        raise RuntimeError(f"SUPABASE_URL is not a valid URL: {url!r}")
    try:
        socket.getaddrinfo(host, 443)
    except socket.gaierror as exc:
        raise RuntimeError(
            f"Cannot resolve Supabase host {host!r} (getaddrinfo failed). "
            "Copy the Project URL from Supabase Dashboard -> Settings -> API "
            "(https://<project-ref>.supabase.co) into SUPABASE_URL in the repo-root .env file."
        ) from exc

    return create_client(url, key)


def load_location_maps(sb):
    """Returns {name: seaport_id} and {name: location_id} so signals can
    carry real entity FKs instead of only free-text names."""
    ports = {r["name"]: r["seaport_id"] for r in sb.table("seaports").select("name,seaport_id").execute().data}
    locs = {r["name"]: r["location_id"] for r in sb.table("supplier_locations").select("name,location_id").execute().data}
    return ports, locs
