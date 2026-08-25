import os
import uuid
import logging
from typing import List, Tuple, Dict, Any
import aiofiles
from pypdf import PdfReader
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func

from app.core.config import settings
from app.models.document import Document, DocumentChunk
from app.services.ai_service import ai_service

logger = logging.getLogger(__name__)

class DocumentService:
    @staticmethod
    def allowed_file(filename: str) -> bool:
        ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
        return ext in settings.ALLOWED_EXTENSIONS

    @staticmethod
    async def save_uploaded_file(file_content: bytes, filename: str) -> Tuple[str, str, int]:
        """Saves file to disk with a unique name to prevent collisions."""
        ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else "txt"
        unique_filename = f"{uuid.uuid4().hex}_{filename}"
        file_path = os.path.join(settings.UPLOAD_DIR, unique_filename)
        
        async with aiofiles.open(file_path, "wb") as f:
            await f.write(file_content)
            
        file_size = len(file_content)
        return file_path, unique_filename, file_size

    @staticmethod
    def extract_text_from_file(file_path: str, file_type: str) -> List[Dict[str, Any]]:
        """
        Extracts text content and metadata from the given file.
        Returns a list of dicts: [{"page": int, "text": str}]
        """
        pages = []
        if file_type == "pdf":
            try:
                reader = PdfReader(file_path)
                for idx, page in enumerate(reader.pages):
                    text = page.extract_text() or ""
                    if text.strip():
                        pages.append({"page": idx + 1, "text": text.strip()})
            except Exception as e:
                logger.error(f"Error reading PDF {file_path}: {e}")
                raise ValueError(f"Nie udało się odczytać pliku PDF: {str(e)}")
        else:
            # Markdown / TXT
            try:
                with open(file_path, "r", encoding="utf-8", errors="replace") as f:
                    content = f.read()
                    if content.strip():
                        pages.append({"page": 1, "text": content.strip()})
            except Exception as e:
                logger.error(f"Error reading text file {file_path}: {e}")
                raise ValueError(f"Nie udało się odczytać pliku tekstowego: {str(e)}")
        
        return pages

    @staticmethod
    def chunk_text(pages: List[Dict[str, Any]], chunk_size: int = None, chunk_overlap: int = None) -> List[Dict[str, Any]]:
        """
        Splits pages into overlapping chunks for semantic indexing.
        """
        chunk_size = chunk_size or settings.CHUNK_SIZE
        chunk_overlap = chunk_overlap or settings.CHUNK_OVERLAP
        
        chunks = []
        global_chunk_index = 0

        for p in pages:
            page_num = p["page"]
            text = p["text"]
            
            if len(text) <= chunk_size:
                chunks.append({
                    "chunk_index": global_chunk_index,
                    "content": text,
                    "metadata": {"page_number": page_num, "char_length": len(text)}
                })
                global_chunk_index += 1
                continue

            # Split by paragraphs / sentences
            start = 0
            while start < len(text):
                end = start + chunk_size
                chunk_str = text[start:end]

                # Try to break at newline or space to avoid cutting words
                if end < len(text):
                    last_space = chunk_str.rfind(" ")
                    last_newline = chunk_str.rfind("\n")
                    cut_point = max(last_space, last_newline)
                    if cut_point > chunk_size // 2:
                        chunk_str = chunk_str[:cut_point]
                        end = start + cut_point

                chunk_cleaned = chunk_str.strip()
                if chunk_cleaned:
                    chunks.append({
                        "chunk_index": global_chunk_index,
                        "content": chunk_cleaned,
                        "metadata": {"page_number": page_num, "char_length": len(chunk_cleaned)}
                    })
                    global_chunk_index += 1

                start += chunk_size - chunk_overlap

        return chunks

    @classmethod
    async def process_and_index_document(cls, document_id: uuid.UUID, session: AsyncSession) -> Document:
        """
        Background/async worker to parse, chunk, embed, and store document in database.
        """
        stmt = select(Document).where(Document.id == document_id)
        result = await session.execute(stmt)
        doc = result.scalar_one_or_none()

        if not doc:
            raise ValueError(f"Document {document_id} not found")

        try:
            doc.status = "processing"
            await session.commit()

            # 1. Extract text
            pages = cls.extract_text_from_file(doc.file_path, doc.file_type)
            if not pages:
                raise ValueError("Plik nie zawiera tekstu do zaindeksowania.")

            # 2. Chunk text
            chunks_data = cls.chunk_text(pages)
            if not chunks_data:
                raise ValueError("Nie udało się wygenerować fragmentów tekstu.")

            # 3. Generate embeddings & create DocumentChunk records
            chunks_to_add = []
            for c_data in chunks_data:
                emb = await ai_service.get_embedding(c_data["content"])
                chunk_obj = DocumentChunk(
                    document_id=doc.id,
                    chunk_index=c_data["chunk_index"],
                    content=c_data["content"],
                    chunk_metadata=c_data["metadata"],
                    embedding=emb
                )
                chunks_to_add.append(chunk_obj)

            session.add_all(chunks_to_add)
            doc.total_chunks = len(chunks_to_add)
            doc.status = "indexed"
            doc.error_message = None
            await session.commit()
            await session.refresh(doc)
            logger.info(f"Document '{doc.title}' ({doc.id}) successfully indexed with {doc.total_chunks} chunks.")
            return doc

        except Exception as e:
            logger.error(f"Failed processing document {doc.id}: {e}")
            doc.status = "failed"
            doc.error_message = str(e)
            await session.commit()
            raise

    @classmethod
    async def get_stats(cls, session: AsyncSession) -> Dict[str, int]:
        total_docs_res = await session.execute(select(func.count(Document.id)))
        total_docs = total_docs_res.scalar() or 0

        ready_docs_res = await session.execute(select(func.count(Document.id)).where(Document.status == "indexed"))
        ready_docs = ready_docs_res.scalar() or 0

        total_chunks_res = await session.execute(select(func.count(DocumentChunk.id)))
        total_chunks = total_chunks_res.scalar() or 0

        total_size_res = await session.execute(select(func.sum(Document.file_size)))
        total_size = total_size_res.scalar() or 0

        return {
            "total_documents": total_docs,
            "ready_documents": ready_docs,
            "total_chunks": total_chunks,
            "total_size_bytes": total_size
        }

document_service = DocumentService()
