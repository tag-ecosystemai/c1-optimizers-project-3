import os
import sys
import warnings

# 1. Immediately suppress noisy external framework warnings
warnings.filterwarnings("ignore", category=DeprecationWarning)
warnings.filterwarnings("ignore", category=UserWarning)

import logging
logging.getLogger('ppstructure').setLevel(logging.ERROR)
logging.getLogger('easyocr').setLevel(logging.ERROR)

from typing import List
from langchain_core.documents import Document
from langchain_text_splitters import RecursiveCharacterTextSplitter
from pypdf import PdfReader
import easyocr
from tqdm import tqdm

def load_scanned_pdfs(folder_path: str) -> List[Document]:
    """
    Scans a directory for PDFs, extracts text via standard parser, 
    and handles scanned page layers using EasyOCR fallback.
    """
    print(" Initializing OCR Engine (CPU Mode)...")
    reader_ocr = easyocr.Reader(['en'], gpu=False) 
    documents = []
    
    # Locate all PDF files in the target directory
    pdf_tasks = []
    for root, _, files in os.walk(folder_path):
        for file in files:
            if file.endswith('.pdf'):
                pdf_tasks.append(os.path.join(root, file))
                
    print(f" Found {len(pdf_tasks)} PDF files. Mapping page counts...")
    
    # Map out files and internal page arrays
    all_pages = []
    for file_path in pdf_tasks:
        try:
            pdf = PdfReader(file_path)
            for page_num in range(len(pdf.pages)):
                all_pages.append((file_path, page_num))
        except Exception as e:
            print(f" Skipping corrupt PDF '{file_path}': {e}")

    if not all_pages:
        return documents

    print("\n Extracting text (invoking OCR only when text layers are blank)...")
    for file_path, page_num in tqdm(all_pages, desc="Parsing Pages", unit="page"):
        try:
            pdf = PdfReader(file_path)
            page = pdf.pages[page_num]
            text = page.extract_text() or ""
            
            # Robust fallback logic if structural text stream returns empty
            if not text.strip():
                if hasattr(page, 'images') and page.images:
                    for image_file_object in page.images:
                        ocr_results = reader_ocr.readtext(image_file_object.data, detail=0)
                        text += "\n" + " ".join(ocr_results)
            
            # Only track pages that yielded readable data
            if text.strip():  
                doc = Document(
                    page_content=text.strip(),
                    metadata={
                        "source": os.path.basename(file_path), 
                        "full_path": file_path,
                        "page": page_num + 1   # 1-indexed for explicit document mapping
                    }
                )
                documents.append(doc)
        except Exception as e:
            print(f"\n❌ Error processing page {page_num} of {file_path}: {e}")
                    
    print(f"\nSuccessfully extracted text from {len(documents)} pages.")
    return documents


def chunk_documents(documents: List[Document], chunk_size: int = 800, chunk_overlap: int = 150) -> List[Document]:
    """
    Splits document texts using a recursive layout structure, 
    preserving metadata attributes for accurate RAG sourcing.
    """
    print(f"\n Splitting documents (Size: {chunk_size}, Overlap: {chunk_overlap})...")
    
    text_splitter = RecursiveCharacterTextSplitter(
        chunk_size=chunk_size,
        chunk_overlap=chunk_overlap,
        length_function=len,
        is_separator_regex=False,
    )
    
    chunks = text_splitter.split_documents(documents)
    print(f" Created {len(chunks)} text chunks ready for vectorization.")
    return chunks


# --- Execution Control ---
if __name__ == "__main__":
    # Point directly to your data folder located within your active directory context
    DATA_FOLDER = "./data"
    
    if not os.path.exists(DATA_FOLDER):
        print(f" Error: The folder '{DATA_FOLDER}' does not exist.")
        print("Make sure you are executing this file from inside your 'rag/' root workspace.")
        sys.exit(1)
        
    # Execute loading engine
    raw_docs = load_scanned_pdfs(DATA_FOLDER)
    
    if not raw_docs:
        print("No documents were loaded. Verify the content within your data folder.")
    else:
        # Generate target chunks
        final_chunks = chunk_documents(raw_docs, chunk_size=800, chunk_overlap=150)
        
        # Display validation checks for programmatic evaluation
        if final_chunks:
            print("\n--- Chunker Verification Sample ---")
            print(f"Total Chunks Generated: {len(final_chunks)}")
            print(f"Chunk 1 Metadata: {final_chunks[0].metadata}")
            print(f"Chunk 1 Content Preview:\n{final_chunks[0].page_content[:400]}")
            print("-" * 50)
