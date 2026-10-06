from __future__ import annotations

from typing import AsyncIterator, Awaitable, Callable, Generic, Iterator, TypeVar

T = TypeVar("T")


class Page(Generic[T]):
    """One page of results. Iterating it walks every page, fetching as needed."""

    def __init__(self, data: list[T], next_cursor: str | None, fetch_next: Callable[[str], "Page[T]"]) -> None:
        self.data = data
        self.next_cursor = next_cursor
        self._fetch_next = fetch_next

    @property
    def has_more(self) -> bool:
        return self.next_cursor is not None

    def next_page(self) -> "Page[T] | None":
        return self._fetch_next(self.next_cursor) if self.next_cursor else None

    def __iter__(self) -> Iterator[T]:
        page: Page[T] | None = self
        while page is not None:
            yield from page.data
            page = page.next_page()

    def __repr__(self) -> str:
        return f"Page(len={len(self.data)}, has_more={self.has_more})"


class AsyncPage(Generic[T]):
    """Async version of :class:`Page`. Use ``async for`` to walk every page."""

    def __init__(self, data: list[T], next_cursor: str | None, fetch_next: Callable[[str], Awaitable["AsyncPage[T]"]]) -> None:
        self.data = data
        self.next_cursor = next_cursor
        self._fetch_next = fetch_next

    @property
    def has_more(self) -> bool:
        return self.next_cursor is not None

    async def next_page(self) -> "AsyncPage[T] | None":
        return await self._fetch_next(self.next_cursor) if self.next_cursor else None

    async def __aiter__(self) -> AsyncIterator[T]:
        page: AsyncPage[T] | None = self
        while page is not None:
            for item in page.data:
                yield item
            page = await page.next_page()
