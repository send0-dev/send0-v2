# Generated from _client.py by scripts/gen_async.py. Do not edit.
from __future__ import annotations

import asyncio
import json
import time
from typing import Any, AsyncIterator, Literal, Mapping, Sequence, TypeVar, Union

import httpx
from pydantic import BaseModel

from . import _base
from ._errors import Send0Error
from ._models import (
    ApiKey,
    ApiKeyWithSecret,
    AttachmentDownload,
    DeletedInbox,
    DeletedWebhook,
    Delivery,
    Draft,
    Event,
    Inbox,
    Message,
    RevokedApiKey,
    Thread,
    ThreadWithMessages,
    WaitResult,
    Webhook,
    WebhookTestResult,
    WebhookWithSecret,
)
from ._pagination import AsyncPage
from ._sse import aparse_sse
from ._webhooks import verify_webhook

M = TypeVar("M", bound=BaseModel)


class _NotGiven:
    """Marks an argument that wasn't passed, so None can mean "clear this field"."""

    def __bool__(self) -> bool:
        return False

    def __repr__(self) -> str:
        return "NOT_GIVEN"


NOT_GIVEN: Any = _NotGiven()

Address = Union[str, Mapping[str, Any]]
Recipients = Union[Address, Sequence[Address]]
SendResult = Union[Message, Draft]


def _given(**kwargs: Any) -> dict[str, Any]:
    return {k: v for k, v in kwargs.items() if not isinstance(v, _NotGiven)}


def _send_result(data: dict[str, Any]) -> SendResult:
    return Draft.model_validate(data) if data.get("object") == "draft" else Message.model_validate(data)


class _AsyncHttp:
    def __init__(self, api_key: str | None, base_url: str, timeout: float, max_retries: int, http_client: httpx.AsyncClient | None) -> None:
        self.base_url = base_url.rstrip("/")
        self.max_retries = max_retries
        self.timeout = timeout
        self.client = http_client or httpx.AsyncClient(timeout=timeout)
        self.headers = _base.default_headers(_base.resolve_api_key(api_key))

    async def request(
        self,
        method: str,
        path: str,
        *,
        params: Mapping[str, Any] | None = None,
        body: Any = None,
        timeout: float | None = None,
        idempotency_key: str | None = None,
        follow_redirects: bool = True,
        headers: Mapping[str, str] | None = None,
    ) -> httpx.Response:
        h = {**self.headers, **(headers or {})}
        if body is not None:
            h["content-type"] = "application/json"
        if method == "POST":
            # Stable across retries: the API replays the first response instead of acting twice.
            h["idempotency-key"] = idempotency_key or _base.new_idempotency_key()
        attempt = 0
        while True:
            try:
                res = await self.client.request(
                    method,
                    self.base_url + path,
                    params=_base.clean_params(params),
                    content=None if body is None else json.dumps(body),
                    headers=h,
                    timeout=timeout or self.timeout,
                    follow_redirects=follow_redirects,
                )
            except httpx.TransportError as exc:
                if attempt < self.max_retries:
                    await asyncio.sleep(_base.backoff_seconds(attempt, None))
                    attempt += 1
                    continue
                raise _base.network_error(exc) from exc
            if _base.should_retry(res.status_code) and attempt < self.max_retries:
                await asyncio.sleep(_base.backoff_seconds(attempt, res.headers.get("retry-after")))
                attempt += 1
                continue
            if res.status_code >= 400:
                raise _base.error_from_response(res)
            return res

    async def get(self, model: type[M], path: str, **kw: Any) -> M:
        return model.model_validate((await self.request("GET", path, **kw)).json())

    async def page(self, model: type[M], path: str, params: Mapping[str, Any]) -> AsyncPage[M]:
        async def load(cursor: str | None) -> AsyncPage[M]:
            data = (await self.request("GET", path, params={**params, "cursor": cursor})).json()
            return AsyncPage([model.model_validate(x) for x in data["data"]], data["next_cursor"], load)

        return await load(params.get("cursor"))


