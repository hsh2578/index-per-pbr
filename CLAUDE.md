# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project overview

GitHub Pages 정적 대시보드. **KOSPI / KOSDAQ / S&P 500 / NASDAQ 종합** 4지수의 10년 PER·PBR·배당 시계열 + **한국 종목별 PER/PBR/시가총액 + Forward PER + 26개 증권사 컨센서스** 페이지를 제공한다. 라이브: <https://hsh2578.github.io/index-per-pbr/>

데이터 갱신 흐름: Python 스크립트로 JSON 생성 → git push → GitHub Pages가 정적 서빙. **빌드 단계 없음** (HTML+JS+JSON 만 commit).

## Common commands

```bash
# 지수 4종 증분 갱신 (KR 일별 + US 월별)
python scripts/update_all.py

# 지수 + data/stocks/*.json 의 모든 종목까지
python scripts/update_all.py --with-stocks

# 풀 재수집 (증분 무시, 10년치 다시)
python scripts/update_all.py --full --with-stocks

# 신규 종목 추가 / 단일 종목 갱신 + PNG 생성
python scripts/fetch_stock_kr.py 005930   # 삼성전자
python scripts/render_stock.py 005930

# 디버깅용 — 네이버 Forward + 컨센서스 dump
python scripts/naver_consensus.py 005930

# 로컬 미리보기 (반드시 HTTP 서버 — file:// 은 fetch 차단됨)
python -m http.server 8765
#  http://localhost:8765/                        (지수 대시보드)
#  http://localhost:8765/stock.html?code=005930  (종목 페이지)
```

## Architecture

### 정적 호스팅 모델

데이터 **생산층(Python)** 과 **표시층(HTML+JS+JSON)** 이 분리돼 있다. Python 은 로컬에서만 실행되고, 결과 JSON 을 commit 해서 GitHub Pages 로 서빙. 사용자 브라우저는 Python 없이 정적 파일만 읽는다.

```
[로컬]                    [Git]               [GitHub Pages]
fetch_*.py → data/*.json → commit → push → 정적 서빙
                                              ↓
                                          index.html / stock.html
                                              ↓ fetch
                                          data/*.json
```

### 데이터 출처 매핑

각 출처의 입도/인증/한계가 달라서 새 컬럼·지표 추가 시 반드시 고려:

| 데이터 | 출처 | 입도 | 인증 / 한계 |
|---|---|---|---|
| KOSPI/KOSDAQ 지수 PER/PBR/배당 | pykrx (KRX 공식) | 일별 10년+ | `.env` 의 `KRX_ID`/`KRX_PW` 필요 |
| 한국 종목 일별 PER/PBR | pykrx | 일별 10년+ | 동일 |
| 한국 종목 종가 | FinanceDataReader | 일별 (수정종가) | 인증 불필요 |
| 한국 종목 Forward PER · 컨센서스 | 네이버 Wisereport `c1010001.aspx` | 현재 시점 1점 | 비공식 크롤링 (User-Agent 필요), 차단 시 빈 dict |
| S&P 500 PER/PBR/배당 | multpl.com | 월별 | 비공식 크롤링 |
| S&P 500 / NASDAQ 가격 | yfinance | 월별 | 불필요 |
| NASDAQ 종합 PER/PBR | (무료 출처 부재) | — | UI 에서 카드 자동 숨김 |

### 증분 갱신 (`scripts/incremental.py`)

KR 일별 데이터(지수, 종목)는 매번 10년치를 받지 않고 **마지막 날짜 - 30일부터 fetch + 병합**한다. 30일 재fetch 의도는 KRX 의 사후 정정을 자동 반영하기 위함.

- `read_existing(path)` — 기존 JSON 읽기
- `get_incremental_start(...)` — 다음 fetch 시작일 (기존 마지막 - 30일, 없으면 -10년)
- `merge_timeseries(old, new, fields)` — dates 인덱스로 병합. **새 값 우선 = 정정 반영**
- `--full` 플래그 — 증분 무시하고 풀 재수집

미국 월별은 multpl/yfinance 풀 fetch 가 빠르므로 증분 미적용.

### 종목 페이지 (`stock.html` + `stock.js`)

URL 파라미터 `?code={6자리}` 로 어떤 종목을 표시할지 결정. 데이터는 `data/stocks/{code}.json` 에서 fetch. 지수 대시보드(`index.html` + `app.js`)와 디자인 컴포넌트 공유(사이드바·차트 카드·통계 박스·색상) — `style.css` 한 파일에 통합.

PER/PBR 차트는 **TTM 라인 + ±1σ 밴드 + 평균선** 위에 네이버 컨센서스에서 받은 **Forward PER 빨간 점선** 을 가로선으로 그리고, 가로선 끝에 inline annotation `Fwd 5.97 (2026E)`. 데이터 없는 metric(예: NASDAQ 의 PER) 은 카드 자체가 자동 숨김(`updateCardVisibility()`).

### Claude Skills

`.claude/skills/` 안에 두 개. 새 세션에서도 그대로 동작 (워크플로가 SKILL.md 에 박제됨).

- **`stock-pe/SKILL.md`** — "삼성전자 보여줘", "/stock 005380" 같은 자연어 트리거. 워크플로: 종목코드 식별 → `fetch_stock_kr.py {code}` → `render_stock.py {code}` → PNG 표시 + URL 안내.
- **`update-data/SKILL.md`** — "데이터 업데이트해줘" 등으로 발동. `update_all.py` → diff 보고 → 사용자 확인 후 git push.

## 작업 시 주의사항

- **pykrx 1.2.x 의 KRX 인증**: import 시점에 `KRX_ID`/`KRX_PW` 환경변수를 읽어 자동 로그인. fetch 스크립트들은 `.env` 자동 로드 → pykrx import 순서. 미설정 시 `sys.exit(2)` 로 중단.
- **Windows + Python 3.14 한글 인코딩**: pykrx 내부 한글 식별자가 cp949 로 변환되며 깨질 수 있음. 파일 read/write 는 항상 `encoding="utf-8"` 명시.
- **`scripts/fetch_stock_us.py` 는 현재 미사용**: yfinance `shares_full()` 한계로 시총/PBR 결측 발생. stockanalysis.com 스크래핑으로 보강 후 재활성 예정. SKILL.md 에서도 미국 종목은 안내만 출력.
- **적자 종목 (예: CJ ENM 035760)**: KRX 가 PER 을 0 으로 표기 → 통계가 왜곡됨. 변환 단계에서 0/음수 → null 로 처리하면 차트가 끊기고 통계에서 자동 제외됨 (후속 fix 검토 항목).
- **캐시 버스터**: `index.html`/`stock.html` 의 `<link>`/`<script>` 에 `?v=N` 쿼리. JS·CSS 변경 시 N 을 증가시켜야 사용자 브라우저가 옛 파일을 캐시하지 않고 새로 로드.
- **이전 프로젝트의 패턴 재사용**: `scripts/naver_consensus.py` 는 `vibecoding/주식 ai 리서치 리포트 에이전트/scripts/naver_finance.py` 의 핵심부 포팅. 추가 데이터(주주, 신용등급, 분기 재무비율 등)가 필요하면 그쪽 코드 참고.
