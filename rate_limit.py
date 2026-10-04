"""Basit, bellek içi istek sınırlayıcı (kayan pencere).

Tek sunucu süreci için yeterli; sunucu yeniden başlarsa sayaçlar sıfırlanır.
"""

import threading
import time
from collections import defaultdict, deque


class RateLimiter:
    def __init__(self, max_requests: int, per_seconds: float):
        self.max_requests = max_requests
        self.per_seconds = per_seconds
        self._hits: dict[str, deque[float]] = defaultdict(deque)
        self._lock = threading.Lock()

    def check(self, key: str) -> float | None:
        """İsteğe izin verilirse kaydeder ve None döner.
        Sınır aşıldıysa kaç saniye sonra tekrar denenebileceğini döner."""
        now = time.monotonic()
        with self._lock:
            hits = self._hits[key]
            while hits and hits[0] <= now - self.per_seconds:
                hits.popleft()
            if len(hits) >= self.max_requests:
                return hits[0] + self.per_seconds - now
            hits.append(now)
            return None

    def reset(self) -> None:
        with self._lock:
            self._hits.clear()
