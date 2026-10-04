from pathlib import Path
from typing import Literal

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from google.genai import errors as genai_errors
from pydantic import BaseModel, Field

BASE_DIR = Path(__file__).parent
load_dotenv(BASE_DIR / ".env")

from gemini_client import AllModelsBusyError, ask_gemini  # noqa: E402  (.env yüklendikten sonra)

STATIC_DIR = BASE_DIR / "static"
MAX_HISTORY = 20  # Gemini'ye gönderilen en fazla geçmiş mesaj sayısı
EMPTY_REPLIES = {
    "retro": "Hmm, modem bağlantısı koptu galiba... Bir daha yazar mısın? :)",
    "future": "Nöral bağlantıda kısa bir parazit oldu, tekrar sorar mısın?",
}

def busy_message(retry_after: float | None) -> str:
    if retry_after is None or retry_after <= 0:
        return "Tüm modeller şu an meşgul. Biraz sonra tekrar dener misin?"
    minutes = int(retry_after // 60) + 1
    if minutes >= 60:
        wait = f"yaklaşık {minutes // 60} saat {minutes % 60} dakika"
    else:
        wait = f"yaklaşık {minutes} dakika"
    return f"Günlük ücretsiz Gemini kotası doldu. {wait} sonra tekrar dener misin?"


app = FastAPI(title="RetroChatbot")
app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")

visitor_count = 0


class HistoryItem(BaseModel):
    role: Literal["user", "model"]
    text: str = Field(max_length=4000)


class ChatRequest(BaseModel):
    message: str = Field(min_length=1, max_length=2000)
    history: list[HistoryItem] = []
    era: Literal["retro", "future"] = "retro"


class ChatResponse(BaseModel):
    reply: str


@app.get("/")
async def index():
    return FileResponse(STATIC_DIR / "index.html")


@app.post("/api/visit")
async def visit():
    global visitor_count
    visitor_count += 1
    return {"count": visitor_count}


@app.post("/api/chat", response_model=ChatResponse)
async def chat(req: ChatRequest):
    history = [item.model_dump() for item in req.history[-MAX_HISTORY:]]
    try:
        reply = await ask_gemini(req.message, history, req.era)
    except AllModelsBusyError as e:
        raise HTTPException(status_code=429, detail=busy_message(e.retry_after))
    except RuntimeError as e:
        raise HTTPException(status_code=500, detail=str(e))
    except genai_errors.APIError as e:
        raise HTTPException(status_code=502, detail=f"Gemini hatası: {e.message}")

    if not reply:
        reply = EMPTY_REPLIES[req.era]
    return ChatResponse(reply=reply)


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("main:app", host="127.0.0.1", port=8000, reload=True)
