from __future__ import annotations

import hashlib
import hmac
import time


def verify_webhook(
    raw_body: str | bytes,
    signature_header: str | None,
    secret: str,
    *,
    tolerance_seconds: int = 300,
    now: float | None = None,
) -> bool:
    """Verify a ``send0-signature`` header (``t=…,v1=…``, HMAC-SHA256 of ``"{t}.{body}"``).

    Pass the raw request body exactly as received. Signatures older than
    ``tolerance_seconds`` (default 5 minutes) are rejected.
    """
    if not signature_header:
        return False
    parts = [p.strip().split("=", 1) for p in signature_header.split(",")]
    pairs = [(p[0], p[1]) for p in parts if len(p) == 2]
    try:
        t = int(next(v for k, v in pairs if k == "t"))
    except (StopIteration, ValueError):
        return False
    sigs = [v for k, v in pairs if k == "v1"]
    if not sigs:
        return False
    if abs((now if now is not None else time.time()) - t) > tolerance_seconds:
        return False
    body = raw_body.encode() if isinstance(raw_body, str) else raw_body
    expected = hmac.new(secret.encode(), f"{t}.".encode() + body, hashlib.sha256).hexdigest()
    return any(hmac.compare_digest(expected, s) for s in sigs)
