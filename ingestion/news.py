"""
RunOut — News Ingestion
Location: ingestion/news.py

Pulls real news events from GDELT's free DOC 2.0 API — one combined
query per seaport city / origin country covering disruption keywords —
and writes one idempotent signal per term into `signals`.

GDELT allows ~1 request / 5s per IP and returns 429 when exceeded, so
requests are spaced and rate-limits trigger a backoff.

No API key required.

Usage:
    python ingestion/news.py   (run from the repo root)
"""

import os
import time
import requests
from common.client import get_client
from common.db_writer import save_signal

GDELT_URL = "https://api.gdeltproject.org/api/v2/doc/doc"
REQUEST_SPACING_SECONDS = int(os.environ.get("GDELT_SPACING_SECONDS", "6"))
GDELT_TIMESPAN = os.environ.get("GDELT_TIMESPAN", "3d")   # e.g. '3d' live, or a date range for backfill

DISRUPTION_CLAUSE = (
    '("port congestion" OR strike OR "customs delay" OR '
    '"shipping delay" OR typhoon OR storm)'
)


class RateLimitedError(Exception):
    pass


def clean_term(text):
    return text.replace("S.A.R.", "").strip(" ,")


def get_watch_terms(sb):
    """Seaports searched by city name; origin-side countries searched whole.
    US is excluded — 'United States' + 'strike' would match every US story."""
    terms = set()
    for row in sb.table("seaports").select("name,country,role").execute().data:
        terms.add(clean_term(row["name"].split(",")[0]))
        if row.get("role") == "origin" and row.get("country"):
            terms.add(clean_term(row["country"]))
    for row in sb.table("supplier_locations").select("country").execute().data:
        if row.get("country"):
            terms.add(clean_term(row["country"]))
    return sorted(t for t in terms if t)


def build_query(term):
    return f'"{term}" {DISRUPTION_CLAUSE}'


def fetch_news(query, max_retries=3):
    params = {"query": query, "mode": "artlist", "maxrecords": 10,
              "timespan": GDELT_TIMESPAN, "format": "json"}
    for attempt in range(1, max_retries + 1):
        response = requests.get(GDELT_URL, params=params, timeout=30)
        text = response.text.strip()
        if response.status_code == 429 or "5 seconds" in text:
            wait = 30 * attempt
            print(f"  Rate limited — waiting {wait}s (retry {attempt}/{max_retries})")
            time.sleep(wait)
            continue
        response.raise_for_status()
        if not text:
            return {"articles": []}
        if not text.startswith("{"):
            raise ValueError(f"GDELT rejected the query: {text[:120]}")
        return response.json()
    raise RateLimitedError("GDELT still rate-limiting after retries")


def run():
    sb = get_client()
    terms = get_watch_terms(sb)
    if not terms:
        print("Warning: no seaports or supplier locations found. Run the seed scripts first.")
        return

    print(f"Searching news for {len(terms)} locations "
          f"(~{len(terms) * REQUEST_SPACING_SECONDS // 60 + 1} min)...")

    with_results, empty, failed = 0, 0, 0

    for term in terms:
        query = build_query(term)
        try:
            data = fetch_news(query)
            articles = data.get("articles", [])
            if not articles:
                empty += 1
                print(f"No recent disruption news: {term}")
            else:
                result = save_signal(sb, "news", "gdelt", term, {"query": query, **data})
                if result == "skipped":
                    print(f"Already ingested today: {term}")
                else:
                    with_results += 1
                    print(f"Ingested {len(articles)} article(s): {term}")
        except RateLimitedError as e:
            print(f"Stopping early: {e}. Wait several minutes and re-run.")
            break
        except Exception as e:
            failed += 1
            print(f"Failed for '{term}': {e}")
        time.sleep(REQUEST_SPACING_SECONDS)

    print(f"Done. With results: {with_results}, Empty: {empty}, Failed: {failed}")


if __name__ == "__main__":
    run()
