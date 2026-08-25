from datetime import datetime
import uuid
from typing import Optional, List, Dict, Any
from pydantic import BaseModel, ConfigDict

class DocumentChunkRead(BaseModel):
    id: uuid.UUID
    document_id: uuid.UUID
    chunk_index: int
    content: str
    chunk_metadata: Dict[str, Any] = {}
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)

class DocumentBase(BaseModel):
    title: str
    filename: str
    file_type: str
    file_size: int

class DocumentRead(DocumentBase):
    id: uuid.UUID
    status: str
    error_message: Optional[str] = None
    total_chunks: int
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)

class DocumentDetail(DocumentRead):
    chunks: List[DocumentChunkRead] = []

class DocumentStats(BaseModel):
    total_documents: int
    total_chunks: int
    total_size_bytes: int
    ready_documents: int
