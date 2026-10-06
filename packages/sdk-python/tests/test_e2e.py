"""Against the real API (apps/api) running locally with in-memory Postgres."""
from __future__ import annotations

import threading
import time

import pytest

from send0 import AsyncSend0, Send0, Send0Error


def test_signup_flow_sync(server, deliver):
    with Send0(server["key"], base_url=server["url"]) as send0:
        inbox = send0.inboxes.create(name="py-signup", display_name="Py Agent")
        assert inbox.address == "py-signup@send0.email"

        # The verification email lands while we wait.
        threading.Timer(0.3, lambda: deliver("py-signup@send0.email", "otp-html-only.eml")).start()
        msg = send0.inboxes.wait(inbox.id, from_="*@acme.dev", timeout=10)
        assert msg is not None
        assert msg.extracted is not None and msg.extracted.otp == "482913"
        assert msg.extracted.action_link and "acme.dev/verify" in msg.extracted.action_link
        assert msg.from_ is not None and msg.from_.email == "noreply@acme.dev"

        reply = send0.messages.reply(msg.id, text="Thanks, verified.")
        assert reply.object == "message" and reply.thread_id == msg.thread_id
        thread = send0.threads.get(inbox.id, msg.thread_id)
        assert [m.direction for m in thread.messages] == ["in", "out"]

        with pytest.raises(Send0Error) as e:
            send0.messages.send(inbox.id, to="stranger@example.com", subject="Hi", text="x")
        assert e.value.code == "recipient_not_allowed"

        found = send0.messages.list(inbox.id, q="verify")
        assert any(m.id == msg.id for m in found)


def test_pagination_and_webhooks_sync(server):
    with Send0(server["key"], base_url=server["url"]) as send0:
        for n in range(3):
            send0.inboxes.create(name=f"py-page-{n}")
        names = [i.local_part for i in send0.inboxes.list(limit=2)]
        assert {"py-page-0", "py-page-1", "py-page-2"} <= set(names)

        hook = send0.webhooks.create(url="https://example.com/hook", events=["message.received"])
        assert hook.secret.startswith("whsec_")
        updated = send0.webhooks.update(hook.id, status="disabled")
        assert updated.status == "disabled"
        send0.webhooks.delete(hook.id)


def test_event_stream_sync(server, deliver):
    with Send0(server["key"], base_url=server["url"]) as send0:
        inbox = send0.inboxes.create(name="py-stream")
        threading.Timer(0.8, lambda: deliver("py-stream@send0.email", "magic-link.eml")).start()
        for event in send0.events.stream(inbox_id=inbox.id):
            assert event.type == "message.received" and event.inbox_id == inbox.id
            break


async def test_signup_flow_async(server, deliver):
    import asyncio

    async with AsyncSend0(server["key"], base_url=server["url"]) as send0:
        inbox = await send0.inboxes.create(name="py-async")
        loop = asyncio.get_running_loop()
        loop.call_later(0.3, lambda: loop.run_in_executor(None, deliver, "py-async@send0.email", "otp-subject.eml"))
        msg = await send0.inboxes.wait(inbox.id, from_="*@linear.app", timeout=10)
        assert msg is not None and msg.extracted is not None and msg.extracted.otp == "731902"
        page = await send0.messages.list(inbox.id)
        assert [m.id async for m in page] == [msg.id]
