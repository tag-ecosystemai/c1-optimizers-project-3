"""
RunOut v2 — RAG ingestion
Location: rag/ingest.py

Reads every Markdown document in rag/docs/, validates its front matter,
splits it into chunks by section heading, embeds the chunks and stores them.

Behaviour
  - Unchanged documents (same hash, same embedding model) are skipped.
  - Changed documents are re-embedded in place.
  - A new `version` of an existing doc_id creates a new row and retires the old version.
  - Files removed from the folder are retired (never deleted, so history is kept).
  - Uploaded documents (source = 'upload') are never touched by this script.

Usage
    python rag/ingest.py --dry-run          # validate + show chunk counts. No credentials needed.
    python rag/ingest.py --dry-run --show RO-OPS-002
    python rag/ingest.py                    # real run
    python rag/ingest.py --force            # re-embed everything
"""

import os
import re
import sys
import glob
import hashlib
import argparse
from datetime import datetime, timezone

import yaml

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))

DEFAULT_DOCS = os.path.join(os.path.dirname(os.path.abspath(__file__)), "docs")

FM_RE = re.compile(r"\A---\s*\n(.*?)\n---\s*\n", re.S)
REQUIRED = ["doc_id", "slug", "title", "doc_type", "audience", "version"]
ROLES = {"ops", "warehouse", "distributor", "data"}
DOC_TYPES = {"policy", "procedure", "standard", "reference", "glossary",
             "regional_profile", "case", "external_reference"}
MARKETS = {"all", "USCA", "Europe", "LATAM", "Pacific Asia", "Africa"}
SKIP_SECTIONS = {"revision history"}
SKIP_FILES = {"index.md", "readme.md"}
MIN_TOKENS, MAX_TOKENS = 60, 450
CHUNK_BATCH = 100


