"""
RecallAI FastAPI Main Application Entrypoint
"""
from fastapi import FastAPI, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.exceptions import RequestValidationError
from backend.app.config import settings
from backend.app.routes import health, memories, chat, sessions

app = FastAPI(
    title="RecallAI Backend",
    description="Knowledge graph-powered agent memory service for educational tutoring",
    version="1.0.0"
)

# Strict CORS Middleware Configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_methods=["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Content-Type"],
    allow_credentials=False,
)

# Custom Validation Exception Handler matching API Contract
@app.exception_handler(RequestValidationError)
def validation_exception_handler(request: Request, exc: RequestValidationError):
    errors = exc.errors()
    first_msg = errors[0].get("msg", "Invalid request parameters") if errors else "Invalid request parameters"
    return JSONResponse(
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        content={
            "error": {
                "code": "VALIDATION_ERROR",
                "message": first_msg
            }
        }
    )

# Include Route Handlers
app.include_router(health.router)
app.include_router(memories.router)
app.include_router(chat.router)
app.include_router(sessions.router)

@app.get("/")
def root():
    return {
        "service": "RecallAI",
        "docs": "/docs",
        "health": "/health"
    }
