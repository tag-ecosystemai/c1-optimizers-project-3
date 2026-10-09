"""Shared test setup. Offline tests need no server. Tests marked `live` need the API running (uvicorn backend.main:app --port 8000)."""
import os
import sys

import httpx
import pytest

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
sys.path.insert(0, ROOT)
BASE = os.environ.get("RUNOUT_API", "http://localhost:8000")
PASSWORD = "runout-demo"
ACCOUNTS = {
    "ops": "ops@runout.demo", "data": "data@runout.demo",
    "wh_europe": "europe.warehouse@runout.demo", "wh_usca": "usca.warehouse@runout.demo",
    "dist_a": "germany.consumer@runout.demo", "dist_b": "germany.corporate@runout.demo",
}


def pytest_configure(config):
    config.addinivalue_line("markers", "live: needs the API server running")


@pytest.fixture(scope="session")
def api():
    try:
        httpx.get(BASE + "/health", timeout=5).raise_for_status()
    except Exception:
        pytest.skip("API server is not running")
    return BASE


@pytest.fixture(scope="session")
def auth(api):
    out = {}
    for name, email in ACCOUNTS.items():
        r = httpx.post(f"{api}/auth/login", json={"email": email, "password": PASSWORD}, timeout=30)
        r.raise_for_status()
        out[name] = {"Authorization": f"Bearer {r.json()['access_token']}"}
    return out


@pytest.fixture(scope="session")
def get(api, auth):
    def _get(who, path):
        return httpx.get(api + path, headers=auth[who] if who else {}, timeout=90)
    return _get