def est_tokens(text):
    return max(1, len(text) // 4)


# ----------------------------------------------------------------------
# Parsing and validation
# ----------------------------------------------------------------------
def parse_file(path):
    text = open(path, encoding="utf-8").read()
    m = FM_RE.match(text)
    if not m:
        raise ValueError("missing front matter (file must start with ---)")
    meta = yaml.safe_load(m.group(1)) or {}
    return text, meta, text[m.end():]


def validate(meta):
    errors = []
    for key in REQUIRED:
        if meta.get(key) in (None, "", []):
            errors.append(f"missing '{key}'")
    if errors:
        return errors
    aud = meta["audience"]
    if not isinstance(aud, list) or not aud or not set(aud) <= ROLES:
        errors.append(f"audience must be a list from {sorted(ROLES)}, got {aud}")
    if meta["doc_type"] not in DOC_TYPES:
        errors.append(f"doc_type '{meta['doc_type']}' not in {sorted(DOC_TYPES)}")
    if str(meta.get("market", "all")) not in MARKETS:
        errors.append(f"market '{meta.get('market')}' not in {sorted(MARKETS)}")
    return errors


# ----------------------------------------------------------------------
# Chunking: one chunk per '##' section; long sections split on paragraphs;
# tiny sections merged into the previous chunk.
# ----------------------------------------------------------------------
def split_sections(body):
    sections, title, lines, in_code = [], None, [], False
    for line in body.splitlines():
        if line.strip().startswith("```"):
            in_code = not in_code
        m = None if in_code else re.match(r"^##\s+(.*\S)\s*$", line)
        if m:
            if title is not None:
                sections.append((title, "\n".join(lines).strip()))
            title, lines = m.group(1), []
        elif title is not None:
            lines.append(line)
    if title is not None:
        sections.append((title, "\n".join(lines).strip()))
    return sections


def split_long(body):
    if est_tokens(body) <= MAX_TOKENS:
        return [body]
    parts, cur = [], ""
    for para in re.split(r"\n\s*\n", body):          # a table is one paragraph, never split
        if cur and est_tokens(cur + "\n\n" + para) > MAX_TOKENS:
            parts.append(cur)
            cur = para
        else:
            cur = (cur + "\n\n" + para) if cur else para
    if cur:
        parts.append(cur)
    return parts


def make_chunks(meta, body):
    raw = []
    for title, text in split_sections(body):
        if not text or title.strip().lower() in SKIP_SECTIONS:
            continue
        for part in split_long(text):
            raw.append([title, part])
    merged = []
    for title, text in raw:
        if merged and est_tokens(text) < MIN_TOKENS:
            merged[-1][1] += f"\n\n**{title}**\n{text}"
        else:
            merged.append([title, text])
    prefix = f"{meta['title']} ({meta['doc_id']}, v{meta['version']})"
    chunks = []
    for i, (title, text) in enumerate(merged):
        content = f"{prefix} > {title}\n\n{text}"
        chunks.append({"chunk_index": i, "section": title,
                       "content": content, "token_count": est_tokens(content)})
    return chunks


# ----------------------------------------------------------------------
# Main
# ----------------------------------------------------------------------
def load_documents(docs_dir):
    docs, problems = [], []
    paths = sorted(glob.glob(os.path.join(docs_dir, "**", "*.md"), recursive=True))
    for path in paths:
        rel = os.path.relpath(path, docs_dir)
        if os.path.basename(path).lower() in SKIP_FILES:
            continue
        try:
            text, meta, body = parse_file(path)
        except Exception as e:
            problems.append(f"{rel}: {e}")
            continue
        errs = validate(meta)
        if errs:
            problems.append(f"{rel}: " + "; ".join(errs))
            continue
        meta["version"] = str(meta["version"])
        meta["market"] = str(meta.get("market", "all"))
        chunks = make_chunks(meta, body)
        if not chunks:
            problems.append(f"{rel}: no chunks produced (need '##' sections)")
            continue
        docs.append({"meta": meta, "path": rel, "chunks": chunks,
                     "hash": hashlib.sha256(text.encode("utf-8")).hexdigest()})
    codes = [d["meta"]["doc_id"] for d in docs]
    for c in sorted({c for c in codes if codes.count(c) > 1}):
        problems.append(f"duplicate doc_id {c} in more than one file")
    return docs, problems


def run(args):
    docs, problems = load_documents(args.docs)
    print(f"Found {len(docs)} valid documents in {args.docs}")
    if problems:
        print("\nPROBLEMS (fix these first):")
        for p in problems:
            print("  -", p)
        sys.exit(1)

    total_chunks = sum(len(d["chunks"]) for d in docs)
    print(f"\n{'Code':<12} {'Ver':<5} {'Chunks':<7} {'Tokens':<7} {'Audience':<32} Title")
    for d in docs:
        m = d["meta"]
        toks = sum(c["token_count"] for c in d["chunks"])
        print(f"{m['doc_id']:<12} {m['version']:<5} {len(d['chunks']):<7} {toks:<7} "
              f"{','.join(m['audience']):<32} {m['title']}")
    print(f"\nTotal: {len(docs)} documents, {total_chunks} chunks")

    if args.show:
        for d in docs:
            if d["meta"]["doc_id"] == args.show:
                for c in d["chunks"]:
                    print(f"\n--- chunk {c['chunk_index']} | {c['section']} | ~{c['token_count']} tokens ---")
                    print(c["content"])
    if args.dry_run:
        print("\nDry run: nothing embedded or written.")
        return

    from rag.db import get_service_client
    from rag.embeddings import embed, model_name

    sb = get_service_client()
    model = model_name()
    print(f"\nEmbedding model: {model}")

    existing = {(r["doc_code"], r["version"]): r for r in
                sb.table("knowledge_documents").select("*").eq("source", "repo").execute().data}
    stats = {"new": 0, "updated": 0, "skipped": 0, "retired": 0}

    for d in docs:
        m = d["meta"]
        key = (m["doc_id"], m["version"])
        row = existing.get(key)
        if (row and not args.force and row["content_hash"] == d["hash"]
                and row["embedding_model"] == model and row["status"] == "published"):
            stats["skipped"] += 1
            print(f"  skip     {m['doc_id']}")
            continue

        vectors = embed([c["content"] for c in d["chunks"]])
        doc_row = {
            "doc_code": m["doc_id"], "slug": m["slug"], "title": m["title"],
            "doc_type": m["doc_type"], "classification": m.get("classification"),
            "audience": m["audience"], "market": m["market"], "version": m["version"],
            "source": "repo", "source_path": d["path"], "content_hash": d["hash"],
            "status": "published", "embedding_model": model,
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }
        if row:
            doc_id = row["doc_id"]
            sb.table("knowledge_documents").update(doc_row).eq("doc_id", doc_id).execute()
            sb.table("knowledge_chunks").delete().eq("doc_id", doc_id).execute()
            stats["updated"] += 1
            label = "update  "
        else:
            doc_id = sb.table("knowledge_documents").insert(doc_row).execute().data[0]["doc_id"]
            stats["new"] += 1
            label = "new     "

        chunk_rows = [{
            "doc_id": doc_id, "source_title": m["title"], "source_type": m["doc_type"],
            "chunk_index": c["chunk_index"], "section": c["section"], "content": c["content"],
            "embedding": vec, "audience": m["audience"], "doc_type": m["doc_type"],
            "market": m["market"], "token_count": c["token_count"], "embedding_model": model,
        } for c, vec in zip(d["chunks"], vectors)]
        for i in range(0, len(chunk_rows), CHUNK_BATCH):
            sb.table("knowledge_chunks").insert(chunk_rows[i:i + CHUNK_BATCH]).execute()

        # only one version of a document may be published at a time
        sb.table("knowledge_documents").update({"status": "retired"}) \
            .eq("doc_code", m["doc_id"]).neq("doc_id", doc_id).eq("status", "published").execute()
        print(f"  {label} {m['doc_id']}  ({len(chunk_rows)} chunks)")

    seen = {d["meta"]["doc_id"] for d in docs}
    for r in existing.values():
        if r["status"] == "published" and r["doc_code"] not in seen:
            sb.table("knowledge_documents").update({"status": "retired"}).eq("doc_id", r["doc_id"]).execute()
            stats["retired"] += 1
            print(f"  retired  {r['doc_code']} (file no longer in {args.docs})")

    print(f"\nDone. new={stats['new']} updated={stats['updated']} "
          f"skipped={stats['skipped']} retired={stats['retired']}")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--docs", default=DEFAULT_DOCS)
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--show", help="print the chunks of one document, e.g. RO-OPS-002")
    ap.add_argument("--force", action="store_true", help="re-embed everything")
    run(ap.parse_args())