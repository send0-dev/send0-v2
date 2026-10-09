"""The nine send0 tools, with the names, descriptions and output of the MCP server (packages/agent-tools)."""

from __future__ import annotations

from typing import Any, ClassVar, Literal, Union

from langchain_core.callbacks import AsyncCallbackManagerForToolRun, CallbackManagerForToolRun
from langchain_core.tools import ArgsSchema, BaseTool
from pydantic import BaseModel, ConfigDict, Field, create_model
from send0 import AsyncSend0, Send0, Send0Error, is_draft

from ._format import (
    UNTRUSTED_NOTE,
    format_draft,
    format_inbox,
    format_message,
    format_message_line,
    format_thread,
    format_thread_line,
)

_INBOX_ID_DESC = "Inbox id (ibx_…). Defaults to the configured inbox."
Recipients = Union[str, list[str]]
_RECIPIENTS_DESC = "Email address, or a list of addresses"


def error_text(err: BaseException) -> str:
    """Error text the model can read and act on (e.g. pick another recipient), instead of a crashed call."""
    if isinstance(err, Send0Error):
        return f"send0 error {err.code}: {err.message}"
    return f"Error: {err}"


class Send0Tool(BaseTool):
    """Base for the send0 tools: holds the clients and maps errors to text.

    Each tool splits into ``_fetch`` (one API call, the same for the sync and async clients, which
    share method names) and ``_render`` (the text for the model).
    """

    model_config = ConfigDict(arbitrary_types_allowed=True)

    client: Send0 | None = None
    async_client: AsyncSend0 | None = None
    default_inbox_id: str | None = None
    sends: ClassVar[bool] = False
    """True for the tools that email someone (send_email, reply): the ones to put behind approval."""

    @property
    def tool_call_schema(self) -> ArgsSchema:
        # BaseTool rebuilds a subset model here and loses fields LangChain can't annotate, such as
        # "from" (a keyword). These tools have no injected arguments, so the args schema is the schema.
        return self.args_schema if self.args_schema is not None else super().tool_call_schema

    def _inbox(self, inbox_id: str | None) -> str:
        resolved = inbox_id if inbox_id is not None else self.default_inbox_id
        if not resolved:
            raise ValueError("No inbox given. Pass inbox_id, or call create_inbox / list_inboxes first.")
        return resolved

    def _fetch(self, client: Any, args: dict[str, Any]) -> Any:
        raise NotImplementedError

    def _render(self, result: Any, args: dict[str, Any]) -> str:
        raise NotImplementedError

    def _run(self, run_manager: CallbackManagerForToolRun | None = None, **kwargs: Any) -> str:
        try:
            if self.client is None:
                raise ValueError("This send0 tool has no sync client. Pass client=Send0(…) or call it asynchronously.")
            return self._render(self._fetch(self.client, kwargs), kwargs)
        except Exception as err:
            return error_text(err)

    async def _arun(self, run_manager: AsyncCallbackManagerForToolRun | None = None, **kwargs: Any) -> str:
        if self.async_client is None:
            # No async client: run the sync call in a thread, as BaseTool does by default.
            result: str = await super()._arun(run_manager=run_manager, **kwargs)
            return result
        try:
            return self._render(await self._fetch(self.async_client, kwargs), kwargs)
        except Exception as err:
            return error_text(err)


class CreateInboxArgs(BaseModel):
    name: str | None = Field(default=None, description="Local part, e.g. 'signup-agent' → signup-agent@send0.email")
    display_name: str | None = Field(default=None, description="Sender name shown to recipients")


class CreateInboxTool(Send0Tool):
    name: str = "create_inbox"
    description: str = "Create a new email address for this task, like name@send0.email. Omit name for a random address."
    args_schema: type[BaseModel] = CreateInboxArgs

    def _fetch(self, client: Any, args: dict[str, Any]) -> Any:
        return client.inboxes.create(name=args.get("name") or None, display_name=args.get("display_name") or None)

    def _render(self, result: Any, args: dict[str, Any]) -> str:
        return f"Created inbox {format_inbox(result)}"


