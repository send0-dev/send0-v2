"""Generates src/send0/_async_client.py from _client.py ("unasync"), so both clients always match.

    uv run python scripts/gen_async.py
"""
from __future__ import annotations

import re
from pathlib import Path

SRC = Path(__file__).resolve().parent.parent / "src" / "send0"
KEEP_SYNC = {"__init__", "verify", "_given", "_send_result", "__bool__", "__repr__"}


def transform(code: str) -> str:
    code = code.replace("from typing import Any, Iterator,", "from typing import Any, AsyncIterator,")
    code = code.replace("import json\nimport time\n", "import asyncio\nimport json\nimport time\n")
    code = code.replace("from ._pagination import Page", "from ._pagination import AsyncPage")
    code = code.replace("from ._sse import parse_sse", "from ._sse import aparse_sse")
    code = code.replace("httpx.Client", "httpx.AsyncClient")
    code = re.sub(r"\bPage\[", "AsyncPage[", code)
    code = re.sub(r"return Page\(", "return AsyncPage(", code)
    code = code.replace("class _Http:", "class _AsyncHttp:").replace("_Http", "_AsyncHttp")
    code = code.replace("time.sleep(", "await asyncio.sleep(")

    # Every method becomes async except a few pure helpers.
    def asyncify(m: re.Match[str]) -> str:
        indent, name = m.group(1), m.group(2)
        return m.group(0) if name in KEEP_SYNC else f"{indent}async def {name}("

    code = re.sub(r"^(\s*)def (\w+)\(", asyncify, code, flags=re.M)

    # Await I/O. Calls ending in .json() need parentheses around the awaited call.
    code = re.sub(r"self\._http\.request\(([^()]*)\)\.json\(\)", r"(await self._http.request(\1)).json()", code)
    code = re.sub(r"self\.request\(([^()]*)\)\.json\(\)", r"(await self.request(\1)).json()", code)
    code = re.sub(r"(?<![.(])(?<!await )self\._http\.(request|get|page)\(", r"await self._http.\1(", code)
    code = re.sub(r"(?<!await )\bself\.client\.request\(", "await self.client.request(", code)
    code = code.replace('return load(params.get("cursor"))', 'return await load(params.get("cursor"))')

    # Streaming
    code = code.replace("with self._http.client.stream(", "async with self._http.client.stream(")
    code = code.replace("for msg in parse_sse(res.iter_lines()):", "async for msg in aparse_sse(res.aiter_lines()):")
    code = code.replace("res.read()", "await res.aread()")
    code = code.replace("-> Iterator[Event]:", "-> AsyncIterator[Event]:")

    # The client class
    code = code.replace("class Send0:", "class AsyncSend0:")
    code = code.replace('"""The send0 client.', '"""The async send0 client. Same API as :class:`Send0`, with ``await``.')
    code = code.replace(">>> send0 = Send0()", ">>> send0 = AsyncSend0()")
    code = re.sub(r">>> (inbox|msg) = send0\.", r">>> \1 = await send0.", code)
    code = code.replace("async def close(self) -> None:\n        self._http.client.close()", "async def aclose(self) -> None:\n        await self._http.client.aclose()")
    code = code.replace('async def __enter__(self) -> "Send0":', 'async def __aenter__(self) -> "AsyncSend0":')
    code = code.replace("async def __exit__(self, *exc: object) -> None:\n        self.close()", "async def __aexit__(self, *exc: object) -> None:\n        await self.aclose()")
    return "# Generated from _client.py by scripts/gen_async.py. Do not edit.\n" + code


if __name__ == "__main__":
    out = transform((SRC / "_client.py").read_text())
    (SRC / "_async_client.py").write_text(out)
    print(f"wrote {SRC / '_async_client.py'}")
