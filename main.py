import json
import math
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Literal

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import FileResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from google.genai import errors as genai_errors
from pydantic import BaseModel, ConfigDict, Field, field_validator

BASE_DIR = Path(__file__).parent
load_dotenv(BASE_DIR / ".env")

import database  # noqa: E402
from gemini_client import AllModelsBusyError, ask_gemini, stream_gemini  # noqa: E402
from prompts import PROMPTS  # noqa: E402
from rate_limit import RateLimiter  # noqa: E402

STATIC_DIR = BASE_DIR / "static"
MAX_HISTORY = 20  # Gemini'ye gönderilen en fazla geçmiş mesaj sayısı
EMPTY_REPLIES = {
    "1975": "Teleks kâğıdı sıkıştı galiba efendim, bir daha yazar mısınız?",
    "1998": "Hmm, modem bağlantısı koptu galiba... Bir daha yazar mısın? :)",
    "2005": "ayy bağlantı koptu sanırım, bi daha yazar mısın :S",
    "2030": "Nöral bağlantıda kısa bir parazit oldu, tekrar sorar mısın?",
    "2077": "Ağda parazit var // sinyali tekrar gönder.",
}
DEFAULT_EMPTY_REPLY = "Bağlantıda bir sorun oldu, tekrar dener misin?"


def busy_message(retry_after: float | None) -> str:
    if retry_after is None or retry_after <= 0:
        return "Tüm modeller şu an meşgul. Biraz sonra tekrar dener misin?"
    minutes = int(retry_after // 60) + 1
    if minutes >= 60:
        wait = f"yaklaşık {minutes // 60} saat {minutes % 60} dakika"
    else:
        wait = f"yaklaşık {minutes} dakika"
    return f"Günlük ücretsiz Gemini kotası doldu. {wait} sonra tekrar dener misin?"


def to_http_error(error: Exception) -> HTTPException:
    if isinstance(error, AllModelsBusyError):
        return HTTPException(status_code=429, detail=busy_message(error.retry_after))
    if isinstance(error, genai_errors.APIError):
        return HTTPException(status_code=502, detail=f"Gemini hatası: {error.message}")
    return HTTPException(status_code=500, detail=str(error))


# Ziyaretçi defterine aynı kişi 30 saniyede en fazla 1 kez yazabilir
guestbook_limiter = RateLimiter(max_requests=1, per_seconds=30)


def client_ip(request: Request) -> str:
    return request.client.host if request.client else "bilinmiyor"


@asynccontextmanager
async def lifespan(app: FastAPI):
    database.init_db()
    yield


app = FastAPI(title="RetroChatbot", lifespan=lifespan)
app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")


class HistoryItem(BaseModel):
    role: Literal["user", "model"]
    text: str = Field(max_length=4000)


class ChatRequest(BaseModel):
    message: str = Field(min_length=1, max_length=2000)
    history: list[HistoryItem] = []
    era: str = "1998"

    @field_validator("era")
    @classmethod
    def era_must_exist(cls, value: str) -> str:
        if value not in PROMPTS:
            raise ValueError(f"Bilinmeyen dönem: {value}")
        return value

    def trimmed_history(self) -> list[dict]:
        return [item.model_dump() for item in self.history[-MAX_HISTORY:]]


class ChatResponse(BaseModel):
    reply: str


class GuestbookEntryIn(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    name: str = Field(min_length=1, max_length=40)
    city: str = Field(default="", max_length=40)
    message: str = Field(min_length=1, max_length=500)


@app.get("/")
async def index():
    return FileResponse(STATIC_DIR / "index.html")


@app.post("/api/visit")
def visit():
    return {"count": database.increment_counter("visitors")}


@app.get("/api/guestbook")
def guestbook_list(limit: int = 50):
    return {"entries": database.list_guestbook_entries(max(1, min(limit, 100)))}


@app.post("/api/guestbook", status_code=201)
def guestbook_add(entry: GuestbookEntryIn, request: Request):
    retry_after = guestbook_limiter.check(client_ip(request))
    if retry_after is not None:
        raise HTTPException(
            status_code=429,
            detail=f"Biraz yavaş! Deftere tekrar yazmak için {math.ceil(retry_after)} saniye bekle.",
        )
    return database.add_guestbook_entry(entry.name, entry.city, entry.message)


@app.post("/api/chat", response_model=ChatResponse)
async def chat(req: ChatRequest):
    try:
        reply = await ask_gemini(req.message, req.trimmed_history(), req.era)
    except (AllModelsBusyError, RuntimeError, genai_errors.APIError) as e:
        raise to_http_error(e)

    return ChatResponse(reply=reply or EMPTY_REPLIES.get(req.era, DEFAULT_EMPTY_REPLY))


def ndjson(event: dict) -> str:
    return json.dumps(event, ensure_ascii=False) + "\n"


@app.post("/api/chat/stream")
async def chat_stream(req: ChatRequest):
    """Cevabı satır satır JSON olayları (NDJSON) halinde akıtır:
    {"type": "chunk", "text": "..."} ... {"type": "done"}
    Akış ortasında hata olursa: {"type": "error", "message": "..."}"""
    try:
        chunks = await stream_gemini(req.message, req.trimmed_history(), req.era)
    except (AllModelsBusyError, RuntimeError, genai_errors.APIError) as e:
        raise to_http_error(e)

    async def events():
        got_text = False
        try:
            async for text in chunks:
                got_text = True
                yield ndjson({"type": "chunk", "text": text})
        except genai_errors.APIError as e:
            yield ndjson({"type": "error", "message": f"Bağlantı yarıda kesildi: {e.message}"})
            return
        if not got_text:
            yield ndjson({"type": "chunk", "text": EMPTY_REPLIES.get(req.era, DEFAULT_EMPTY_REPLY)})
        yield ndjson({"type": "done"})

    return StreamingResponse(events(), media_type="application/x-ndjson")


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("main:app", host="127.0.0.1", port=8000, reload=True)