class ListInboxesArgs(BaseModel):
    pass


class ListInboxesTool(Send0Tool):
    name: str = "list_inboxes"
    description: str = "List the inboxes this API key can use."
    args_schema: type[BaseModel] = ListInboxesArgs

    def _fetch(self, client: Any, args: dict[str, Any]) -> Any:
        return client.inboxes.list(limit=100)

    def _render(self, result: Any, args: dict[str, Any]) -> str:
        if not result.data:
            return "No inboxes yet. Use create_inbox."
        return "\n".join(f"- {format_inbox(i)}" for i in result.data)


# "from" is a Python keyword, so these two schemas are built with create_model to keep the MCP argument name.
_wait_fields: dict[str, Any] = {
    "inbox_id": (str | None, Field(default=None, description=_INBOX_ID_DESC)),
    "from": (str | None, Field(default=None, description="Sender address or wildcard, e.g. '*@github.com'")),
    "subject": (str | None, Field(default=None, description="Text the subject must contain")),
    "timeout": (int | None, Field(default=None, ge=1, le=600, description="Seconds to wait (default 60)")),
}
WaitForEmailArgs = create_model("WaitForEmailArgs", **_wait_fields)


class WaitForEmailTool(Send0Tool):
    name: str = "wait_for_email"
    description: str = (
        "Block until an email matching the filters arrives (or one arrived in the last minute), then return it with "
        "any one-time code and verification link already extracted. Use right after triggering a sign-up, login or "
        "password reset."
    )
    args_schema: type[BaseModel] = WaitForEmailArgs

    def _fetch(self, client: Any, args: dict[str, Any]) -> Any:
        return client.inboxes.wait(
            self._inbox(args.get("inbox_id")),
            from_=args.get("from") or None,
            subject=args.get("subject") or None,
            timeout=args.get("timeout") or 60,
        )

    def _render(self, result: Any, args: dict[str, Any]) -> str:
        if result is None:
            return f"No matching email arrived within {args.get('timeout') or 60} seconds."
        return f"{UNTRUSTED_NOTE}\n\n{format_message(result)}"


_search_fields: dict[str, Any] = {
    "inbox_id": (str | None, Field(default=None, description=_INBOX_ID_DESC)),
    "query": (str | None, Field(default=None, description="Full-text search over subject and body")),
    "from": (str | None, Field(default=None, description="Sender address or wildcard")),
    "direction": (Literal["in", "out"] | None, None),
    "limit": (int | None, Field(default=None, ge=1, le=50, description="Default 10")),
}
SearchMessagesArgs = create_model("SearchMessagesArgs", **_search_fields)


class SearchMessagesTool(Send0Tool):
    name: str = "search_messages"
    description: str = "Search or list messages in an inbox, newest first."
    args_schema: type[BaseModel] = SearchMessagesArgs

    def _fetch(self, client: Any, args: dict[str, Any]) -> Any:
        return client.messages.list(
            self._inbox(args.get("inbox_id")),
            limit=args.get("limit") or 10,
            q=args.get("query") or None,
            from_=args.get("from") or None,
            direction=args.get("direction") or None,
        )

    def _render(self, result: Any, args: dict[str, Any]) -> str:
        if not result.data:
            return "No messages found."
        more = "\n(more results exist; narrow the search or raise limit)" if result.has_more else ""
        return "\n".join(format_message_line(m) for m in result.data) + more + "\nUse get_message or get_thread to read one."


class GetMessageArgs(BaseModel):
    message_id: str = Field(description="Message id (msg_…)")
    full_text: bool | None = Field(default=None, description="Include quoted history and signatures")


class GetMessageTool(Send0Tool):
    name: str = "get_message"
    description: str = (
        "Read one message, including extracted codes and links. Body is the new text only unless full_text is true."
    )
    args_schema: type[BaseModel] = GetMessageArgs

    def _fetch(self, client: Any, args: dict[str, Any]) -> Any:
        return client.messages.get(args["message_id"])

    def _render(self, result: Any, args: dict[str, Any]) -> str:
        return f"{UNTRUSTED_NOTE}\n\n{format_message(result, full=args.get('full_text'))}"


