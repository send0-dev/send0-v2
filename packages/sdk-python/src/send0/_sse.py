from __future__ import annotations

from dataclasses import dataclass
from typing import AsyncIterator, Iterator


@dataclass
class SseMessage:
    data: str
    id: str | None = None
    event: str | None = None


class _Parser:
    def __init__(self) -> None:
        self.data: list[str] = []
        self.id: str | None = None
        self.event: str | None = None

    def feed(self, line: str) -> SseMessage | None:
        line = line.rstrip("\r")
        if line == "":
            if not self.data:
                self.id = self.event = None
                return None
            msg = SseMessage(data="\n".join(self.data), id=self.id, event=self.event)
            self.data, self.id, self.event = [], None, None
            return msg
        if line.startswith(":"):
            return None
        field, _, value = line.partition(":")
        value = value[1:] if value.startswith(" ") else value
        if field == "data":
            self.data.append(value)
        elif field == "id":
            self.id = value
        elif field == "event":
            self.event = value
        return None


def parse_sse(lines: Iterator[str]) -> Iterator[SseMessage]:
    p = _Parser()
    for line in lines:
        msg = p.feed(line)
        if msg:
            yield msg


async def aparse_sse(lines: AsyncIterator[str]) -> AsyncIterator[SseMessage]:
    p = _Parser()
    async for line in lines:
        msg = p.feed(line)
        if msg:
            yield msg
