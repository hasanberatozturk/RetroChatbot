"""FastAPI endpoint testleri. Gemini çağrıları sahte fonksiyonlarla değiştirilir."""

import json

from google.genai import errors

import main
from gemini_client import AllModelsBusyError
from rate_limit import RateLimiter


def fake_ask(reply="Selam dostum!", calls=None):
    async def ask(message, history, era):
        if calls is not None:
            calls.append({"message": message, "history": history, "era": era})
        return reply

    return ask


def fake_stream(*pieces, error=None):
    async def stream(message, history, era):
        async def chunks():
            for piece in pieces:
                yield piece
            if error:
                raise error

        return chunks()

    return stream


def read_events(response):
    return [json.loads(line) for line in response.text.splitlines() if line.strip()]


# ---------- Sayfa ve sağlık ----------


def test_index_page_is_served(client):
    response = client.get("/")
    assert response.status_code == 200
    assert "RetroBot" in response.text


def test_healthz(client):
    assert client.get("/healthz").json() == {"status": "ok"}


# ---------- /api/chat ----------


def test_chat_returns_reply_and_passes_era(client, monkeypatch):
    calls = []
    monkeypatch.setattr(main, "ask_gemini", fake_ask("Merhaba!", calls))

    response = client.post("/api/chat", json={"message": "selam", "era": "2077"})

    assert response.status_code == 200
    assert response.json() == {"reply": "Merhaba!"}
    assert calls[0]["era"] == "2077"
    assert calls[0]["message"] == "selam"


def test_chat_defaults_to_1998(client, monkeypatch):
    calls = []
    monkeypatch.setattr(main, "ask_gemini", fake_ask(calls=calls))
    client.post("/api/chat", json={"message": "selam"})
    assert calls[0]["era"] == "1998"


def test_chat_rejects_unknown_era(client):
    response = client.post("/api/chat", json={"message": "selam", "era": "1850"})
    assert response.status_code == 422


def test_chat_rejects_empty_message(client):
    assert client.post("/api/chat", json={"message": ""}).status_code == 422


def test_chat_history_is_trimmed(client, monkeypatch):
    calls = []
    monkeypatch.setattr(main, "ask_gemini", fake_ask(calls=calls))
    history = [{"role": "user" if i % 2 == 0 else "model", "text": f"mesaj {i}"} for i in range(30)]

    client.post("/api/chat", json={"message": "selam", "history": history})

    sent = calls[0]["history"]
    assert len(sent) == main.MAX_HISTORY
    assert sent[-1]["text"] == "mesaj 29"  # en yeni mesajlar korunur


def test_chat_empty_reply_uses_era_fallback(client, monkeypatch):
    monkeypatch.setattr(main, "ask_gemini", fake_ask(""))
    response = client.post("/api/chat", json={"message": "selam", "era": "1975"})
    assert response.json()["reply"] == main.EMPTY_REPLIES["1975"]


def test_chat_all_models_busy_returns_429(client, monkeypatch):
    async def busy(message, history, era):
        raise AllModelsBusyError(retry_after=2 * 3600 + 30)

    monkeypatch.setattr(main, "ask_gemini", busy)
    response = client.post("/api/chat", json={"message": "selam"})

    assert response.status_code == 429
    assert "kotası doldu" in response.json()["detail"]
    assert "2 saat" in response.json()["detail"]


def test_chat_rate_limit(client, monkeypatch):
    monkeypatch.setattr(main, "ask_gemini", fake_ask())
    monkeypatch.setattr(main, "chat_limiter", RateLimiter(2, 60))

    codes = [client.post("/api/chat", json={"message": "selam"}).status_code for _ in range(3)]

    assert codes == [200, 200, 429]


# ---------- /api/chat/stream ----------


