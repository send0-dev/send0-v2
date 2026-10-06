from __future__ import annotations

import json
import shutil
import subprocess
from pathlib import Path
from typing import Iterator

import pytest

REPO = Path(__file__).resolve().parents[3]


@pytest.fixture(scope="session")
def server() -> Iterator[dict[str, str]]:
    """The real API (apps/api) on Node with in-memory Postgres. Yields {"url", "key"}."""
    if not shutil.which("pnpm"):
        pytest.skip("pnpm not available: end-to-end tests need the API test server")
    proc = subprocess.Popen(
        ["pnpm", "--filter", "@send0/api", "exec", "tsx", "scripts/test-server.ts", "0"],
        cwd=REPO,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
    )
    assert proc.stdout is not None
    line = proc.stdout.readline()
    if not line.startswith("{"):
        proc.kill()
        raise RuntimeError(f"test server failed to start: {line}{proc.stderr.read() if proc.stderr else ''}")
    info = json.loads(line)
    try:
        yield info
    finally:
        proc.terminate()
        proc.wait(timeout=10)


@pytest.fixture
def deliver(server: dict[str, str]):
    """Simulate an inbound email: deliver(to, fixture_name) → message id."""
    import httpx

    def _deliver(to: str, fixture: str) -> str:
        r = httpx.post(f"{server['url']}/__test/deliver", json={"to": to, "fixture": fixture})
        r.raise_for_status()
        return str(r.json()["message_id"])

    return _deliver
