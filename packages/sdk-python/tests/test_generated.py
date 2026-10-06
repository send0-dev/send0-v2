import importlib.util
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def test_async_client_is_generated_from_the_sync_client():
    spec = importlib.util.spec_from_file_location("gen_async", ROOT / "scripts" / "gen_async.py")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    expected = mod.transform((ROOT / "src/send0/_client.py").read_text())
    assert (ROOT / "src/send0/_async_client.py").read_text() == expected, "run: uv run python scripts/gen_async.py"
