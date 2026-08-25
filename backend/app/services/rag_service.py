import json
import logging
import uuid
from typing import List, Optional, AsyncGenerator, Dict, Any
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc
from app.core.config import settings
from app.models.document import Document, DocumentChunk
from app.models.chat import Conversation, Message
from app.services.ai_service import ai_service

logger = logging.getLogger(__name__)

class RAGService:
    @staticmethod
    async def search_relevant_chunks(
        query: str,
        session: AsyncSession,
        top_k: int = 4,
        filter_doc_ids: Optional[List[uuid.UUID]] = None
    ) -> List[Dict[str, Any]]:
        """
        Generates query embedding and executes cosine distance search in pgvector.
        Returns top matching chunks with metadata and similarity scores.
        """
        query_embedding = await ai_service.get_query_embedding(query)

        # Base query joining DocumentChunk with Document
        stmt = (
            select(
                DocumentChunk,
                Document.title.label("doc_title"),
                DocumentChunk.embedding.cosine_distance(query_embedding).label("distance")
            )
            .join(Document, DocumentChunk.document_id == Document.id)
            .where(Document.status == "indexed")
        )

        if filter_doc_ids:
            stmt = stmt.where(DocumentChunk.document_id.in_(filter_doc_ids))

        stmt = stmt.order_by("distance").limit(top_k)

        result = await session.execute(stmt)
        rows = result.all()

        chunks = []
        for chunk, doc_title, distance in rows:
            # Cosine similarity is 1 - cosine_distance
            sim_score = max(0.0, 1.0 - float(distance if distance is not None else 1.0))
            page_num = chunk.chunk_metadata.get("page_number") if chunk.chunk_metadata else None

            chunks.append({
                "chunk_id": str(chunk.id),
                "document_id": str(chunk.document_id),
                "document_title": doc_title,
                "chunk_index": chunk.chunk_index,
                "page_number": page_num,
                "similarity_score": round(sim_score, 4),
                "content": chunk.content,
                "snippet": chunk.content[:200] + ("..." if len(chunk.content) > 200 else "")
            })

        return chunks

    @classmethod
    async def stream_chat_response(
        cls,
        query: str,
        session: AsyncSession,
        conversation_id: Optional[uuid.UUID] = None,
        filter_doc_ids: Optional[List[uuid.UUID]] = None,
        top_k: int = 4
    ) -> AsyncGenerator[str, None]:
        """
        Executes RAG pipeline and yields SSE events (Server-Sent Events) formatted for streaming.
        """
        # 1. Manage Conversation
        if conversation_id:
            conv_stmt = select(Conversation).where(Conversation.id == conversation_id)
            conv_res = await session.execute(conv_stmt)
            conversation = conv_res.scalar_one_or_none()
            if not conversation:
                conversation = Conversation(id=conversation_id, title=query[:60])
                session.add(conversation)
                await session.commit()
        else:
            conversation = Conversation(title=query[:60])
            session.add(conversation)
            await session.commit()
            await session.refresh(conversation)
            conversation_id = conversation.id

        # 2. Save User Message
        user_msg = Message(
            conversation_id=conversation.id,
            role="user",
            content=query
        )
        session.add(user_msg)
        await session.commit()

        # 3. Retrieve Chat History
        history_stmt = (
            select(Message)
            .where(Message.conversation_id == conversation.id)
            .order_by(desc(Message.created_at))
            .limit(6)
        )
        history_res = await session.execute(history_stmt)
        history_messages = list(reversed(history_res.scalars().all()))
        formatted_history = [{"role": m.role, "content": m.content} for m in history_messages if m.id != user_msg.id]

        # 4. Search relevant chunks
        try:
            relevant_chunks = await cls.search_relevant_chunks(
                query=query,
                session=session,
                top_k=top_k,
                filter_doc_ids=filter_doc_ids
            )
        except Exception as e:
            logger.warning(f"Vector search failed, falling back to empty context: {e}")
            relevant_chunks = []

        # Yield metadata event with sources and conversation_id
        init_payload = {
            "type": "init",
            "conversation_id": str(conversation.id),
            "sources": relevant_chunks
        }
        yield f"data: {json.dumps(init_payload, ensure_ascii=False)}\n\n"

        # 5. Stream LLM generation
        full_response_text = ""
        try:
            async for token in ai_service.generate_rag_response_stream(
                query=query,
                context_chunks=relevant_chunks,
                chat_history=formatted_history
            ):
                full_response_text += token
                token_payload = {"type": "token", "content": token}
                yield f"data: {json.dumps(token_payload, ensure_ascii=False)}\n\n"
        except Exception as e:
            logger.error(f"Error during AI streaming: {e}")
            err_payload = {"type": "error", "content": f"Błąd generowania: {str(e)}"}
            yield f"data: {json.dumps(err_payload, ensure_ascii=False)}\n\n"

        # 6. Save Assistant Response in DB
        assistant_msg = Message(
            conversation_id=conversation.id,
            role="assistant",
            content=full_response_text or "Przepraszam, nie udało się wygenerować odpowiedzi.",
            sources=relevant_chunks
        )
        session.add(assistant_msg)
        await session.commit()
        await session.refresh(assistant_msg)

        # Yield completion event
        done_payload = {
            "type": "done",
            "message_id": str(assistant_msg.id),
            "conversation_id": str(conversation.id)
        }
        yield f"data: {json.dumps(done_payload, ensure_ascii=False)}\n\n"

rag_service = RAGService()
