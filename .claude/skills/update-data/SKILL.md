---
name: update-data
description: 지수 4종(KOSPI/KOSDAQ/S&P 500/NASDAQ) + 종목 데이터를 증분 갱신하고 GitHub에 푸시하는 스킬. 트리거 — "지수 데이터 업데이트", "최신 데이터로 갱신", "데이터 새로고침", "/update" 같은 자연어. 기본 모드는 증분 갱신 (마지막 날짜 + 최근 30일 재fetch). 사용자가 "처음부터 다시" 또는 "풀 갱신" 명시 시 --full 사용. 갱신 후 사용자에게 push 여부 확인 받고 git push.
---

# 데이터 갱신 스킬

지수 대시보드 + 종목 페이지에 쓰이는 모든 JSON 데이터를 한 번에 최신화한다.

## 1. 증분 갱신 실행 (기본)

```bash
python scripts/update_all.py
```

지수만 갱신 (KR 2개 + 미국 2개). 한국 일별 데이터는 마지막 날짜 - 30일부터 fetch (정정 반영). 미국 월별은 항상 풀 fetch (어차피 빠름). 출력 예:

```
[kospi/INCR] 20260327~20260427 fetching...
  → kospi.json (2475건, +4 added, last 2026-04-27)
[kosdaq/INCR] ...
[sp500] ...
[nasdaq] ...
```

## 2. 종목까지 갱신

```bash
python scripts/update_all.py --with-stocks
```

`data/stocks/*.json` 에 있는 모든 종목 (예: 005930) 도 갱신. 종목당 fetch + render PNG 생성.

## 3. 풀 재수집 (드물게 사용)

```bash
python scripts/update_all.py --full --with-stocks
```

증분 무시하고 10년치 다시 받음. 사용자가 "처음부터", "풀 갱신" 명시할 때만.

## 4. 결과 보고

각 데이터의 변화 요약을 사용자에게 표로 보고:

| 데이터 | 이전 행 수 | 신규 행 수 | 추가 일수 | 마지막 날짜 |
|---|---|---|---|---|
| KOSPI | 2,471 | 2,475 | +4 | 2026-04-27 |
| ... | ... | ... | ... | ... |

## 5. git commit + push (사용자 확인)

사용자에게 "push할까요?" 묻고 yes 면:

```bash
git add data/ static_charts/
git commit -m "data: $(date +%Y-%m-%d) 증분 갱신"
git push
```

## 6. 라이브 사이트 안내

GitHub Pages 1~2분 후 반영:
- 지수: https://hsh2578.github.io/index-per-pbr/
- 종목: https://hsh2578.github.io/index-per-pbr/stock.html?code={code}

## 주의사항

- **KRX 인증**: `.env` 의 `KRX_ID`/`KRX_PW` 필요. 미설정이면 KR 갱신 실패하지만 미국은 동작.
- **최근 30일 재fetch**: 한국 데이터는 KRX가 사후 정정하는 경우가 있어 마지막 30일은 항상 다시 받음 (덮어쓰기).
- **미국 데이터 (월별)**: multpl/yfinance 풀 fetch가 빠르므로 증분 적용 안 함.
- **신규 종목 추가**: `python scripts/fetch_stock_kr.py {6자리}` 한 번 실행하면 그 종목이 `data/stocks/` 에 생기고, 이후 update_all `--with-stocks` 실행 시 자동 포함됨.
