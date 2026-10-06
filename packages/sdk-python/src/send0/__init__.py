"""send0: email inboxes for AI agents. https://send0.dev/docs"""

from ._async_client import AsyncSend0
from ._base import VERSION as __version__
from ._client import NOT_GIVEN, Send0
from ._errors import Send0Error
from ._models import (
    ApiKey,
    ApiKeyWithSecret,
    Attachment,
    AttachmentDownload,
    Delivery,
    Draft,
    Event,
    Inbox,
    Mailbox,
    Message,
    Thread,
    ThreadWithMessages,
    Webhook,
    WebhookWithSecret,
)
from ._pagination import AsyncPage, Page
from ._webhooks import verify_webhook


def is_draft(result: "Message | Draft") -> bool:
    """True when a send/reply/forward produced a draft awaiting approval instead of a message."""
    return isinstance(result, Draft)


__all__ = [
    "Send0",
    "AsyncSend0",
    "Send0Error",
    "NOT_GIVEN",
    "verify_webhook",
    "is_draft",
    "Page",
    "AsyncPage",
    "Inbox",
    "Message",
    "Thread",
    "ThreadWithMessages",
    "Draft",
    "Attachment",
    "AttachmentDownload",
    "Webhook",
    "WebhookWithSecret",
    "Delivery",
    "Event",
    "ApiKey",
    "ApiKeyWithSecret",
    "Mailbox",
    "__version__",
]
