from __future__ import annotations

import os
import random
import uuid
from typing import Any, Mapping

import httpx

from ._errors import Send0Error

VERSION = "0.2.0"
DEFAULT_BASE_URL = "https://api.send0.dev"
DEFAULT_TIMEOUT = 60.0
DEFAULT_MAX_RETRIES = 2
MAX_WAIT_PER_REQUEST = 120


def resolve_api_key(api_key: str | None) -> str:
    key = api_key or os.environ.get("SEND0_API_KEY")
    if not key:
        raise Send0Error(
            "Missing API key. Pass api_key=… or set SEND0_API_KEY.", status=0, code="missing_api_key"
        )
    return key


def default_headers(api_key: str) -> dict[str, str]:
    return {
        "authorization": f"Bearer {api_key}",
        "accept": "application/json",
        "user-agent": f"send0-python/{VERSION}",
    }


def clean_params(params: Mapping[str, Any] | None) -> dict[str, Any]:
    """Drops None values and renders booleans the way the API expects."""
    out: dict[str, Any] = {}
    for k, v in (params or {}).items():
        if v is None:
            continue
        out[k] = ("true" if v else "false") if isinstance(v, bool) else v
    return out


def new_idempotency_key() -> str:
    return str(uuid.uuid4())


def should_retry(status: int) -> bool:
    return status == 429 or status >= 500


def backoff_seconds(attempt: int, retry_after: str | None) -> float:
    if retry_after:
        try:
            return float(max(0.0, float(retry_after)))
        except ValueError:
            pass
    return float(min(8.0, 0.5 * 2.0**attempt) * (0.75 + random.random() * 0.5))


def _fallback_error(res: httpx.Response) -> tuple[str, str]:
    """For responses without a send0 error body. A 429 from Cloudflare's rate limiting in front of
    the API is an HTML page, but callers should still see `rate_limited`."""
    if res.status_code != 429:
        return f"HTTP {res.status_code}", "http_error"
    retry_after = res.headers.get("retry-after", "")
    when = f"after {retry_after} seconds" if retry_after.isdigit() and int(retry_after) > 0 else "later"
    return f"Too many requests. Slow down and retry {when}.", "rate_limited"


def error_from_response(res: httpx.Response) -> Send0Error:
    request_id = res.headers.get("x-request-id")
    message, code = _fallback_error(res)
    try:
        body = res.json()
        err = (body.get("error") if isinstance(body, dict) else None) or {}
    except ValueError:
        err = {}
    return Send0Error(
        err.get("message") or message,
        status=res.status_code,
        code=err.get("code") or code,
        param=err.get("param"),
        request_id=err.get("request_id") or request_id,
    )


def network_error(exc: Exception) -> Send0Error:
    if isinstance(exc, httpx.TimeoutException):
        return Send0Error("Request timed out.", status=0, code="timeout")
    return Send0Error(f"Network error: {exc}", status=0, code="network_error")
