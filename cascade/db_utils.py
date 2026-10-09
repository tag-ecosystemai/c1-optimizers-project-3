"""
RunOut v2 — Shared helpers for cascade / scoring scripts
Location: cascade/db_utils.py

Supabase caps a single select() at 1,000 rows, so every bulk read goes
through fetch_all(), which pages until the table (or filtered subset) is
fully loaded.
"""

import os
from datetime import date, datetime, timedelta

try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass


def fetch_all(sb, table, columns, order_col, apply=None, page_size=1000):
    """Page through a table. `apply` is an optional function that adds
    filters to the query builder, e.g.
        apply=lambda q: q.gte("order_date", "2017-01-01")
    `order_col` must be unique/stable (usually the primary key) so pages
    don't overlap."""
    rows, start = [], 0
    while True:
        q = sb.table(table).select(columns)
        if apply is not None:
            q = apply(q)
        batch = q.order(order_col).range(start, start + page_size - 1).execute().data
        rows.extend(batch)
        if len(batch) < page_size:
            break
        start += page_size
    return rows


def chunked(items, size):
    for i in range(0, len(items), size):
        yield items[i:i + size]


def parse_date(v):
    if v is None:
        return None
    if isinstance(v, datetime):
        return v.date()
    if isinstance(v, date):
        return v
    return date.fromisoformat(str(v)[:10])


def latest_order_date(sb):
    r = (sb.table("orders").select("order_date")
         .order("order_date", desc=True).limit(1).execute().data)
    return parse_date(r[0]["order_date"]) if r else None


def default_as_of(sb, offset_days=7):
    """Simulated 'today'. Set RUNOUT_AS_OF=YYYY-MM-DD in .env to fix it for every script.
    Otherwise: a week before the last order in the data."""
    env = os.environ.get("RUNOUT_AS_OF", "").strip()
    if env:
        return parse_date(env)
    last = latest_order_date(sb)
    if last is None:
        raise SystemExit("No orders found. Run db/seed_data_co.py first.")
    return last - timedelta(days=offset_days)