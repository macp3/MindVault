from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text
from app.core.database import get_db
from app.core.config import settings

router = APIRouter()

@router.get("/health")
async def health_check(db: AsyncSession = Depends(get_db)):
    db_status = "disconnected"
    pgvector_status = "unavailable"
    
    try:
        res = await db.execute(text("SELECT 1;"))
        if res.scalar() == 1:
            db_status = "connected"
            
        # Check pgvector
        try:
            vec_res = await db.execute(text("SELECT extname FROM pg_extension WHERE extname = 'vector';"))
            if vec_res.scalar():
                pgvector_status = "installed"
        except Exception:
            pgvector_status = "not_available"
    except Exception as e:
        db_status = f"error: {str(e)}"

    return {
        "status": "healthy" if db_status == "connected" else "degraded",
        "service": settings.PROJECT_NAME,
        "database": db_status,
        "pgvector": pgvector_status,
        "ai_provider": "Google Gemini",
        "gemini_api_key_configured": bool(settings.GEMINI_API_KEY)
    }
