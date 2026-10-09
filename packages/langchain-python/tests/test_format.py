from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Callable

import pytest
from send0 import Draft, Inbox, Message, Thread, ThreadWithMessages

from langchain_send0._format import (
    format_draft,
    format_inbox,
    format_message,
    format_message_line,
    format_thread,
    format_thread_line,
)

# Written from the TypeScript formatters in packages/agent-tools; the port must match them exactly.
FIXTURE = Path(__file__).resolve().parents[2] / "agent-tools" / "test" / "fixtures" / "format-cases.json"

FORMATTERS: dict[str, Callable[[Any, bool], str]] = {
    "format_message": lambda d, full: format_message(Message.model_validate(d), full=full),
    "format_message_line": lambda d, _: format_message_line(Message.model_validate(d)),
    "format_thread_line": lambda d, _: format_thread_line(Thread.model_validate(d)),
    "format_thread": lambda d, full: format_thread(ThreadWithMessages.model_validate(d), full=full),
    "format_inbox": lambda d, _: format_inbox(Inbox.model_validate(d)),
    "format_draft": lambda d, _: format_draft(Draft.model_validate(d)),
}

CASES: list[dict[str, Any]] = json.loads(FIXTURE.read_text(encoding="utf-8")) if FIXTURE.exists() else []


@pytest.mark.skipif(not CASES, reason="shared fixture not found (run from the send0 repo)")
@pytest.mark.parametrize("case", CASES, ids=[f"{i}-{c['fn']}" for i, c in enumerate(CASES)])
def test_matches_the_typescript_output(case: dict[str, Any]) -> None:
    assert FORMATTERS[case["fn"]](case["input"], bool(case.get("full"))) == case["output"]
