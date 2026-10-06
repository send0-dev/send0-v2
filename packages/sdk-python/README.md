# send0

The official Python SDK for [send0](https://send0.dev): email inboxes for AI agents.

Sync and async clients, typed models, Python 3.10+.

```bash
pip install send0
```

## Give an agent an inbox and read the verification code

```python
from send0 import Send0

send0 = Send0()  # reads SEND0_API_KEY

inbox = send0.inboxes.create(name="signup-agent")
print(inbox.address)  # signup-agent@send0.email

browser.fill("#email", inbox.address)
browser.click("Create account")

# Blocks until the email lands, then returns it with the code already extracted.
msg = send0.inboxes.wait(inbox.id, from_="*@github.com", timeout=60)
print(msg.extracted.otp)          # "482913"
print(msg.extracted.action_link)  # "https://github.com/verify?..."
```

`from_` has a trailing underscore because `from` is a Python keyword. On message objects the sender is `msg.from_` too.

## Reply in the same thread

```python
from send0 import is_draft

reply = send0.messages.reply(msg.id, text="Thanks, confirmed.")
if is_draft(reply):
    print("waiting for approval:", reply.id)
```

## Async

```python
from send0 import AsyncSend0

async with AsyncSend0() as send0:
    inbox = await send0.inboxes.create(name="async-agent")
    msg = await send0.inboxes.wait(inbox.id, timeout=60)
    async for m in await send0.messages.list(inbox.id, q="invoice"):
        print(m.subject, m.extracted_text)
```

## Read, search, stream

```python
for m in send0.messages.list(inbox.id, from_="*@acme.com", q='"purchase order"'):
    print(m.subject, m.extracted_text)  # new text, without quoted history

thread = send0.threads.get(inbox.id, msg.thread_id)  # messages oldest first

for event in send0.events.stream(inbox_id=inbox.id):  # reconnects and resumes on its own
    print(event.type, event.data["subject"])
```

Lists return a `Page`. Iterating it walks every page automatically.

## Webhooks

```python
from send0 import verify_webhook

hook = send0.webhooks.create(url="https://example.com/hooks/send0", events=["message.received"])
# store hook.secret. It's shown once.

# In your handler, with the raw body:
if not verify_webhook(request.body, request.headers.get("send0-signature"), SECRET):
    return 400
```

## Errors and retries

Failures raise `Send0Error` with `status`, `code` (for example `recipient_not_allowed` or `daily_limit_reached`), `message` and `request_id`. Network errors, 429 and 5xx are retried twice with backoff. Every POST carries an `Idempotency-Key` that stays the same across retries, so a send never goes out twice.

```python
send0 = Send0(api_key="s0_live_…", max_retries=3, timeout=30)
```

Full docs: https://send0.dev/docs

## License

MIT
