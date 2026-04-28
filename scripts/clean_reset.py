"""Clean reset: ลบ algo output + raw cache ทั้งหมด ก่อน scan รอบใหม่.
Usage:
  py projects/MaxMahon/scripts/clean_reset.py           # dry run
  py projects/MaxMahon/scripts/clean_reset.py --confirm # ลบจริง
"""
import sys
import shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"
REPORTS = ROOT / "reports"

KEEP_FILES = {"case_study_patterns.json", "exit_baselines.json",
              "hidden_value_holdings.json", "set_universe.json"}

FILE_TARGETS = [
    DATA / "history.json",
    DATA / "history.json.v1.bak",
    DATA / "analysis_cache.json",
    DATA / "niwes_diff_history.json",
    DATA / "niwes_diff_latest.json",
    DATA / "niwes_alert_sent.json",
    DATA / "niwes_news_seen.json",
]
GLOB_TARGETS = [
    (DATA, "screener_*.json"),
    (DATA, "snapshot_*.json"),
    (DATA, "niwes_news_*.json"),
    (DATA, "request_*.json"),
    (DATA, "monitor_log_*.log"),
    (REPORTS, "scan_*.md"),
]
FOLDER_TARGETS = [
    DATA / "screener_cache",
    DATA / "analysis_cache",
    DATA / "portfolio_opus_cache",
    DATA / "setsmart_cache",
    DATA / "price_cache",
    DATA / "price_history",
]

def collect():
    files = [f for f in FILE_TARGETS if f.exists()]
    for base, pat in GLOB_TARGETS:
        files.extend(sorted(base.glob(pat)))
    folders = [f for f in FOLDER_TARGETS if f.exists()]
    return files, folders

def main():
    confirm = "--confirm" in sys.argv
    files, folders = collect()
    print(f"Targets: {len(files)} files, {len(folders)} folders")
    for f in files:
        print(f"  FILE   {f.relative_to(ROOT)}")
    for d in folders:
        print(f"  FOLDER {d.relative_to(ROOT)}")
    if not confirm:
        print("\nDRY RUN — no changes. Use --confirm to delete.")
        return
    for f in files:
        f.unlink(missing_ok=True)
    for d in folders:
        shutil.rmtree(d, ignore_errors=True)
    for keep in KEEP_FILES:
        assert (DATA / keep).exists(), f"PROTECTED file missing: {keep}"
    print(f"\nDeleted {len(files)} files, {len(folders)} folders.")
    print("Reference files preserved:", ", ".join(sorted(KEEP_FILES)))

if __name__ == "__main__":
    main()
