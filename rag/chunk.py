"""Layer 6 - document loading and structure-aware chunking.

Changes vs. the first version:
  * each PDF is opened once (not once per page)
  * OCR engine loads lazily, only if a blank page is actually hit
  * .txt / .md supported (system-generated or template docs)
  * case-insensitive extension matching, encrypted PDFs handled
  * structure-aware: splits on clause/section headings first, then by size;
    the section heading is carried into every chunk for better retrieval
  * every chunk gets provenance, source_org, chunk_id for idempotent re-ingestion
  * NUL bytes stripped (Postgres rejects them)
"""
from __future__ import annotations

import hashlib
import logging
import re
import sys
import warnings
from pathlib import Path
from typing import List, Optional, Union

warnings.filterwarnings("ignore", category=DeprecationWarning)
warnings.filterwarnings("ignore", category=UserWarning)
logging.getLogger("easyocr").setLevel(logging.ERROR)

from langchain_core.documents import Document
from langchain_text_splitters import RecursiveCharacterTextSplitter
from pypdf import PdfReader
from tqdm import tqdm

from rag.config import CHUNK_OVERLAP, CHUNK_SIZE, CORPUS_DIR
from rag.provenance import PROVENANCE_LABELS, infer_provenance, infer_source_org

SUPPORTED_SUFFIXES = {".pdf", ".txt", ".md"}
MIN_SECTION_CHARS = 200   # tiny sections get merged into the next one
MIN_CHUNK_CHARS = 40      # drop junk fragments

# Clause / section headings: "ARTICLE 4", "Section 2.1", "3.2 Demurrage", "DEFINITIONS"
_HEADING_RE = re.compile(
    r"^(?:(?i:ARTICLE|SECTION|CLAUSE|PART|CHAPTER|SCHEDULE)\s+[0-9IVXLC]+\b.{0,80}"
    r"|\d{1,2}(?:\.\d{1,2}){0,2}[.)]\s+[A-Z][^\n]{2,80}"
    r"|[A-Z][A-Z0-9 ,&/\-()']{5,79})$"
)


# --------------------------------------------------------------------------- #
# Cleaning
# --------------------------------------------------------------------------- #
def clean_text(text: str) -> str:
    text = text.replace("\x00", "")
    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r" *\n *", "\n", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


# --------------------------------------------------------------------------- #
# Loading
# --------------------------------------------------------------------------- #
class _LazyOCR:
    """Only builds the (slow) EasyOCR reader if a scanned page is encountered."""

    def __init__(self) -> None:
        self._reader = None

    def read(self, image_bytes: bytes) -> str:
        if self._reader is None:
            import easyocr
            print(" Initializing OCR engine (CPU mode)...")
            self._reader = easyocr.Reader(["en"], gpu=False)
        return " ".join(self._reader.readtext(image_bytes, detail=0))


def _base_metadata(path: Path, root: Path) -> dict:
    try:
        rel = path.relative_to(root).as_posix()
    except ValueError:
        rel = path.name
    prov = infer_provenance(path, root)
    return {
        "source": path.name,
        "source_path": rel,
        "provenance": prov.value,
        "provenance_label": PROVENANCE_LABELS[prov],
        "source_org": infer_source_org(path, root),
    }


def _load_pdf(path: Path, root: Path, ocr: _LazyOCR) -> List[Document]:
    docs: List[Document] = []
    try:
        reader = PdfReader(str(path))
        if reader.is_encrypted:
            reader.decrypt("")
        pages = list(reader.pages)
    except Exception as e:
        print(f" Skipping unreadable PDF '{path.name}': {e}")
        return docs

    meta = _base_metadata(path, root)
    for i, page in enumerate(pages):
        ocr_used = False
        try:
            text = page.extract_text() or ""
            if not text.strip():  # scanned page -> OCR fallback
                for img in getattr(page, "images", None) or []:
                    try:
                        text += "\n" + ocr.read(img.data)
                        ocr_used = True
                    except Exception as e:
                        print(f"\n OCR failed on image in {path.name} p.{i + 1}: {e}")
            text = clean_text(text)
            if text:
                docs.append(Document(page_content=text,
                                     metadata={**meta, "page": i + 1, "ocr_used": ocr_used}))
        except Exception as e:
            print(f"\n Error on page {i + 1} of {path.name}: {e}")
    return docs


