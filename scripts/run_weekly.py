"""Max Mahon — weekly pipeline: fetch → analyze → done."""

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
    )
    if result.returncode != 0:
        print(f"\n{script} failed with code {result.returncode}")
        sys.exit(1)


def main():
    run("fetch_data.py")
    run("analyze.py")
    print("\n" + "=" * 50)
    print("Max Mahon weekly analysis complete!")
    print("=" * 50)


if __name__ == "__main__":
    main()
