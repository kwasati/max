"""Max Mahon — weekly pipeline: fetch → analyze → done.
Optional: --discover flag to also run stock screening + discovery.
"""

import argparse
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SCRIPTS = ROOT / "scripts"


def run(script: str):
    print(f"\n{'='*50}")
    print(f"Running {script}...")
    print(f"{'='*50}\n")
    result = subprocess.run(
        [sys.executable, str(SCRIPTS / script)],
        cwd=str(ROOT),
        timeout=600,
    )
    if result.returncode != 0:
        print(f"\n{script} failed with code {result.returncode}")
        sys.exit(1)


def main():
    parser = argparse.ArgumentParser(description="Max Mahon weekly pipeline")
    parser.add_argument("--discover", action="store_true", help="Also run stock screener + discovery")
    args = parser.parse_args()

    run("fetch_data.py")
    run("analyze.py")

    if args.discover:
        run("screen_stocks.py")
        run("discover.py")

    print(f"\n{'='*50}")
    mode = "weekly + discovery" if args.discover else "weekly analysis"
    print(f"Max Mahon {mode} complete!")
    print(f"{'='*50}")


if __name__ == "__main__":
    main()
