"""Parameters taken from RO-OPS-002 v1.0, RO-OPS-004 v1.0 and RO-OPS-005 v1.0.
The documents call every figure an assumption for the simulation. Change a number here only when the document
changes (and bump the document version, then re-run rag/ingest.py)."""

# RO-OPS-005 section 5: cost as a share of the order line's order_item_total
UPGRADE_COST_SHARE = {
    ("Second Class", "First Class"): 0.08,
    ("Standard Class", "First Class"): 0.15,
    ("First Class", "Same Day"): 0.18,
    ("Standard Class", "Same Day"): 0.30,
    ("Second Class", "Same Day"): 0.30,
}
# RO-OPS-005 section 3: expected time saved, days
UPGRADE_DAYS_SAVED = {
    ("Standard Class", "First Class"): 2.0,
    ("Standard Class", "Same Day"): 3.5,
    ("Second Class", "First Class"): 2.0,
    ("Second Class", "Same Day"): 3.5,
    ("First Class", "Same Day"): 1.5,
}
# RO-OPS-005 section 6: orders already shipped can only get carrier priority handling
PRIORITY = {"cost_share": 0.10, "days_recovered": 1, "max_gap_days": 3}
# RO-OPS-005 section 7: split shipment costs about 8% of the value of the units moved.
# ASSUMPTION (not in the document): the moved units travel First Class, about 2 days faster.
SPLIT = {"cost_share": 0.08, "days_recovered": 2}
WEEKLY_EXPEDITE_BUDGET_USD = 5000.0          # per market per week (RO-OPS-005 section 8); not enforced yet

# RO-OPS-004
TRANSFER = {"standard_flat": 150.0, "standard_share": 0.05, "air_flat": 400.0, "air_share": 0.15,
            "air_days": 4, "donor_min_cover_days": 14, "request_buffer": 0.10, "arrive_before_days": 1}
TRANSFER_DAYS = {frozenset(k): v for k, v in {
    ("USCA", "LATAM"): 7, ("USCA", "Europe"): 10, ("Europe", "Africa"): 8, ("USCA", "Pacific Asia"): 12,
    ("Europe", "LATAM"): 12, ("Europe", "Pacific Asia"): 12, ("Pacific Asia", "Africa"): 12,
    ("USCA", "Africa"): 14, ("LATAM", "Pacific Asia"): 14, ("LATAM", "Africa"): 14}.items()}

# RO-OPS-002
NOTIFY_ONLY_BELOW_USD = 100.0
COVERAGE_TARGET = 0.80
LOW_CONFIDENCE_SCORE, LOW_CONFIDENCE_UNITS = 0.40, 50
PEAK_MONTHS = (10, 11, 12)