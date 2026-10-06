from __future__ import annotations

import json

import httpx
import pytest
import respx

from send0 import AsyncSend0, Send0, Send0Error, verify_webhook
from send0._sse import parse_sse

BASE = "https://api.test"


def msg(**over):
    m = {
        "object": "message", "id": "msg_1", "inbox_id": "ibx_1", "thread_id": "thr_1", "direction": "in",
        "status": "received", "rfc_message_id": "<a@x>", "in_reply_to": [], "references": [],
        "from": {"name": "Acme", "email": "noreply@acme.dev"}, "to": [], "cc": [], "reply_to": [],
        "subject": "Your code", "text": "code 482913", "extracted_text": "code 482913",
        "extracted": {"otp": "482913", "links": [], "action_link": None},
        "auth": None, "safety": None, "tag": None, "attachments": [], "size": 10,
        "sent_at": None, "received_at": "2026-10-06T10:00:00Z", "created_at": "2026-10-06T10:00:00Z",
    }
    m.update(over)
    return m


@pytest.fixture
def client() -> Send0:
    return Send0("s0_test_x", base_url=BASE, max_retries=2)


def test_needs_a_key(monkeypatch):
    monkeypatch.delenv("SEND0_API_KEY", raising=False)
    with pytest.raises(Send0Error) as e:
        Send0()
    assert e.value.code == "missing_api_key"


@respx.mock
def test_auth_and_errors(client):
    route = respx.post(f"{BASE}/v1/inboxes/ibx_1/messages").mock(
        return_value=httpx.Response(403, json={"error": {"code": "recipient_not_allowed", "message": "nope", "param": "to", "request_id": "r1"}})
    )
    with pytest.raises(Send0Error) as e:
        client.messages.send("ibx_1", to="a@b.co", subject="s", text="t")
    assert (e.value.status, e.value.code, e.value.param, e.value.request_id) == (403, "recipient_not_allowed", "to", "r1")
    req = route.calls.last.request
    assert req.headers["authorization"] == "Bearer s0_test_x"
    assert req.headers["user-agent"].startswith("send0-python/")


@respx.mock
def test_retries_keep_the_idempotency_key(client, monkeypatch):
    monkeypatch.setattr("time.sleep", lambda s: None)
    route = respx.post(f"{BASE}/v1/inboxes").mock(
        side_effect=[httpx.ConnectError("boom"), httpx.Response(503), httpx.Response(201, json={
            "object": "inbox", "id": "ibx_1", "address": "x@send0.email", "local_part": "x", "domain": "send0.email",
            "display_name": None, "mode": "live", "send_policy": "reply_only", "status": "active", "retention_days": 7,
            "metadata": {}, "expires_at": None, "created_at": "2026-10-06T10:00:00Z", "updated_at": "2026-10-06T10:00:00Z"})]
    )
    inbox = client.inboxes.create(name="x")
    assert inbox.address == "x@send0.email"
    keys = {c.request.headers["idempotency-key"] for c in route.calls}
    assert len(route.calls) == 3 and len(keys) == 1


@respx.mock
def test_no_retry_on_4xx(client):
    route = respx.get(f"{BASE}/v1/inboxes").mock(return_value=httpx.Response(400, json={"error": {"code": "invalid_request", "message": "bad"}}))
    with pytest.raises(Send0Error):
        client.inboxes.list()
    assert route.call_count == 1


@respx.mock
def test_pagination_walks_every_page(client):
    respx.get(f"{BASE}/v1/inboxes/ibx_1/messages").mock(side_effect=[
        httpx.Response(200, json={"object": "list", "data": [msg(id="m1"), msg(id="m2")], "next_cursor": "c1"}),
        httpx.Response(200, json={"object": "list", "data": [msg(id="m3")], "next_cursor": None}),
    ])
    page = client.messages.list("ibx_1", from_="*@acme.dev", limit=2)
    assert page.has_more
    assert [m.id for m in page] == ["m1", "m2", "m3"]
    second = respx.calls[1].request.url.params
    assert second["cursor"] == "c1" and second["from"] == "*@acme.dev" and second["limit"] == "2"


@respx.mock
def test_wait_splits_long_waits_with_the_same_since(client):
    route = respx.get(f"{BASE}/v1/inboxes/ibx_1/messages/wait").mock(side_effect=[
        httpx.Response(200, json={"object": "wait_result", "timed_out": True, "message": None}),
        httpx.Response(200, json={"object": "wait_result", "timed_out": False, "message": msg()}),
    ])
    m = client.inboxes.wait("ibx_1", from_="*@acme.dev", timeout=200)
    assert m is not None and m.extracted is not None and m.extracted.otp == "482913"
    a, b = (c.request.url.params for c in route.calls)
    assert (a["timeout"], b["timeout"]) == ("120", "80")
    assert a["since"] == b["since"] and a["from"] == "*@acme.dev"


@respx.mock
def test_wait_returns_none_on_timeout(client):
    respx.get(f"{BASE}/v1/inboxes/ibx_1/messages/wait").mock(return_value=httpx.Response(200, json={"object": "wait_result", "timed_out": True, "message": None}))
    assert client.inboxes.wait("ibx_1", timeout=1) is None


