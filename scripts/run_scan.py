"""Max Mahon — scan pipeline runner (fetch + screen + analyze in one scan)."""
import subprocess
import sys
from datetime import datetime, timedelta
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SCRIPTS = ROOT / "scripts"
UNIVERSE_FILE = ROOT / "data" / "set_universe.json"


def run(script: str):
    print(f"\n{'=' * 50}\nRunning {script}...\n{'=' * 50}\n")
    result = subprocess.run(
        [sys.executable, str(SCRIPTS / script)],
        cwd=str(ROOT),
        timeout=1800,
    )
    if result.returncode != 0:
        print(f"\n{script} failed with code {result.returncode}")
        sys.exit(1)


def universe_stale() -> bool:
    """Return True if set_universe.json missing or older than 7 days."""
    if not UNIVERSE_FILE.exists():
        return True
    age = datetime.now() - datetime.fromtimestamp(UNIVERSE_FILE.stat().st_mtime)
    return age > timedelta(days=7)


def main():
    run("fetch_data.py")
    if universe_stale():
        print("[run_scan] universe stale — refreshing")
        run("update_universe.py")
    else:
        print("[run_scan] universe fresh — skipping refresh")
    run("screen_stocks.py")
    run("scan.py")
    print(f"\n{'=' * 50}\nScan pipeline complete!\n{'=' * 50}")


if __name__ == "__main__":
    main()
