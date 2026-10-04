import rate_limit
from prompts import PROMPTS
from rate_limit import RateLimiter


def test_rate_limiter_allows_then_blocks_then_recovers(monkeypatch):
    now = [100.0]
    monkeypatch.setattr(rate_limit.time, "monotonic", lambda: now[0])
    limiter = RateLimiter(max_requests=2, per_seconds=10)

    assert limiter.check("ip") is None
    assert limiter.check("ip") is None
    assert limiter.check("ip") == 10  # 10 saniye sonra açılır

    now[0] += 4
    assert limiter.check("ip") == 6

    now[0] += 6
    assert limiter.check("ip") is None  # pencere kaydı, yeniden izin var


def test_rate_limiter_tracks_keys_separately():
    limiter = RateLimiter(max_requests=1, per_seconds=60)
    assert limiter.check("ali") is None
    assert limiter.check("ayse") is None
    assert limiter.check("ali") is not None


def test_every_era_has_a_prompt():
    assert set(PROMPTS) == {"1975", "1998", "2005", "2030", "2077"}
    for era, prompt in PROMPTS.items():
        assert era in prompt, f"{era} kişiliği kendi yılından bahsetmiyor"
        assert "Never break character" in prompt