@respx.mock
def test_raw_url_does_not_follow_the_redirect(client):
    respx.get(f"{BASE}/v1/messages/m1/raw").mock(return_value=httpx.Response(302, headers={"location": "https://s3.example/raw.eml?sig"}))
    assert client.messages.raw_url("m1") == "https://s3.example/raw.eml?sig"


@respx.mock
def test_update_can_clear_fields(client):
    route = respx.patch(f"{BASE}/v1/inboxes/ibx_1").mock(return_value=httpx.Response(400, json={"error": {"code": "x", "message": "x"}}))
    with pytest.raises(Send0Error):
        client.inboxes.update("ibx_1", display_name=None)
    assert route.calls.last.request.content == b'{"display_name": null}'


@respx.mock
def test_send_returns_a_draft_for_approval_inboxes(client):
    respx.post(f"{BASE}/v1/messages/m1/reply").mock(return_value=httpx.Response(202, json={
        "object": "draft", "id": "drf_1", "inbox_id": "ibx_1", "thread_id": "thr_1", "status": "pending", "kind": "reply",
        "to": [], "cc": [], "bcc": [], "subject": "Re: x", "text": "ok", "html": None, "decided_by": None, "decided_at": None,
        "created_at": "2026-10-06T10:00:00Z"}))
    from send0 import Draft, is_draft
    r = client.messages.reply("m1", text="ok")
    assert is_draft(r) and isinstance(r, Draft)


def test_verify_webhook_known_vector():
    # Same vector as the server and TypeScript SDK tests, computed independently with openssl.
    header = "t=1791190000,v1=54ea7b7afa65b8ac6431cbd7018e475660476534c583d4c9b9c1f72cc0a71e1b"
    assert verify_webhook('{"id":"evt_1"}', header, "whsec_test", now=1791190010)
    assert verify_webhook(b'{"id":"evt_1"}', header, "whsec_test", now=1791190010)
    assert not verify_webhook('{"id":"evt_2"}', header, "whsec_test", now=1791190010)
    assert not verify_webhook('{"id":"evt_1"}', header, "whsec_test", now=1791199999)
    assert not verify_webhook('{"id":"evt_1"}', "garbage", "whsec_test")


def test_sse_parser():
    lines = ["retry: 3000", ": connected", "", "id: evt_1", "event: message.received", 'data: {"a":1}', "", ": ping", "", 'data: {"b":2}', ""]
    out = list(parse_sse(iter(lines)))
    assert [(m.id, m.event, m.data) for m in out] == [("evt_1", "message.received", '{"a":1}'), (None, None, '{"b":2}')]


@respx.mock
async def test_async_client_matches():
    respx.get(f"{BASE}/v1/inboxes/ibx_1/messages/wait").mock(return_value=httpx.Response(200, json={"object": "wait_result", "timed_out": False, "message": msg()}))
    respx.get(f"{BASE}/v1/inboxes/ibx_1/messages").mock(side_effect=[
        httpx.Response(200, json={"object": "list", "data": [msg(id="m1")], "next_cursor": "c"}),
        httpx.Response(200, json={"object": "list", "data": [msg(id="m2")], "next_cursor": None}),
    ])
    async with AsyncSend0("s0_test_x", base_url=BASE) as client:
        m = await client.inboxes.wait("ibx_1", timeout=5)
        assert m is not None and m.extracted is not None and m.extracted.otp == "482913"
        assert [x.id async for x in await client.messages.list("ibx_1")] == ["m1", "m2"]


@respx.mock
def test_org_wide_lists_draft_edit_and_usage(client):
    msgs = respx.get(f"{BASE}/v1/messages").mock(return_value=httpx.Response(200, json={"object": "list", "data": [msg()], "next_cursor": None}))
    edit = respx.patch(f"{BASE}/v1/drafts/drf_1").mock(
        return_value=httpx.Response(200, json={
            "object": "draft", "id": "drf_1", "inbox_id": "ibx_1", "thread_id": None, "status": "pending", "kind": "new",
            "to": [], "cc": [], "bcc": [], "subject": "s", "text": "edited", "html": None,
            "decided_by": None, "decided_at": None, "created_at": "2026-10-06T10:00:00Z",
        })
    )
    respx.get(f"{BASE}/v1/usage").mock(
        return_value=httpx.Response(200, json={
            "object": "usage", "plan": "free", "inboxes": {"used": 1, "limit": 5},
            "sends_today": {"used": 3, "limit": 50, "resets_at": "2026-10-07T00:00:00Z"},
            "sending": {"paused": False, "reason": None, "paused_at": None},
        })
    )
    assert [m.id for m in client.messages.list_all(inbox_id="ibx_1", status="received")] == ["msg_1"]
    assert msgs.calls[0].request.url.params["status"] == "received"
    assert client.drafts.update("drf_1", text="edited").text == "edited"
    assert json.loads(edit.calls[0].request.read()) == {"text": "edited"}
    assert client.usage.get().sends_today.limit == 50
