"""Provenance tagging: every chunk is labeled real/public, template-derived or
system-generated, and that label is shown on every citation."""
import re
from enum import Enum
from pathlib import Path
from typing import Optional


class Provenance(str, Enum):
    PUBLIC = "public"
    TEMPLATE_DERIVED = "template_derived"
    SYSTEM_GENERATED = "system_generated"


PROVENANCE_LABELS = {
    Provenance.PUBLIC: "Real / public document",
    Provenance.TEMPLATE_DERIVED: "Template-derived",
    Provenance.SYSTEM_GENERATED: "System-generated (past incident)",
}

# token (from filename / parent folders) -> canonical organisation name
_ORG_TOKENS = {
    "msc": "MSC",
    "mediterranean": "MSC",
    "expeditors": "Expeditors",
    "kuehne": "Kuehne+Nagel",
    "kn": "Kuehne+Nagel",
    "cbp": "US CBP",
    "customs": "US CBP",
    "fmc": "Federal Maritime Commission",
    "edgar": "SEC EDGAR",
    "sec": "SEC EDGAR",
    "cuad": "CUAD",
}


def _rel_parts(path: Path, root: Optional[Path]) -> list:
    try:
        return [p.lower() for p in path.relative_to(root).parts] if root else [p.lower() for p in path.parts]
    except ValueError:
        return [p.lower() for p in path.parts]


def infer_source_org(path: Path, root: Optional[Path] = None) -> Optional[str]:
    tokens = []
    for part in _rel_parts(path, root):
        tokens += re.split(r"[^a-z0-9]+", part)
    for tok in tokens:
        if tok in _ORG_TOKENS:
            return _ORG_TOKENS[tok]
    return None


def infer_provenance(path: Path, root: Optional[Path] = None) -> Provenance:
    """Folder name wins (public/ template_derived/ system_generated/).
    Otherwise CUAD/SEC-derived material is template-derived, everything else public."""
    parts = _rel_parts(path, root)
    for prov in Provenance:
        if prov.value in parts:
            return prov
    if infer_source_org(path, root) in {"CUAD", "SEC EDGAR"}:
        return Provenance.TEMPLATE_DERIVED
    return Provenance.PUBLIC


def citation_label(source: str, provenance: str, page=None, source_org: Optional[str] = None) -> str:
    """Human-readable citation, e.g. '[Real / public document] MSC - msc_bol.pdf, p.3'."""
    label = PROVENANCE_LABELS[Provenance(provenance)]
    org = f"{source_org} - " if source_org else ""
    pg = f", p.{page}" if page else ""
    return f"[{label}] {org}{source}{pg}"
