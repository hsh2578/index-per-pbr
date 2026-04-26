"""미국 종목 일별 가격/시총 + 분기 EPS/BPS로 계산한 일별 PER/PBR → data/stocks/{ticker}.json

분기 재무제표 데이터는 yfinance 무료 한계상 약 5년치만 제공되므로
PER/PBR 시계열은 5년 정도, 가격/시총은 10년치로 표시됩니다.
"""
import json
import sys
from datetime import datetime, timedelta
from pathlib import Path

import pandas as pd
import yfinance as yf

DATA_DIR = Path(__file__).resolve().parent.parent / "data" / "stocks"
DATA_DIR.mkdir(parents=True, exist_ok=True)


def _to_list(s, ndigits=2):
    return [None if pd.isna(v) else round(float(v), ndigits) for v in s]


def _to_int_list(s):
    return [None if pd.isna(v) else int(round(float(v))) for v in s]


def _drop_tz(idx):
    if hasattr(idx, "tz") and idx.tz is not None:
        return idx.tz_localize(None)
    return idx


def _quarterly_series(t, key_candidates, mode):
    """t.quarterly_income_stmt 또는 t.quarterly_balance_sheet에서 첫 매칭 행 반환."""
    try:
        df = t.quarterly_income_stmt if mode == "income" else t.quarterly_balance_sheet
    except Exception:
        return None
    if df is None or df.empty:
        return None
    for k in key_candidates:
        if k in df.index:
            s = df.loc[k].dropna()
            if not s.empty:
                s.index = _drop_tz(pd.to_datetime(s.index))
                return s.sort_index()
    return None


def fetch_us_stock(ticker: str) -> dict:
    t = yf.Ticker(ticker)

    end_dt = datetime.now()
    start_dt = end_dt - timedelta(days=365 * 10 + 30)

    px = t.history(start=start_dt, end=end_dt, interval="1d", auto_adjust=False)
    if isinstance(px.columns, pd.MultiIndex):
        px.columns = [c[0] for c in px.columns]
    px.index = _drop_tz(pd.to_datetime(px.index))

    if px.empty:
        raise RuntimeError(f"{ticker}: 가격 데이터를 받지 못했습니다.")

    shares_daily = None
    try:
        sh = t.get_shares_full(start=start_dt, end=end_dt)
        if sh is not None and not sh.empty:
            sh.index = _drop_tz(pd.to_datetime(sh.index))
            shares_daily = sh.reindex(px.index, method="ffill")
    except Exception:
        pass

    eps_q = _quarterly_series(t, ["Diluted EPS", "Basic EPS"], "income")
    eq_q = _quarterly_series(t, ["Stockholders Equity", "Total Stockholder Equity",
                                  "Common Stock Equity"], "balance")

    df = pd.DataFrame(index=px.index)
    df["close"] = px["Close"]

    if shares_daily is not None:
        df["shares"] = shares_daily
        df["market_cap"] = df["close"] * df["shares"]

    if eps_q is not None and len(eps_q) >= 4:
        ttm = eps_q.rolling(4).sum().dropna()
        df["ttm_eps"] = ttm.reindex(df.index, method="ffill")
        df["per"] = df["close"] / df["ttm_eps"].where(df["ttm_eps"] > 0)

    if eq_q is not None and shares_daily is not None:
        eq_daily = eq_q.reindex(df.index, method="ffill")
        df["bps"] = eq_daily / df["shares"]
        df["pbr"] = df["close"] / df["bps"].where(df["bps"] > 0)

    info = {}
    try:
        info = t.info or {}
    except Exception:
        pass
    name = info.get("longName") or info.get("shortName") or ticker

    n = len(df)
    return {
        "name": name,
        "ticker": ticker,
        "market": "US",
        "frequency": "daily",
        "dates": df.index.strftime("%Y-%m-%d").tolist(),
        "per": _to_list(df["per"]) if "per" in df else [None] * n,
        "pbr": _to_list(df["pbr"]) if "pbr" in df else [None] * n,
        "div_yield": [None] * n,
        "close": _to_list(df["close"]),
        "market_cap": _to_int_list(df["market_cap"] / 1e8) if "market_cap" in df else [None] * n,
        "market_cap_unit": "억USD",
        "price_unit": "USD",
        "note": "PER/PBR 시계열은 yfinance 분기 재무제표(약 5년) 기반 직접 계산.",
        "updated_at": datetime.now().isoformat(timespec="seconds"),
    }


def main():
    if len(sys.argv) < 2:
        print("Usage: python fetch_stock_us.py <ticker>", file=sys.stderr)
        sys.exit(1)
    ticker = sys.argv[1].upper()
    print(f"[US/{ticker}] fetching ...", flush=True)
    d = fetch_us_stock(ticker)
    out = DATA_DIR / f"{ticker}.json"
    out.write_text(json.dumps(d, ensure_ascii=False), encoding="utf-8")
    print(f"  → {out.relative_to(Path(__file__).resolve().parent.parent)} "
          f"({len(d['dates'])}건, {d['name']})")


if __name__ == "__main__":
    main()
