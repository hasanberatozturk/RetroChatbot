import os
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

# Testler gerçek API anahtarını kullanmasın (load_dotenv mevcut ortam değişkenini ezmez)
os.environ["GEMINI_API_KEY"] = "test-anahtari"

from fastapi.testclient import TestClient  # noqa: E402

import gemini_client  # noqa: E402
import main  # noqa: E402
from rate_limit import RateLimiter  # noqa: E402


@pytest.fixture
def client(tmp_path, monkeypatch):
    """Her test için boş bir SQLite dosyası ve sıfırlanmış istek sınırlarıyla uygulama."""
    monkeypatch.setenv("DATABASE_PATH", str(tmp_path / "test.db"))
    monkeypatch.setattr(main, "chat_limiter", RateLimiter(1000, 60))
    monkeypatch.setattr(main, "guestbook_limiter", RateLimiter(1, 30))
    with TestClient(main.app) as test_client:
        yield test_client


@pytest.fixture(autouse=True)
def clean_cooldowns(monkeypatch):
    monkeypatch.setattr(gemini_client, "_cooldowns", {})