def _load_text(path: Path, root: Path) -> List[Document]:
    try:
        text = clean_text(path.read_text(encoding="utf-8", errors="ignore"))
    except Exception as e:
        print(f" Skipping unreadable file '{path.name}': {e}")
        return []
    if not text:
        return []
    return [Document(page_content=text,
                     metadata={**_base_metadata(path, root), "page": None, "ocr_used": False})]


def load_documents(folder: Union[str, Path]) -> List[Document]:
    root = Path(folder)
    files = sorted(p for p in root.rglob("*")
                   if p.is_file() and p.suffix.lower() in SUPPORTED_SUFFIXES
                   and not p.name.startswith("."))
    print(f" Found {len(files)} supported files under '{root}'.")
    ocr = _LazyOCR()
    documents: List[Document] = []
    for path in tqdm(files, desc="Parsing files", unit="file"):
        if path.suffix.lower() == ".pdf":
            documents += _load_pdf(path, root, ocr)
        else:
            documents += _load_text(path, root)
    print(f" Extracted text from {len(documents)} pages/documents.")
    return documents


# --------------------------------------------------------------------------- #
# Chunking (structure-aware)
# --------------------------------------------------------------------------- #
def _is_heading(line: str) -> bool:
    s = line.strip()
    return 3 <= len(s) <= 100 and bool(_HEADING_RE.match(s))


def split_into_sections(text: str) -> List[tuple]:
    """Split on clause/section headings -> [(title | None, body), ...]."""
    sections, title, buf = [], None, []

    def flush():
        body = "\n".join(buf).strip()
        if body:
            sections.append((title, body))

    for line in text.splitlines():
        if _is_heading(line):
            flush()
            title, buf = line.strip()[:120], [line]
        else:
            buf.append(line)
    flush()

    # merge heading-only / tiny sections into the following one
    merged, carry = [], None
    for t, body in sections:
        if carry:
            t, body = carry[0], carry[1] + "\n" + body
            carry = None
        if len(body) < MIN_SECTION_CHARS:
            carry = (t, body)
        else:
            merged.append((t, body))
    if carry:
        merged.append(carry)
    return merged


def _chunk_id(source_path: str, page, idx: int, text: str) -> str:
    return hashlib.sha1(f"{source_path}|{page}|{idx}|{text}".encode("utf-8")).hexdigest()[:32]


def chunk_documents(documents: List[Document],
                    chunk_size: int = CHUNK_SIZE,
                    chunk_overlap: int = CHUNK_OVERLAP) -> List[Document]:
    print(f"\n Chunking (size={chunk_size}, overlap={chunk_overlap}, structure-aware)...")
    splitter = RecursiveCharacterTextSplitter(
        chunk_size=chunk_size,
        chunk_overlap=chunk_overlap,
        separators=["\n\n", "\n", ". ", " ", ""],
    )
    out: List[Document] = []
    counters: dict = {}
    for doc in documents:
        sp = doc.metadata["source_path"]
        for title, body in split_into_sections(doc.page_content):
            sec = Document(page_content=body, metadata={**doc.metadata, "section": title})
            for piece in splitter.split_documents([sec]):
                text = piece.page_content.strip()
                if title and not text.startswith(title):
                    text = f"{title}\n{text}"      # carry heading into later chunks
                if len(text) < MIN_CHUNK_CHARS:
                    continue
                idx = counters.get(sp, 0)
                counters[sp] = idx + 1
                piece.page_content = text
                piece.metadata["chunk_index"] = idx
                piece.metadata["chunk_id"] = _chunk_id(sp, piece.metadata.get("page"), idx, text)
                out.append(piece)
    print(f" Created {len(out)} chunks.")
    return out


def get_document_chunks(data_folder: Optional[Union[str, Path]] = None,
                        chunk_size: int = CHUNK_SIZE,
                        chunk_overlap: int = CHUNK_OVERLAP) -> List[Document]:
    """Load + chunk everything under the corpus folder (importable hook)."""
    folder = Path(data_folder) if data_folder else CORPUS_DIR
    if not folder.exists():
        print(f" Corpus folder '{folder}' does not exist.")
        return []
    docs = load_documents(folder)
    if not docs:
        print(" No text extracted.")
        return []
    return chunk_documents(docs, chunk_size, chunk_overlap)


if __name__ == "__main__":
    chunks = get_document_chunks(sys.argv[1] if len(sys.argv) > 1 else None)
    if chunks:
        print(f"\nTotal chunks: {len(chunks)}")
        for c in chunks[:3]:
            m = c.metadata
            print(f"\n[{m['provenance']}] {m['source']} p.{m['page']} section={m['section']!r}")
            print(c.page_content[:300])
