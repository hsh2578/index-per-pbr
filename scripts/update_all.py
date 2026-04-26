"""4개 지수 데이터 일괄 갱신: KOSPI, KOSDAQ, S&P 500, NASDAQ 100"""
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent


def run(name: str) -> bool:
    print(f"\n=== {name} ===")
    r = subprocess.run([sys.executable, str(ROOT / name)])
    if r.returncode != 0:
        print(f"[FAIL] {name}", file=sys.stderr)
        return False
    return True


def main():
    ok = True
    ok &= run("fetch_kr.py")
    ok &= run("fetch_us.py")
    print("\n" + ("=" * 40))
    print("DONE" if ok else "PARTIAL FAIL", flush=True)
    sys.exit(0 if ok else 1)


if __name__ == "__main__":
    main()