def test_stream_sends_chunks_then_done(client, monkeypatch):
    monkeypatch.setattr(main, "stream_gemini", fake_stream("Mer", "haba"))

    response = client.post("/api/chat/stream", json={"message": "selam", "era": "2030"})

    assert response.status_code == 200
    assert response.headers["content-type"].startswith("application/x-ndjson")
    assert read_events(response) == [
        {"type": "chunk", "text": "Mer"},
        {"type": "chunk", "text": "haba"},
        {"type": "done"},
    ]


def test_stream_empty_reply_sends_fallback(client, monkeypatch):
    monkeypatch.setattr(main, "stream_gemini", fake_stream())
    events = read_events(client.post("/api/chat/stream", json={"message": "selam", "era": "2005"}))
    assert events == [{"type": "chunk", "text": main.EMPTY_REPLIES["2005"]}, {"type": "done"}]


def test_stream_error_midway_sends_error_event(client, monkeypatch):
    error = errors.ServerError(503, {"error": {"code": 503, "message": "yoğun", "status": "UNAVAILABLE"}})
    monkeypatch.setattr(main, "stream_gemini", fake_stream("Yarım", error=error))

    events = read_events(client.post("/api/chat/stream", json={"message": "selam"}))

    assert events[0] == {"type": "chunk", "text": "Yarım"}
    assert events[1]["type"] == "error"
    assert {"type": "done"} not in events


def test_stream_busy_before_start_returns_429(client, monkeypatch):
    async def busy(message, history, era):
        raise AllModelsBusyError(retry_after=None)

    monkeypatch.setattr(main, "stream_gemini", busy)
    response = client.post("/api/chat/stream", json={"message": "selam"})
    assert response.status_code == 429
    assert "meşgul" in response.json()["detail"]


# ---------- Ziyaretçi sayacı ve defter ----------


def test_visit_counter_increments(client):
    first = client.post("/api/visit").json()["count"]
    second = client.post("/api/visit").json()["count"]
    assert (first, second) == (1, 2)


def test_guestbook_add_and_list(client):
    response = client.post("/api/guestbook", json={"name": "  Ayşe ", "city": "İzmir", "message": " Süper site! "})

    assert response.status_code == 201
    entry = response.json()
    assert entry["name"] == "Ayşe"  # baştaki/sondaki boşluklar kırpılır
    assert entry["message"] == "Süper site!"

    entries = client.get("/api/guestbook").json()["entries"]
    assert [e["name"] for e in entries] == ["Ayşe"]


def test_guestbook_lists_newest_first(client, monkeypatch):
    monkeypatch.setattr(main, "guestbook_limiter", RateLimiter(10, 30))
    for name in ["Bir", "İki", "Üç"]:
        client.post("/api/guestbook", json={"name": name, "message": "merhaba"})
    entries = client.get("/api/guestbook").json()["entries"]
    assert [e["name"] for e in entries] == ["Üç", "İki", "Bir"]


def test_guestbook_validation(client):
    assert client.post("/api/guestbook", json={"name": "   ", "message": "x"}).status_code == 422
    assert client.post("/api/guestbook", json={"name": "Ali", "message": "x" * 501}).status_code == 422
    assert client.post("/api/guestbook", json={"name": "A" * 41, "message": "x"}).status_code == 422


def test_guestbook_rate_limit(client):
    entry = {"name": "Ali", "message": "selam"}
    assert client.post("/api/guestbook", json=entry).status_code == 201
    second = client.post("/api/guestbook", json=entry)
    assert second.status_code == 429
    assert "bekle" in second.json()["detail"]


# ---------- Yardımcılar ----------


def test_busy_message_formats_wait_time():
    assert "yaklaşık 3 dakika" in main.busy_message(150)
    assert "yaklaşık 1 saat 1 dakika" in main.busy_message(3600)
    assert "meşgul" in main.busy_message(None)


def test_parse_rate():
    assert main.parse_rate("10/60", (1, 1)) == (10, 60)
    assert main.parse_rate("bozuk", (30, 300)) == (30, 300)
    assert main.parse_rate("", (30, 300)) == (30, 300)
