"""한국 종목 일별 PER/PBR/시가총액/종가 → data/stocks/{code}.json"""
import json
import os
import sys
from datetime import datetime, timedelta
from pathlib import Path


def _load_env(env_path: Path) -> None:
    if not env_path.exists():
        return
    for line in env_path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, v = line.split("=", 1)
        k, v = k.strip(), v.strip().strip('"').strip("'")
        if k and v and k not in os.environ:
            os.environ[k] = v


_PROJECT_ROOT = Path(__file__).resolve().parent.parent
_load_env(_PROJECT_ROOT / ".env")

if not (os.environ.get("KRX_ID") and os.environ.get("KRX_PW")):
    sys.stderr.write("[ERROR] KRX_ID / KRX_PW 미설정. .env 확인.\n")
    sys.exit(2)

import pandas as pd
from pykrx import stock

sys.path.insert(0, str(Path(__file__).resolve().parent))
from naver_consensus import fetch_naver_data  # noqa: E402

try:
    import FinanceDataReader as fdr
    _HAS_FDR = True
except ImportError:
    _HAS_FDR = False

DATA_DIR = _PROJECT_ROOT / "data" / "stocks"
DATA_DIR.mkdir(parents=True, exist_ok=True)


def _to_list(s, ndigits=2):
    return [None if pd.isna(v) else round(float(v), ndigits) for v in s]


def _to_int_list(s):
    return [None if pd.isna(v) else int(round(float(v))) for v in s]


def fetch_kr_stock(code: str) -> dict:
    end_dt = datetime.now()
    start_dt = end_dt - timedelta(days=365 * 10 + 30)
    end, start = end_dt.strftime("%Y%m%d"), start_dt.strftime("%Y%m%d")

    try:
        name = stock.get_market_ticker_name(code)
    except Exception:
        name = code

    fund = stock.get_market_fundamental_by_date(start, end, code)
    cap = stock.get_market_cap_by_date(start, end, code)

    df = fund.join(cap[["시가총액", "상장주식수"]], how="inner").reset_index()
    date_col = df.columns[0]
    df["date_dt"] = pd.to_datetime(df[date_col])
    df["date"] = df["date_dt"].dt.strftime("%Y-%m-%d")
    df["market_cap_억원"] = df["시가총액"] / 100_000_000

    if _HAS_FDR:
        try:
            px = fdr.DataReader(code, start, end)
            if not px.empty and "Close" in px.columns:
                px = px["Close"].copy()
                px.index = pd.to_datetime(px.index)
                df = df.set_index("date_dt").join(
                    px.rename("close_adj"), how="left"
                ).reset_index().drop(columns=["date_dt"])
                df["종가"] = df["close_adj"]
            else:
                df["종가"] = df["시가총액"] / df["상장주식수"]
        except Exception:
            df["종가"] = df["시가총액"] / df["상장주식수"]
    else:
        df["종가"] = df["시가총액"] / df["상장주식수"]

    print("  네이버 Wisereport 컨센서스 ...", flush=True)
    naver = fetch_naver_data(code)

    return {
        "name": name,
        "ticker": code,
        "market": "KR",
        "frequency": "daily",
        "dates": df["date"].tolist(),
        "per": _to_list(df["PER"]),
        "pbr": _to_list(df["PBR"]),
        "div_yield": _to_list(df["DIV"]),
        "close": _to_int_list(df["종가"]),
        "market_cap": _to_int_list(df["market_cap_억원"]),
        "market_cap_unit": "억원",
        "price_unit": "원",
        "forward": naver.get("forward", {}),
        "consensus": naver.get("consensus", {"summary": {}, "brokers": []}),
        "updated_at": datetime.now().isoformat(timespec="seconds"),
    }


def main():
    if len(sys.argv) < 2:
        print("Usage: python fetch_stock_kr.py <code>", file=sys.stderr)
        sys.exit(1)
    code = sys.argv[1]
    print(f"[KR/{code}] fetching ...", flush=True)
    d = fetch_kr_stock(code)
    out = DATA_DIR / f"{code}.json"
    out.write_text(json.dumps(d, ensure_ascii=False), encoding="utf-8")
    print(f"  → {out.relative_to(_PROJECT_ROOT)} ({len(d['dates'])}건, {d['name']})")


if __name__ == "__main__":
    main()
