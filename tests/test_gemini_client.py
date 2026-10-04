"""Yedek model zinciri ve kota takibi testleri. Gemini istemcisi sahtesiyle değiştirilir."""

import asyncio
import math
import time
from types import SimpleNamespace

import pytest
from google.genai import errors

import gemini_client
from gemini_client import AllModelsBusyError, ask_gemini, stream_gemini
from prompts import PROMPTS


def quota_error(seconds=120):
    return errors.ClientError(
        429,
        {
            "error": {
                "code": 429,
                "message": "Kota doldu",
                "status": "RESOURCE_EXHAUSTED",
                "details": [{"@type": "type.googleapis.com/google.rpc.RetryInfo", "retryDelay": f"{seconds}s"}],
            }
        },
    )


def busy_error():
    return errors.ServerError(503, {"error": {"code": 503, "message": "Yoğun", "status": "UNAVAILABLE"}})


def client_error(code):
    return errors.ClientError(code, {"error": {"code": code, "message": "Hata", "status": "X"}})


class FakeModels:
    """Her model için ya bir cevap metni ya da fırlatılacak bir hata."""

    def __init__(self, behaviors):
        self.behaviors = behaviors
        self.calls = []
        self.configs = []

    async def generate_content(self, model, contents, config):
        self.calls.append(model)
        self.configs.append((contents, config))
        behavior = self.behaviors[model]
        if isinstance(behavior, Exception):
            raise behavior
        return SimpleNamespace(text=behavior)

    async def generate_content_stream(self, model, contents, config):
        self.calls.append(model)
        behavior = self.behaviors[model]

        async def chunks():
            # Gerçek API'de hata ilk parça okunurken gelebilir
            if isinstance(behavior, Exception):
                raise behavior
            for piece in behavior:
                yield SimpleNamespace(text=piece)

        return chunks()


@pytest.fixture
def fake(monkeypatch):
    monkeypatch.setenv("GEMINI_MODEL", "model-a")
    monkeypatch.setenv("GEMINI_FALLBACK_MODELS", "model-b")

    def install(behaviors):
        models = FakeModels(behaviors)
        monkeypatch.setattr(gemini_client, "get_client", lambda: SimpleNamespace(aio=SimpleNamespace(models=models)))
        return models

    return install


def test_first_model_answers(fake):
    models = fake({"model-a": "Selam", "model-b": "Yedek"})
    assert asyncio.run(ask_gemini("merhaba", [])) == "Selam"
    assert models.calls == ["model-a"]


def test_quota_error_falls_back_and_sets_cooldown(fake):
    models = fake({"model-a": quota_error(120), "model-b": "Yedekten selam"})

    assert asyncio.run(ask_gemini("merhaba", [])) == "Yedekten selam"
    assert models.calls == ["model-a", "model-b"]
    assert gemini_client._cooldowns["model-a"] == pytest.approx(time.time() + 120, abs=5)

    # Kotası dolan model bekleme süresi boyunca hiç denenmez
    asyncio.run(ask_gemini("tekrar", []))
    assert models.calls == ["model-a", "model-b", "model-b"]


def test_busy_model_falls_back_without_cooldown(fake):
    models = fake({"model-a": busy_error(), "model-b": "Tamam"})
    assert asyncio.run(ask_gemini("merhaba", [])) == "Tamam"
    assert "model-a" not in gemini_client._cooldowns
    assert models.calls == ["model-a", "model-b"]


def test_missing_model_is_skipped_forever(fake):
    fake({"model-a": client_error(404), "model-b": "Tamam"})
    asyncio.run(ask_gemini("merhaba", []))
    assert gemini_client._cooldowns["model-a"] == math.inf


def test_other_client_errors_are_raised(fake):
    fake({"model-a": client_error(400), "model-b": "Tamam"})
    with pytest.raises(errors.ClientError):
        asyncio.run(ask_gemini("merhaba", []))


def test_all_models_out_of_quota(fake):
    fake({"model-a": quota_error(600), "model-b": quota_error(120)})
    with pytest.raises(AllModelsBusyError) as info:
        asyncio.run(ask_gemini("merhaba", []))
    # En erken açılacak modelin bekleme süresi bildirilir
    assert info.value.retry_after == pytest.approx(120, abs=5)


def test_request_uses_era_prompt_and_history(fake):
    models = fake({"model-a": "Tamam", "model-b": "Yedek"})
    history = [{"role": "user", "text": "selam"}, {"role": "model", "text": "slm"}]

    asyncio.run(ask_gemini("nbr", history, "2005"))

    contents, config = models.configs[0]
    assert config.system_instruction == PROMPTS["2005"]
    assert [c.role for c in contents] == ["user", "model", "user"]
    assert contents[-1].parts[0].text == "nbr"


def test_stream_falls_back_before_first_chunk(fake):
    fake({"model-a": quota_error(), "model-b": ["Mer", "haba"]})

    async def collect():
        chunks = await stream_gemini("selam", [])
        return [piece async for piece in chunks]

    assert asyncio.run(collect()) == ["Mer", "haba"]
    assert "model-a" in gemini_client._cooldowns


def test_retry_delay_defaults_when_missing():
    error = client_error(429)
    assert gemini_client._retry_delay_seconds(error) == gemini_client.DEFAULT_COOLDOWN
