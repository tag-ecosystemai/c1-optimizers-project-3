"""Knowledge documents managed from the app (ops uploads; ops and data can list). Uses the same parsing, validation and
chunking as rag/ingest.py, so an uploaded document behaves exactly like a repository document.
  POST /api/knowledge/upload        multipart: file (.md with front matter), publish (default true)   [ops]
  GET  /api/knowledge               list documents                                                    [ops, data]
  GET  /api/knowledge/{doc_id}      one document with its chunks                                      [ops, data]
  POST /api/knowledge/{doc_id}/publish   publish a draft or retired UPLOADED document                 [ops]
  POST /api/knowledge/{doc_id}/retire    retire an UPLOADED document                                  [ops]
Documents from rag/docs (source 'repo') are managed by rag/ingest.py and cannot be changed here.
Uploaded text is untrusted data: the agent treats retrieved passages as information, never as instructions."""
import hashlib
from datetime import datetime, timezone
from typing import Optional

import yaml
from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile

from backend.auth import Scope, data_client, require_roles
from backend.incidents import _in
from cascade.db_utils import fetch_all
from rag.ingest import FM_RE, make_chunks, validate

router = APIRouter(prefix="/api")
MAX_BYTES = 200_000
CHUNK_BATCH = 100
DOC_COLS = ("doc_id,doc_code,slug,title,doc_type,classification,audience,market,version,source,source_path,status,"
            "embedding_model,uploaded_by,created_at,updated_at")


def _doc_or_404(sb, doc_id):
    rows = sb.table("knowledge_documents").select(DOC_COLS).eq("doc_id", doc_id).limit(1).execute().data
    if not rows:
        raise HTTPException(404, "Document not found")
    return rows[0]


def _only_uploads(doc):
    if doc["source"] != "upload":
        raise HTTPException(409, "This document comes from rag/docs and is managed by rag/ingest.py")


def _retire_others(sb, doc_code, keep_doc_id):
    sb.table("knowledge_documents").update({"status": "retired", "updated_at": datetime.now(timezone.utc).isoformat()}) \
        .eq("doc_code", doc_code).eq("source", "upload").eq("status", "published").neq("doc_id", keep_doc_id).execute()


@router.post("/knowledge/upload")
def upload(file: UploadFile = File(...), publish: bool = Form(True), scope: Scope = Depends(require_roles("ops"))):
    if not (file.filename or "").lower().endswith(".md"):
        raise HTTPException(422, "Upload a Markdown (.md) file with front matter")
    raw = file.file.read(MAX_BYTES + 1)
    if len(raw) > MAX_BYTES:
        raise HTTPException(413, f"File is larger than {MAX_BYTES // 1000} KB")
    try:
        text = raw.decode("utf-8")
    except UnicodeDecodeError:
        raise HTTPException(422, "File must be UTF-8 text")
    m = FM_RE.match(text)
    if not m:
        raise HTTPException(422, "The file must start with front matter (--- ... ---)")
    try:
        meta = yaml.safe_load(m.group(1)) or {}
    except yaml.YAMLError as e:
        raise HTTPException(422, f"Front matter is not valid YAML: {str(e)[:120]}")
    if not isinstance(meta, dict):
        raise HTTPException(422, "Front matter must be a set of key: value lines")
    errors = validate(meta)
    if errors:
        raise HTTPException(422, "; ".join(errors))
    meta["version"], meta["market"] = str(meta["version"]), str(meta.get("market", "all"))
    chunks = make_chunks(meta, text[m.end():])
    if not chunks:
        raise HTTPException(422, "No sections found: the body needs '##' headings")

    sb = data_client()
    same = sb.table("knowledge_documents").select("doc_id,source,version,status").eq("doc_code", meta["doc_id"]).execute().data
    if any(d["source"] == "repo" and d["status"] == "published" for d in same):
        raise HTTPException(409, f"{meta['doc_id']} is a repository document. Use a different doc_id, or edit the file in rag/docs.")
    if any(d["source"] == "upload" and d["version"] == meta["version"] for d in same):
        raise HTTPException(409, f"Version {meta['version']} of {meta['doc_id']} was already uploaded. Increase the version number.")

    from rag.embeddings import embed, model_name
    try:
        vectors = embed([c["content"] for c in chunks])
    except Exception as e:
        raise HTTPException(502, f"Embedding failed: {type(e).__name__}: {str(e)[:120]}")
    model = model_name()
    row = {"doc_code": meta["doc_id"], "slug": meta["slug"], "title": meta["title"], "doc_type": meta["doc_type"],
           "classification": meta.get("classification"), "audience": meta["audience"], "market": meta["market"],
           "version": meta["version"], "source": "upload", "source_path": file.filename,
           "content_hash": hashlib.sha256(text.encode("utf-8")).hexdigest(), "status": "published" if publish else "draft",
           "embedding_model": model, "uploaded_by": scope.user_id, "updated_at": datetime.now(timezone.utc).isoformat()}
    try:
        doc_id = sb.table("knowledge_documents").insert(row).execute().data[0]["doc_id"]
    except Exception as e:
        if "foreign key" in str(e).lower() or "uploaded_by" in str(e).lower():     # uploaded_by may point at another users table
            row["uploaded_by"] = None
            doc_id = sb.table("knowledge_documents").insert(row).execute().data[0]["doc_id"]
        else:
            raise HTTPException(500, f"Could not save the document: {str(e)[:160]}")
    chunk_rows = [{"doc_id": doc_id, "source_title": meta["title"], "source_type": meta["doc_type"], "chunk_index": c["chunk_index"],
                   "section": c["section"], "content": c["content"], "embedding": v, "audience": meta["audience"],
                   "doc_type": meta["doc_type"], "market": meta["market"], "token_count": c["token_count"],
                   "embedding_model": model} for c, v in zip(chunks, vectors)]
    try:
        for i in range(0, len(chunk_rows), CHUNK_BATCH):
            sb.table("knowledge_chunks").insert(chunk_rows[i:i + CHUNK_BATCH]).execute()
    except Exception as e:                                                          # never leave a document without its chunks
        sb.table("knowledge_chunks").delete().eq("doc_id", doc_id).execute()
        sb.table("knowledge_documents").delete().eq("doc_id", doc_id).execute()
        raise HTTPException(500, f"Could not save the chunks: {str(e)[:160]}")
    if publish:
        _retire_others(sb, meta["doc_id"], doc_id)
    return {"doc_id": doc_id, "doc_code": meta["doc_id"], "version": meta["version"], "status": row["status"], "chunks": len(chunk_rows)}


