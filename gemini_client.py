import logging
import os
import re
import time

from google import genai
from google.genai import errors, types

from prompts import PROMPTS

DEFAULT_MODEL = "gemini-3.8-flash"
# Ücretsiz planda kota model başına ayrı sayılır; biri dolunca sıradakine geçilir.
DEFAULT_FALLBACK_MODELS = (
    "gemini-3.7-flash,gemini-3.6-flash,gemini-3.5-flash,"
    "gemini-3.5-flash-lite,gemini-3.1-flash-lite"
)
DEFAULT_COOLDOWN = 60  # Google bekleme süresi bildirmezse kaç saniye atlanacak

logger = logging.getLogger("uvicorn.error")  # uvicorn'un terminal çıktısına yazar

_client: genai.Client | None = None
# Kotası dolan modeller: {model adı: tekrar denenebileceği zaman (time.time())}
_cooldowns: dict[str, float] = {}


class AllModelsBusyError(Exception):
    """Tüm modellerin kotası dolu ya da hepsi yoğun."""

    def __init__(self, retry_after: float | None):
        super().__init__("Tüm modeller meşgul")
        self.retry_after = retry_after


def get_client() -> genai.Client:
    global _client
    if _client is None:
        api_key = os.getenv("GEMINI_API_KEY")
        if not api_key:
            raise RuntimeError("GEMINI_API_KEY bulunamadı. .env dosyasını kontrol et.")
        _client = genai.Client(api_key=api_key)
    return _client


def get_models() -> list[str]:
    models = [os.getenv("GEMINI_MODEL", DEFAULT_MODEL)]
    fallbacks = os.getenv("GEMINI_FALLBACK_MODELS", DEFAULT_FALLBACK_MODELS)
    for name in fallbacks.split(","):
        name = name.strip()
        if name and name not in models:
            models.append(name)
    return models


def _retry_delay_seconds(error: errors.APIError) -> float:
    """429 hatasındaki 'retryDelay' bilgisini (ör. '10067s') saniyeye çevirir."""
    text = str(error.details)
    match = re.search(r"retryDelay'?\"?:\s*'?\"?([\d.]+)s", text)
    return float(match.group(1)) if match else DEFAULT_COOLDOWN


async def ask_gemini(message: str, history: list[dict], era: str = "retro") -> str:
    """history: [{"role": "user" | "model", "text": "..."}] (en eskiden en yeniye)
    era: "retro" (1998) veya "future" (2030)"""
    contents = [
        types.Content(role=item["role"], parts=[types.Part(text=item["text"])])
        for item in history
    ]
    contents.append(types.Content(role="user", parts=[types.Part(text=message)]))
    config = types.GenerateContentConfig(system_instruction=PROMPTS[era], temperature=0.9)

    now = time.time()
    for model in get_models():
        if _cooldowns.get(model, 0) > now:
            continue  # Bu modelin kotası dolu, bekleme süresi bitmedi
        try:
            response = await get_client().aio.models.generate_content(
                model=model, contents=contents, config=config
            )
            logger.info("Gemini: %s cevap verdi", model)
            return (response.text or "").strip()
        except errors.ServerError as e:
            logger.warning("Gemini: %s yoğun (%s), sıradaki modele geçiliyor", model, e.code)
            continue
        except errors.ClientError as e:
            if e.code == 429:  # Kota doldu
                delay = _retry_delay_seconds(e)
                _cooldowns[model] = time.time() + delay
                logger.warning("Gemini: %s kotası doldu, %d sn atlanacak", model, delay)
                continue
            if e.code == 404:  # Model kaldırılmış/erişilemiyor, bir daha deneme
                _cooldowns[model] = float("inf")
                logger.warning("Gemini: %s bulunamadı, listeden çıkarıldı", model)
                continue
            raise

    waits = [t - time.time() for t in _cooldowns.values() if t != float("inf")]
    raise AllModelsBusyError(min(waits) if waits else None)