class ListThreadsArgs(BaseModel):
    inbox_id: str | None = Field(default=None, description=_INBOX_ID_DESC)
    limit: int | None = Field(default=None, ge=1, le=50, description="Default 10")


class ListThreadsTool(Send0Tool):
    name: str = "list_threads"
    description: str = "List conversations in an inbox, most recent activity first."
    args_schema: type[BaseModel] = ListThreadsArgs

    def _fetch(self, client: Any, args: dict[str, Any]) -> Any:
        return client.threads.list(self._inbox(args.get("inbox_id")), limit=args.get("limit") or 10)

    def _render(self, result: Any, args: dict[str, Any]) -> str:
        return "\n".join(format_thread_line(t) for t in result.data) if result.data else "No conversations yet."


class GetThreadArgs(BaseModel):
    inbox_id: str | None = Field(default=None, description=_INBOX_ID_DESC)
    thread_id: str = Field(description="Thread id (thr_…)")
    full_text: bool | None = None


class GetThreadTool(Send0Tool):
    name: str = "get_thread"
    description: str = (
        "Read a whole conversation, oldest message first. Bodies are the new text of each message, "
        "without repeated quoted history."
    )
    args_schema: type[BaseModel] = GetThreadArgs

    def _fetch(self, client: Any, args: dict[str, Any]) -> Any:
        return client.threads.get(self._inbox(args.get("inbox_id")), args["thread_id"])

    def _render(self, result: Any, args: dict[str, Any]) -> str:
        return format_thread(result, full=args.get("full_text"))


class SendEmailArgs(BaseModel):
    inbox_id: str | None = Field(default=None, description=_INBOX_ID_DESC)
    to: Recipients = Field(description=_RECIPIENTS_DESC)
    subject: str = Field(min_length=1)
    text: str = Field(min_length=1, description="Plain-text body")
    cc: Recipients | None = Field(default=None, description=_RECIPIENTS_DESC)


class SendEmailTool(Send0Tool):
    name: str = "send_email"
    description: str = (
        "Send a new email from an inbox, starting a new thread. To answer someone, use reply instead so it threads "
        "correctly. Free accounts may only email people who wrote to the inbox first."
    )
    args_schema: type[BaseModel] = SendEmailArgs
    sends: ClassVar[bool] = True

    def _fetch(self, client: Any, args: dict[str, Any]) -> Any:
        return client.messages.send(
            self._inbox(args.get("inbox_id")),
            to=args["to"],
            subject=args["subject"],
            text=args["text"],
            cc=args.get("cc") or None,
        )

    def _render(self, result: Any, args: dict[str, Any]) -> str:
        if is_draft(result):
            return format_draft(result)
        return f"Sent {result.id} to {', '.join(t.email for t in result.to)} (thread {result.thread_id})."


class ReplyArgs(BaseModel):
    message_id: str = Field(description="The message to reply to (msg_…)")
    text: str = Field(min_length=1, description="Plain-text body")
    reply_all: bool | None = Field(default=None, description="Also reply to everyone on To/Cc")


class ReplyTool(Send0Tool):
    name: str = "reply"
    description: str = "Reply to a message in the same thread (correct In-Reply-To/References and 'Re:' subject)."
    args_schema: type[BaseModel] = ReplyArgs
    sends: ClassVar[bool] = True

    def _fetch(self, client: Any, args: dict[str, Any]) -> Any:
        return client.messages.reply(args["message_id"], text=args["text"], reply_all=bool(args.get("reply_all")))

    def _render(self, result: Any, args: dict[str, Any]) -> str:
        if is_draft(result):
            return format_draft(result)
        return f"Replied with {result.id} to {', '.join(t.email for t in result.to)} in thread {result.thread_id}."


TOOL_CLASSES: tuple[type[Send0Tool], ...] = (
    CreateInboxTool,
    ListInboxesTool,
    WaitForEmailTool,
    SearchMessagesTool,
    GetMessageTool,
    ListThreadsTool,
    GetThreadTool,
    SendEmailTool,
    ReplyTool,
)
