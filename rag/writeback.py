"""Layer 6 - writes resolved incidents back into the knowledge base so the system
learns from past disruptions. Rows are tagged provenance='system_generated'.

Call after a human approves/resolves an incident (human-in-the-loop decision logged).
Idempotent: the same incident_id overwrites its previous entry.
"""
from __future__ import annotations

from typing import Optional

from psycopg.types.json import Jsonb

from rag import store
from rag.embed import embed_texts


def write_back_incident(incident_id: str,
                        cause: str,
                        action_taken: str,
                        outcome: str,
                        cost_usd: Optional[float] = None,
                        lane: Optional[str] = None,
                        supplier: Optional[str] = None,
                        shipment_ref: Optional[str] = None,
                        decided_by: Optional[str] = None) -> str:
    lines = [f"Past disruption incident {incident_id}."]
    if lane:
        lines.append(f"Lane: {lane}.")
    if supplier:
        lines.append(f"Supplier: {supplier}.")
    lines.append(f"Cause: {cause}")
    lines.append(f"Action taken: {action_taken}")
    if cost_usd is not None:
        lines.append(f"Cost: ${cost_usd:,.0f}.")
    lines.append(f"Outcome: {outcome}")
    text = "\n".join(lines)

    chunk_id = f"sysgen:{incident_id}"
    vec = embed_texts([text])[0]
    row = {
        "chunk_id": chunk_id,
        "content": text,
        "embedding": vec,
        "provenance": "system_generated",
        "source": f"incident:{incident_id}",
        "source_path": f"system_generated/incidents/{incident_id}",
        "source_org": None,
        "page": None,
        "section": "Resolved incident",
        "chunk_index": 0,
        "metadata": Jsonb({
            "incident_id": incident_id, "lane": lane, "supplier": supplier,
            "shipment_ref": shipment_ref, "cost_usd": cost_usd, "decided_by": decided_by,
        }),
    }
    store.ensure_schema()
    with store.get_conn() as conn:
        store.upsert_rows(conn, [row])
    return chunk_id


if __name__ == "__main__":
    cid = write_back_incident(
        incident_id="demo-001",
        cause="Typhoon closed Yantian terminal for 3 days.",
        action_taken="Rebooked 2 containers on a later sailing; air-freighted 400 units.",
        outcome="Avoided stockout at Aurora DC; 1 day late overall.",
        cost_usd=8200, lane="Yantian->Long Beach", supplier="Wise Industrial Co",
    )
    print("Wrote", cid)