class Inboxes:
    def __init__(self, http: _AsyncHttp) -> None:
        self._http = http

    async def create(
        self,
        *,
        name: str | None = None,
        display_name: str | None = None,
        send_policy: Literal["open", "reply_only", "approval"] | None = None,
        metadata: Mapping[str, Any] | None = None,
        domain: str | None = None,
        expires_at: str | None = None,
        idempotency_key: str | None = None,
    ) -> Inbox:
        """Create an inbox. ``name="research-agent"`` → research-agent@send0.email (random if omitted)."""
        body = {k: v for k, v in dict(name=name, display_name=display_name, send_policy=send_policy, metadata=metadata, domain=domain, expires_at=expires_at).items() if v is not None}
        return Inbox.model_validate((await self._http.request("POST", "/v1/inboxes", body=body, idempotency_key=idempotency_key)).json())

    async def list(self, *, limit: int | None = None, cursor: str | None = None) -> AsyncPage[Inbox]:
        return await self._http.page(Inbox, "/v1/inboxes", {"limit": limit, "cursor": cursor})

    async def get(self, inbox_id: str) -> Inbox:
        return await self._http.get(Inbox, f"/v1/inboxes/{inbox_id}")

    async def update(
        self,
        inbox_id: str,
        *,
        display_name: str | None = NOT_GIVEN,
        send_policy: Literal["open", "reply_only", "approval"] = NOT_GIVEN,
        metadata: Mapping[str, Any] = NOT_GIVEN,
        expires_at: str | None = NOT_GIVEN,
    ) -> Inbox:
        body = _given(display_name=display_name, send_policy=send_policy, metadata=metadata, expires_at=expires_at)
        return Inbox.model_validate((await self._http.request("PATCH", f"/v1/inboxes/{inbox_id}", body=body)).json())

    async def delete(self, inbox_id: str) -> DeletedInbox:
        return DeletedInbox.model_validate((await self._http.request("DELETE", f"/v1/inboxes/{inbox_id}")).json())

    async def wait(
        self,
        inbox_id: str,
        *,
        from_: str | None = None,
        subject: str | None = None,
        direction: Literal["in", "out"] | None = None,
        since: str | None = None,
        timeout: float = 30,
    ) -> Message | None:
        """Block until a matching message arrives; returns it (code and links extracted) or None.

        ``from_`` takes an address or wildcard such as ``"*@github.com"``. Waits longer than
        120s are split into several requests that share the same ``since``.
        """
        since = since or time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(time.time() - 60))
        remaining = timeout
        while True:
            t = max(1, min(_base.MAX_WAIT_PER_REQUEST, int(-(-remaining // 1))))
            res = await self._http.request(
                "GET",
                f"/v1/inboxes/{inbox_id}/messages/wait",
                params={"from": from_, "subject": subject, "direction": direction, "since": since, "timeout": t},
                timeout=t + 15,
            )
            result = WaitResult.model_validate(res.json())
            if not result.timed_out:
                return result.message
            remaining -= t  # the server waited the full timeout; don't trust the wall clock
            if remaining < 1:
                return None


class Messages:
    def __init__(self, http: _AsyncHttp) -> None:
        self._http = http

    async def list(
        self,
        inbox_id: str,
        *,
        from_: str | None = None,
        subject: str | None = None,
        q: str | None = None,
        direction: Literal["in", "out"] | None = None,
        since: str | None = None,
        thread_id: str | None = None,
        limit: int | None = None,
        cursor: str | None = None,
    ) -> AsyncPage[Message]:
        """Newest first. ``from_`` accepts wildcards; ``q`` is full-text search."""
        params = {"from": from_, "subject": subject, "q": q, "direction": direction, "since": since, "thread_id": thread_id, "limit": limit, "cursor": cursor}
        return await self._http.page(Message, f"/v1/inboxes/{inbox_id}/messages", params)

    async def get(self, message_id: str) -> Message:
        return await self._http.get(Message, f"/v1/messages/{message_id}")

    async def send(
        self,
        inbox_id: str,
        *,
        to: Recipients,
        subject: str,
        text: str | None = None,
        html: str | None = None,
        cc: Recipients | None = None,
        bcc: Recipients | None = None,
        idempotency_key: str | None = None,
    ) -> SendResult:
        """Send a new message. Approval inboxes return a :class:`Draft` instead."""
        body = {k: v for k, v in dict(to=to, subject=subject, text=text, html=html, cc=cc, bcc=bcc).items() if v is not None}
        return _send_result((await self._http.request("POST", f"/v1/inboxes/{inbox_id}/messages", body=body, idempotency_key=idempotency_key)).json())

    async def reply(
        self,
        message_id: str,
        *,
        text: str | None = None,
        html: str | None = None,
        reply_all: bool = False,
        cc: Recipients | None = None,
        bcc: Recipients | None = None,
        idempotency_key: str | None = None,
    ) -> SendResult:
        """Reply in the same thread (In-Reply-To, References and "Re:" subject)."""
        body = {k: v for k, v in dict(text=text, html=html, reply_all=reply_all, cc=cc, bcc=bcc).items() if v is not None}
        return _send_result((await self._http.request("POST", f"/v1/messages/{message_id}/reply", body=body, idempotency_key=idempotency_key)).json())

    async def forward(
        self,
        message_id: str,
        *,
        to: Recipients,
        text: str | None = None,
        html: str | None = None,
        cc: Recipients | None = None,
        bcc: Recipients | None = None,
        idempotency_key: str | None = None,
    ) -> SendResult:
        body = {k: v for k, v in dict(to=to, text=text, html=html, cc=cc, bcc=bcc).items() if v is not None}
        return _send_result((await self._http.request("POST", f"/v1/messages/{message_id}/forward", body=body, idempotency_key=idempotency_key)).json())

    async def attachment(self, message_id: str, attachment_id: str) -> AttachmentDownload:
        """Attachment metadata with a short-lived ``download_url``."""
        return await self._http.get(AttachmentDownload, f"/v1/messages/{message_id}/attachments/{attachment_id}")

    async def raw_url(self, message_id: str) -> str:
        """A short-lived URL to download the original .eml."""
        res = await self._http.request("GET", f"/v1/messages/{message_id}/raw", follow_redirects=False)
        location: str | None = res.headers.get("location")
        if not location:
            raise Send0Error("No download link returned.", status=res.status_code, code="no_download_url")
        return str(location)


class Threads:
    def __init__(self, http: _AsyncHttp) -> None:
        self._http = http

    async def list(self, inbox_id: str, *, limit: int | None = None, cursor: str | None = None) -> AsyncPage[Thread]:
        return await self._http.page(Thread, f"/v1/inboxes/{inbox_id}/threads", {"limit": limit, "cursor": cursor})

    async def get(self, inbox_id: str, thread_id: str, *, include_html: bool = False) -> ThreadWithMessages:
        """The thread with its messages, oldest first."""
        return await self._http.get(ThreadWithMessages, f"/v1/inboxes/{inbox_id}/threads/{thread_id}", params={"include_html": include_html})


class Drafts:
    def __init__(self, http: _AsyncHttp) -> None:
        self._http = http

    async def list(self, inbox_id: str, *, status: Literal["pending", "approved", "rejected", "sent"] | None = None, limit: int | None = None, cursor: str | None = None) -> AsyncPage[Draft]:
        return await self._http.page(Draft, f"/v1/inboxes/{inbox_id}/drafts", {"status": status, "limit": limit, "cursor": cursor})

    async def get(self, draft_id: str) -> Draft:
        return await self._http.get(Draft, f"/v1/drafts/{draft_id}")

    async def send(self, draft_id: str) -> Message:
        """Approve and send (admin key)."""
        return Message.model_validate((await self._http.request("POST", f"/v1/drafts/{draft_id}/send")).json())

    async def reject(self, draft_id: str) -> Draft:
        return Draft.model_validate((await self._http.request("POST", f"/v1/drafts/{draft_id}/reject")).json())


class Webhooks:
    def __init__(self, http: _AsyncHttp) -> None:
        self._http = http

    async def create(self, *, url: str, events: Sequence[str] | None = None, inbox_ids: Sequence[str] | None = None) -> WebhookWithSecret:
        """Returns the signing ``secret`` once. Store it to verify deliveries."""
        body = {k: v for k, v in dict(url=url, events=events, inbox_ids=inbox_ids).items() if v is not None}
        return WebhookWithSecret.model_validate((await self._http.request("POST", "/v1/webhooks", body=body)).json())

    async def list(self, *, limit: int | None = None, cursor: str | None = None) -> AsyncPage[Webhook]:
        return await self._http.page(Webhook, "/v1/webhooks", {"limit": limit, "cursor": cursor})

    async def get(self, webhook_id: str) -> Webhook:
        return await self._http.get(Webhook, f"/v1/webhooks/{webhook_id}")

    async def update(
        self,
        webhook_id: str,
        *,
        url: str = NOT_GIVEN,
        events: Sequence[str] = NOT_GIVEN,
        inbox_ids: Sequence[str] | None = NOT_GIVEN,
        status: Literal["enabled", "disabled"] = NOT_GIVEN,
    ) -> Webhook:
        body = _given(url=url, events=events, inbox_ids=inbox_ids, status=status)
        return Webhook.model_validate((await self._http.request("PATCH", f"/v1/webhooks/{webhook_id}", body=body)).json())

    async def delete(self, webhook_id: str) -> DeletedWebhook:
        return DeletedWebhook.model_validate((await self._http.request("DELETE", f"/v1/webhooks/{webhook_id}")).json())

    async def rotate_secret(self, webhook_id: str) -> WebhookWithSecret:
        return WebhookWithSecret.model_validate((await self._http.request("POST", f"/v1/webhooks/{webhook_id}/rotate-secret")).json())

    async def test(self, webhook_id: str) -> WebhookTestResult:
        return WebhookTestResult.model_validate((await self._http.request("POST", f"/v1/webhooks/{webhook_id}/test")).json())

    async def deliveries(self, webhook_id: str, *, status: Literal["pending", "succeeded", "failed"] | None = None, limit: int | None = None, cursor: str | None = None) -> AsyncPage[Delivery]:
        return await self._http.page(Delivery, f"/v1/webhooks/{webhook_id}/deliveries", {"status": status, "limit": limit, "cursor": cursor})

    async def retry_delivery(self, webhook_id: str, delivery_id: str) -> Delivery:
        return Delivery.model_validate((await self._http.request("POST", f"/v1/webhooks/{webhook_id}/deliveries/{delivery_id}/retry")).json())

    @staticmethod
    def verify(raw_body: str | bytes, signature_header: str | None, secret: str) -> bool:
        """Verify a delivery's ``send0-signature`` header against the raw body."""
        return verify_webhook(raw_body, signature_header, secret)


class ApiKeys:
    def __init__(self, http: _AsyncHttp) -> None:
        self._http = http

    async def create(self, *, name: str, scopes: Sequence[Literal["read", "send", "admin"]] | None = None, inbox_ids: Sequence[str] | None = None) -> ApiKeyWithSecret:
        """Returns the full ``key`` once."""
        body = {k: v for k, v in dict(name=name, scopes=scopes, inbox_ids=inbox_ids).items() if v is not None}
        return ApiKeyWithSecret.model_validate((await self._http.request("POST", "/v1/api-keys", body=body)).json())

    async def list(self, *, limit: int | None = None, cursor: str | None = None) -> AsyncPage[ApiKey]:
        return await self._http.page(ApiKey, "/v1/api-keys", {"limit": limit, "cursor": cursor})

    async def revoke(self, api_key_id: str) -> RevokedApiKey:
        return RevokedApiKey.model_validate((await self._http.request("DELETE", f"/v1/api-keys/{api_key_id}")).json())


class Events:
    def __init__(self, http: _AsyncHttp) -> None:
        self._http = http

    async def stream(self, *, inbox_id: str | None = None, last_event_id: str | None = None, reconnect: bool = True) -> AsyncIterator[Event]:
        """Live events (SSE). Reconnects and resumes from the last event seen. Stop with ``break``."""
        last = last_event_id
        failures = 0
        while True:
            headers = {**self._http.headers, "accept": "text/event-stream", **({"last-event-id": last} if last else {})}
            try:
                async with self._http.client.stream(
                    "GET",
                    self._http.base_url + "/v1/events/stream",
                    params=_base.clean_params({"inbox_id": inbox_id}),
                    headers=headers,
                    timeout=httpx.Timeout(None, connect=10.0),
                ) as res:
                    if res.status_code >= 400:
                        await res.aread()
                        raise _base.error_from_response(res)
                    failures = 0
                    async for msg in aparse_sse(res.aiter_lines()):
                        if msg.id:
                            last = msg.id
                        yield Event.model_validate(json.loads(msg.data))
            except Send0Error as err:
                if 400 <= err.status < 500 and err.status != 429:
                    raise
            except httpx.TransportError:
                pass
            if not reconnect:
                return
            await asyncio.sleep(min(30.0, 2.0**failures))
            failures += 1


class AsyncSend0:
    """The async send0 client. Same API as :class:`Send0`, with ``await``.

    >>> from send0 import Send0
    >>> send0 = AsyncSend0()  # reads SEND0_API_KEY
    >>> inbox = await send0.inboxes.create(name="signup-agent")
    >>> msg = await send0.inboxes.wait(inbox.id, from_="*@github.com", timeout=60)
    >>> msg.extracted.otp
    '482913'
    """

    def __init__(
        self,
        api_key: str | None = None,
        *,
        base_url: str = _base.DEFAULT_BASE_URL,
        timeout: float = _base.DEFAULT_TIMEOUT,
        max_retries: int = _base.DEFAULT_MAX_RETRIES,
        http_client: httpx.AsyncClient | None = None,
    ) -> None:
        self._http = _AsyncHttp(api_key, base_url, timeout, max_retries, http_client)
        self.inboxes = Inboxes(self._http)
        self.messages = Messages(self._http)
        self.threads = Threads(self._http)
        self.drafts = Drafts(self._http)
        self.webhooks = Webhooks(self._http)
        self.api_keys = ApiKeys(self._http)
        self.events = Events(self._http)

    async def aclose(self) -> None:
        await self._http.client.aclose()

    async def __aenter__(self) -> "AsyncSend0":
        return self

    async def __aexit__(self, *exc: object) -> None:
        await self.aclose()
