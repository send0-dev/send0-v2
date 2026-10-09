"""send0 tools for LangChain: give any agent an email inbox. https://send0.dev/docs/integrations/langchain-python"""

from __future__ import annotations

from typing import Any, Sequence

from langchain_core.tools import BaseTool, BaseToolkit
from pydantic import ConfigDict
from send0 import AsyncSend0, Send0

from ._format import UNTRUSTED_NOTE
from ._tools import (
    TOOL_CLASSES,
    CreateInboxTool,
    GetMessageTool,
    GetThreadTool,
    ListInboxesTool,
    ListThreadsTool,
    ReplyTool,
    SearchMessagesTool,
    Send0Tool,
    SendEmailTool,
    WaitForEmailTool,
)

__version__ = "0.2.0"

TOOL_NAMES: tuple[str, ...] = tuple(str(cls.model_fields["name"].default) for cls in TOOL_CLASSES)


class Send0Toolkit(BaseToolkit):
    """The nine send0 tools, with sync and async support.

    >>> from langchain_send0 import Send0Toolkit
    >>> tools = Send0Toolkit().get_tools()  # reads SEND0_API_KEY

    Pass ``client`` (and ``async_client``) to reuse configured send0 clients, ``inbox_id`` for a
    default inbox, and ``include`` or ``exclude`` to pick tools by name. API errors come back to the
    model as text (``send0 error <code>: <message>``) so it can recover.
    """

    model_config = ConfigDict(arbitrary_types_allowed=True)

    client: Send0 | None = None
    async_client: AsyncSend0 | None = None
    inbox_id: str | None = None
    include: list[str] | None = None
    exclude: list[str] | None = None

    def __init__(
        self,
        client: Send0 | None = None,
        api_key: str | None = None,
        inbox_id: str | None = None,
        include: Sequence[str] | None = None,
        exclude: Sequence[str] | None = None,
        *,
        async_client: AsyncSend0 | None = None,
        base_url: str | None = None,
        **kwargs: Any,
    ) -> None:
        for name in [*(include or []), *(exclude or [])]:
            if name not in TOOL_NAMES:
                raise ValueError(f'Unknown send0 tool "{name}". Known: {", ".join(TOOL_NAMES)}.')
        if client is None and async_client is None:
            client = Send0(api_key, base_url=base_url) if base_url else Send0(api_key)
            async_client = AsyncSend0(api_key, base_url=base_url) if base_url else AsyncSend0(api_key)
        super().__init__(
            client=client,
            async_client=async_client,
            inbox_id=inbox_id,
            include=list(include) if include is not None else None,
            exclude=list(exclude) if exclude is not None else None,
            **kwargs,
        )

    def get_tools(self) -> list[BaseTool]:
        tools: list[BaseTool] = []
        for cls in TOOL_CLASSES:
            name = cls.model_fields["name"].default
            if (self.include is None or name in self.include) and name not in (self.exclude or []):
                tools.append(
                    cls.model_validate({"client": self.client, "async_client": self.async_client, "default_inbox_id": self.inbox_id})
                )
        return tools


__all__ = [
    "Send0Toolkit",
    "Send0Tool",
    "TOOL_NAMES",
    "UNTRUSTED_NOTE",
    "CreateInboxTool",
    "ListInboxesTool",
    "WaitForEmailTool",
    "SearchMessagesTool",
    "GetMessageTool",
    "ListThreadsTool",
    "GetThreadTool",
    "SendEmailTool",
    "ReplyTool",
    "__version__",
]