@router.get("/knowledge")
def list_documents(status: Optional[str] = None, source: Optional[str] = None, q: Optional[str] = None,
                   scope: Scope = Depends(require_roles("ops", "data"))):
    sb = data_client()

    def apply(qq):
        if status:
            qq = qq.eq("status", status)
        if source:
            qq = qq.eq("source", source)
        return qq
    rows = fetch_all(sb, "knowledge_documents", DOC_COLS, "doc_id", apply=apply)
    if q:
        rows = [r for r in rows if q.lower() in f"{r['doc_code']} {r['title']}".lower()]
    names = {u["user_id"]: u["display_name"] for u in _in(sb, "app_users", "user_id,display_name", "user_id",
                                                           [r["uploaded_by"] for r in rows])}
    for r in rows:
        r["uploaded_by_name"] = names.get(r["uploaded_by"])
    rows.sort(key=lambda r: (r["doc_code"], r["version"]))
    return {"items": rows}


@router.get("/knowledge/{doc_id}")
def get_document(doc_id: int, scope: Scope = Depends(require_roles("ops", "data"))):
    sb = data_client()
    doc = _doc_or_404(sb, doc_id)
    chunks = sb.table("knowledge_chunks").select("chunk_index,section,content,token_count").eq("doc_id", doc_id) \
        .order("chunk_index").execute().data
    return {**doc, "chunks": chunks}


@router.post("/knowledge/{doc_id}/publish")
def publish_document(doc_id: int, scope: Scope = Depends(require_roles("ops"))):
    sb = data_client()
    doc = _doc_or_404(sb, doc_id)
    _only_uploads(doc)
    sb.table("knowledge_documents").update({"status": "published", "updated_at": datetime.now(timezone.utc).isoformat()}) \
        .eq("doc_id", doc_id).execute()
    _retire_others(sb, doc["doc_code"], doc_id)
    return {"doc_id": doc_id, "status": "published"}


@router.post("/knowledge/{doc_id}/retire")
def retire_document(doc_id: int, scope: Scope = Depends(require_roles("ops"))):
    sb = data_client()
    doc = _doc_or_404(sb, doc_id)
    _only_uploads(doc)
    sb.table("knowledge_documents").update({"status": "retired", "updated_at": datetime.now(timezone.utc).isoformat()}) \
        .eq("doc_id", doc_id).execute()
    return {"doc_id": doc_id, "status": "retired"}