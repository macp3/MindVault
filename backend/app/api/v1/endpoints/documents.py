import os
import uuid
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, BackgroundTasks, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc
from sqlalchemy.orm import selectinload

from app.core.database import get_db, AsyncSessionLocal
from app.models.document import Document
from app.schemas.document import DocumentRead, DocumentDetail, DocumentStats
from app.services.document_service import document_service
from app.core.config import settings

router = APIRouter()

async def process_document_background(doc_id: uuid.UUID):
    """Background worker task for document extraction and embedding."""
    async with AsyncSessionLocal() as session:
        try:
            await document_service.process_and_index_document(doc_id, session)
        except Exception as e:
            # error is handled and persisted inside process_and_index_document
            pass

@router.post("/upload", response_model=DocumentRead, status_code=status.HTTP_201_CREATED)
async def upload_document(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db)
):
    """
    Upload a document (PDF, TXT, MD), save it, and schedule background ingestion & embedding.
    """
    if not document_service.allowed_file(file.filename):
        allowed = ", ".join(settings.ALLOWED_EXTENSIONS)
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Niedozwolony format pliku. Obsługiwane rozszerzenia: {allowed}"
        )

    content = await file.read()
    if len(content) > settings.MAX_FILE_SIZE_MB * 1024 * 1024:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Plik przekracza maksymalny rozmiar {settings.MAX_FILE_SIZE_MB}MB."
        )

    ext = file.filename.rsplit(".", 1)[-1].lower() if "." in file.filename else "txt"
    file_path, unique_name, file_size = await document_service.save_uploaded_file(content, file.filename)

    # Create initial document record
    doc = Document(
        title=file.filename,
        filename=unique_name,
        file_type=ext,
        file_size=file_size,
        file_path=file_path,
        status="uploaded"
    )
    db.add(doc)
    await db.commit()
    await db.refresh(doc)

    # Immediately schedule indexing task
    background_tasks.add_task(process_document_background, doc.id)

    return doc

@router.get("", response_model=List[DocumentRead])
async def list_documents(
    skip: int = 0,
    limit: int = 100,
    db: AsyncSession = Depends(get_db)
):
    """List all uploaded documents."""
    stmt = (
        select(Document)
        .order_by(desc(Document.created_at))
        .offset(skip)
        .limit(limit)
    )
    result = await db.execute(stmt)
    return result.scalars().all()

@router.get("/stats", response_model=DocumentStats)
async def get_document_stats(db: AsyncSession = Depends(get_db)):
    """Get total documents, chunks, and storage statistics."""
    return await document_service.get_stats(db)

@router.get("/{document_id}", response_model=DocumentDetail)
async def get_document(
    document_id: uuid.UUID,
    db: AsyncSession = Depends(get_db)
):
    """Get single document with all its indexed chunks."""
    stmt = (
        select(Document)
        .where(Document.id == document_id)
        .options(selectinload(Document.chunks))
    )
    result = await db.execute(stmt)
    doc = result.scalar_one_or_none()

    if not doc:
        raise HTTPException(status_code=404, detail="Dokument nie został znaleziony")

    return doc

@router.post("/{document_id}/reindex", response_model=DocumentRead)
async def reindex_document(
    document_id: uuid.UUID,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db)
):
    """Trigger re-indexing of an existing document."""
    stmt = select(Document).where(Document.id == document_id)
    result = await db.execute(stmt)
    doc = result.scalar_one_or_none()

    if not doc:
        raise HTTPException(status_code=404, detail="Dokument nie został znaleziony")

    doc.status = "uploaded"
    doc.error_message = None
    await db.commit()
    await db.refresh(doc)

    background_tasks.add_task(process_document_background, doc.id)
    return doc

@router.delete("/{document_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_document(
    document_id: uuid.UUID,
    db: AsyncSession = Depends(get_db)
):
    """Delete document, its chunks, and the file on disk."""
    stmt = select(Document).where(Document.id == document_id)
    result = await db.execute(stmt)
    doc = result.scalar_one_or_none()

    if not doc:
        raise HTTPException(status_code=404, detail="Dokument nie został znaleziony")

    # Remove physical file if exists
    if os.path.exists(doc.file_path):
        try:
            os.remove(doc.file_path)
        except OSError:
            pass

    await db.delete(doc)
    await db.commit()
    return None
