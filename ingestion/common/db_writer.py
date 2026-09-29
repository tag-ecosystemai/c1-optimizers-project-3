"""
RunOut — Signal writer (idempotent for daily pollers)
Location: ingestion/common/db_writer.py

signal_day = UTC date of as_of_date. The DB has a PARTIAL unique index
on (signal_type, source, reference_key, signal_day) for the daily
pollers (weather, port_congestion, news). PostgREST's upsert cannot
target a partial index, so we do a select-then-insert here. The index
still guards correctness if code ever slips.

vessel_position rows are append-only (no dedupe) — we WANT history.

Usage:
    from common.db_writer import save_signal
    save_signal(sb, "weather", "open-meteo", "Yantian, China", payload,
                seaport_id=..., supplier_location_id=None)
"""

from datetime import datetime, timezone

DEDUPED_TYPES = {"weather", "port_congestion", "news"}


def _utc_day(as_of_date):
    if isinstance(as_of_date, datetime):
        return as_of_date.astimezone(timezone.utc).date()
    return as_of_date


def save_signal(sb, signal_type, source, reference_key, payload,
                as_of_date=None, seaport_id=None, supplier_location_id=None,
                dedupe=None):
    """Insert one signal. For deduped types, skip if today's row exists.
    Returns 'saved' or 'skipped'."""
    as_of_date = as_of_date or datetime.now(timezone.utc)
    signal_day = _utc_day(as_of_date)
    if dedupe is None:
        dedupe = signal_type in DEDUPED_TYPES

    if dedupe:
        existing = (
            sb.table("signals")
            .select("signal_id")
            .eq("signal_type", signal_type)
            .eq("source", source)
            .eq("reference_key", reference_key)
            .eq("signal_day", signal_day.isoformat())
            .limit(1)
            .execute()
        )
        if existing.data:
            return "skipped"

    sb.table("signals").insert({
        "signal_type": signal_type,
        "source": source,
        "reference_key": reference_key,
        "seaport_id": seaport_id,
        "supplier_location_id": supplier_location_id,
        "payload": payload,
        "as_of_date": as_of_date.isoformat(),
        "signal_day": signal_day.isoformat(),
    }).execute()
    return "saved"
