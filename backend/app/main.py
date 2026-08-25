import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings
from app.core.database import init_db
from app.api.v1.router import api_router

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s"
)
logger = logging.getLogger("mindvault")

@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Application lifecycle management.
    Initializes database schema, vectors, and services on startup.
    """
    logger.info("Initializing MindVault database and extensions...")
    try:
        await init_db()
        logger.info("Database initialized successfully.")
    except Exception as e:
        logger.warning(f"Database initialization warning: {e}")
        logger.warning("Ensure PostgreSQL with pgvector is running via Docker or configure DATABASE_URL.")
    
    yield
    
    logger.info("Shutting down MindVault backend...")

app = FastAPI(
    title=settings.PROJECT_NAME,
    description="MindVault - Inteligentna Baza Wiedzy & Second Brain z RAG i Google Gemini",
    version="1.0.0",
    lifespan=lifespan,
    docs_url="/docs",
    redoc_url="/redoc"
)

# Configure CORS for Frontend communication (supports local and all Azure Static Web Apps subdomains)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS + [
        "https://white-river-0329b1403.7.azurestaticapps.net",
        "https://white-river-0329b1403.azurestaticapps.net"
    ],
    allow_origin_regex=r"https://.*\.azurestaticapps\.net",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register API Router
app.include_router(api_router, prefix=settings.API_V1_STR)

@app.get("/", tags=["Root"])
async def root():
    return {
        "app": settings.PROJECT_NAME,
        "version": "1.0.0",
        "docs": "/docs",
        "api_v1": settings.API_V1_STR,
        "status": "online"
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app.main:app", host="127.0.0.1", port=8000, reload=True)
