from __future__ import annotations


class Send0Error(Exception):
    """Raised for every non-2xx response, network error and timeout.

    ``code`` is stable and safe to branch on, e.g. ``"recipient_not_allowed"``,
    ``"daily_limit_reached"``, ``"not_found"``.
    """

    def __init__(
        self,
        message: str,
        *,
        status: int,
        code: str,
        param: str | None = None,
        request_id: str | None = None,
    ) -> None:
        super().__init__(message)
        self.message = message
        self.status = status
        """HTTP status, or 0 for network errors and timeouts."""
        self.code = code
        self.param = param
        self.request_id = request_id

    def __repr__(self) -> str:
        return f"Send0Error(status={self.status}, code={self.code!r}, message={self.message!r})"
