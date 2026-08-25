from datetime import datetime
import uuid
from typing import Optional, List, Dict, Any
from pydantic import BaseModel, ConfigDict, Field

class SourceCitation(BaseModel):
    document_id: str
    document_title: str
    chunk_index: int
    page_number: Optional[int] = None
    similarity_score: float
    snippet: str

class MessageBase(BaseModel):
    role: str
    content: str

class MessageCreate(BaseModel):
    content: str = Field(..., min_length=1)

class MessageRead(MessageBase):
    id: uuid.UUID
    conversation_id: uuid.UUID
    sources: Optional[List[Dict[str, Any]]] = None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)

class ConversationSummary(BaseModel):
    id: uuid.UUID
    title: str
    created_at: datetime
    updated_at: datetime
    message_count: int = 0

    model_config = ConfigDict(from_attributes=True)

class ConversationRead(BaseModel):
    id: uuid.UUID
    title: str
    created_at: datetime
    updated_at: datetime
    messages: List[MessageRead] = []

    model_config = ConfigDict(from_attributes=True)

class ChatRequest(BaseModel):
    message: str = Field(..., min_length=1, description="Pytanie lub wiadomość użytkownika")
    conversation_id: Optional[uuid.UUID] = Field(None, description="ID istniejącej konwersacji lub puste dla nowej")
    filter_doc_ids: Optional[List[uuid.UUID]] = Field(None, description="Opcjonalna lista dokumentów do przeszukania")
    top_k: Optional[int] = Field(4, ge=1, le=10, description="Liczba najbardziej dopasowanych fragmentów do kontekstu")
