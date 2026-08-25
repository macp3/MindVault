import pytest
from app.services.document_service import document_service
from app.services.ai_service import ai_service

def test_document_chunking():
    # Simulate a 1500 char text
    sample_text = (
        "FastAPI to nowoczesny, wydajny framework webowy do budowania API w Pythonie. "
        "Opiera się na standardowych podpowiedziach typów w Pythonie. "
    ) * 15

    pages = [{"page": 1, "text": sample_text}]
    chunks = document_service.chunk_text(pages, chunk_size=300, chunk_overlap=50)

    assert len(chunks) > 1
    assert chunks[0]["chunk_index"] == 0
    assert "page_number" in chunks[0]["metadata"]
    assert chunks[0]["metadata"]["page_number"] == 1

@pytest.mark.asyncio
async def test_mock_embedding():
    vec = await ai_service.get_embedding("Testowy tekst bazy wiedzy")
    assert len(vec) == 768
    assert all(isinstance(x, float) for x in vec)
