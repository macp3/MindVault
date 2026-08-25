import logging
from typing import List, AsyncGenerator, Optional
from google import genai
from google.genai import types
from app.core.config import settings

logger = logging.getLogger(__name__)

class AIService:
    def __init__(self):
        self.api_key = settings.GEMINI_API_KEY
        self.client: Optional[genai.Client] = None
        if self.api_key:
            self.client = genai.Client(api_key=self.api_key)
            logger.info("Google GenAI client initialized with API Key.")
        else:
            logger.warning("GEMINI_API_KEY is not set. AI operations will use mock/fallback responses until key is provided.")

    def set_api_key(self, api_key: str):
        self.api_key = api_key
        self.client = genai.Client(api_key=api_key)
        logger.info("Google GenAI client updated with new API Key.")

    async def get_embedding(self, text: str) -> List[float]:
        """Generates embedding vector (768 dimensions) for a single text chunk."""
        if not self.api_key or not self.client:
            # Deterministic mock embedding for local testing without API key
            import hashlib
            h = hashlib.sha256(text.encode()).digest()
            vec = [(h[i % len(h)] / 255.0) - 0.5 for i in range(settings.EMBEDDING_DIMENSION)]
            return vec

        embedding_models = [
            settings.EMBEDDING_MODEL.replace("models/", ""),
            "gemini-embedding-001",
            "gemini-embedding-2",
            "text-embedding-004"
        ]

        for model_name in embedding_models:
            try:
                response = self.client.models.embed_content(
                    model=model_name,
                    contents=text,
                    config=types.EmbedContentConfig(
                        output_dimensionality=settings.EMBEDDING_DIMENSION
                    )
                )
                if hasattr(response, 'embeddings') and response.embeddings:
                    return response.embeddings[0].values
                elif hasattr(response, 'embedding') and response.embedding:
                    return response.embedding.values
                return response.values
            except Exception as e:
                logger.warning(f"Embedding model '{model_name}' failed: {e}. Trying fallback...")

        raise RuntimeError("Nie udało się wygenerować wektora za pomocą żadnego z dostępnych modeli embeddingów.")

    async def get_query_embedding(self, query: str) -> List[float]:
        """Generates embedding vector for a search query."""
        return await self.get_embedding(query)

    async def generate_rag_response_stream(
        self,
        query: str,
        context_chunks: List[dict],
        chat_history: Optional[List[dict]] = None
    ) -> AsyncGenerator[str, None]:
        """Streams response from Gemini LLM using the provided RAG context and chat history."""
        if not self.api_key or not self.client:
            yield "*(Uwaga: Brak klucza GEMINI_API_KEY w konfiguracji. Odpowiedź symulowana.)*\n\n"
            yield f"Otrzymano pytanie: **{query}**.\n\n"
            if context_chunks:
                yield "Na podstawie znalezionych dokumentów w bazie wiedzy:\n"
                for c in context_chunks:
                    yield f"- **{c.get('document_title', 'Dokument')}** (fragment #{c.get('chunk_index')}, dopasowanie: {c.get('similarity_score', 0):.2f})\n"
            else:
                yield "Nie znaleziono pasujących dokumentów w Twojej bazie wiedzy."
            return

        # Build System & Context Prompt
        context_text = "\n\n---\n\n".join([
            f"[ŹRÓDŁO: {c.get('document_title')} | Fragment #{c.get('chunk_index')} | Strona {c.get('page_number', 'N/A')}]\n{c.get('content')}"
            for c in context_chunks
        ])

        system_instruction = (
            "Jesteś asystentem bazy wiedzy MindVault. Twoim zadaniem jest odpowiadanie na pytania użytkownika "
            "w oparciu o dostarczone poniżej fragmenty dokumentów (KONTEKST).\n"
            "Zasady:\n"
            "1. Odpowiadaj wyczerpująco, precyzyjnie i w języku pytania (domyślnie po polsku).\n"
            "2. Używaj formatowania Markdown (pogrubienia, tabele, listy, bloki kodu).\n"
            "3. Zawsze odwołuj się do konkretnych dokumentów i fragmentów, gdy z nich korzystasz (np. [Źródło: NazwaPliku]).\n"
            "4. Jeśli w kontekście nie ma wystarczających informacji, powiedz to wprost i nie zmyślaj faktów.\n\n"
            f"KONTEKST:\n{context_text if context_text else 'Brak pasujących dokumentów w bazie.'}"
        )

        # Build content turns
        contents = []
        if chat_history:
            for msg in chat_history[-6:]:
                role = "user" if msg.get("role") == "user" else "model"
                contents.append(types.Content(
                    role=role,
                    parts=[types.Part.from_text(text=msg.get("content", ""))]
                ))

        contents.append(types.Content(
            role="user",
            parts=[types.Part.from_text(text=query)]
        ))

        # Preferred models in order of priority
        candidate_chat_models = [
            "gemini-3.6-flash",
            "gemini-3.7-flash",
            "gemini-flash-latest",
            settings.CHAT_MODEL.replace("models/", "")
        ]

        stream_success = False
        last_error = None

        for model_name in candidate_chat_models:
            try:
                response = self.client.models.generate_content_stream(
                    model=model_name,
                    contents=contents,
                    config=types.GenerateContentConfig(
                        system_instruction=system_instruction,
                        temperature=0.3,
                    )
                )

                for chunk in response:
                    if chunk.text:
                        stream_success = True
                        yield chunk.text

                if stream_success:
                    return
            except Exception as e:
                logger.warning(f"Model '{model_name}' failed with error: {e}. Trying next candidate...")
                last_error = e

        if not stream_success:
            logger.error(f"All chat model candidates failed: {last_error}")
            yield f"\n[Błąd generowania odpowiedzi AI: {str(last_error)}]"

ai_service = AIService()
