import uuid
from typing import List
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc, func
from sqlalchemy.orm import selectinload

from app.core.database import get_db
from app.models.chat import Conversation, Message
from app.schemas.chat import (
    ChatRequest,
    ConversationRead,
    ConversationSummary,
    SourceCitation
)
from app.services.rag_service import rag_service

router = APIRouter()

@router.post("/stream")
async def stream_chat(
    payload: ChatRequest,
    db: AsyncSession = Depends(get_db)
):
    """
    RAG Chat endpoint with real-time Server-Sent Events (SSE) streaming.
    Streams tokens and sends citation sources.
    """
    return StreamingResponse(
        rag_service.stream_chat_response(
            query=payload.message,
            session=db,
            conversation_id=payload.conversation_id,
            filter_doc_ids=payload.filter_doc_ids,
            top_k=payload.top_k or 4
        ),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no"
        }
    )

@router.post("/search", response_model=List[SourceCitation])
async def search_knowledge_base(
    payload: ChatRequest,
    db: AsyncSession = Depends(get_db)
):
    """
    Direct semantic search in knowledge base without LLM generation.
    Returns matched chunks with cosine similarity scores.
    """
    chunks = await rag_service.search_relevant_chunks(
        query=payload.message,
        session=db,
        top_k=payload.top_k or 4,
        filter_doc_ids=payload.filter_doc_ids
    )
    return chunks

@router.get("/conversations", response_model=List[ConversationSummary])
async def list_conversations(
    skip: int = 0,
    limit: int = 50,
    db: AsyncSession = Depends(get_db)
):
    """List all previous conversations with message counts."""
    stmt = (
        select(
            Conversation.id,
            Conversation.title,
            Conversation.created_at,
            Conversation.updated_at,
            func.count(Message.id).label("message_count")
        )
        .outerjoin(Message, Conversation.id == Message.conversation_id)
        .group_by(Conversation.id)
        .order_by(desc(Conversation.updated_at))
        .offset(skip)
        .limit(limit)
    )
    result = await db.execute(stmt)
    rows = result.all()

    summaries = []
    for r in rows:
        summaries.append(
            ConversationSummary(
                id=r.id,
                title=r.title,
                created_at=r.created_at,
                updated_at=r.updated_at,
                message_count=r.message_count
            )
        )
    return summaries

@router.get("/conversations/{conversation_id}", response_model=ConversationRead)
async def get_conversation(
    conversation_id: uuid.UUID,
    db: AsyncSession = Depends(get_db)
):
    """Get full conversation history with all messages and citations."""
    stmt = (
        select(Conversation)
        .where(Conversation.id == conversation_id)
        .options(selectinload(Conversation.messages))
    )
    result = await db.execute(stmt)
    conv = result.scalar_one_or_none()

    if not conv:
        raise HTTPException(status_code=404, detail="Konwersacja nie została znaleziona")

    return conv

@router.delete("/conversations/{conversation_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_conversation(
    conversation_id: uuid.UUID,
    db: AsyncSession = Depends(get_db)
):
    """Delete conversation and all its messages."""
    stmt = select(Conversation).where(Conversation.id == conversation_id)
    result = await db.execute(stmt)
    conv = result.scalar_one_or_none()

    if not conv:
        raise HTTPException(status_code=404, detail="Konwersacja nie została znaleziona")

    await db.delete(conv)
    await db.commit()
    return None
