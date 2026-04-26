---
name: stock-pe
description: 한국 종목명/코드를 받아 10년 PER/PBR/시가총액/주가 시계열 + Forward PER (네이버 컨센서스) + 26개 증권사 목표가를 종합한 차트와 통계를 제공하는 스킬. 트리거 — "삼성전자 PER", "005930 보여줘", "/stock 카카오", "현대차 컨센서스" 같은 자연어. 종목 식별이 모호하면 (예: "삼성") 사용자에게 명확화 질문. 미국 종목은 stockanalysis.com 보강 후 별도 추가 예정 (현재는 한국만).
---

# 종목 PER · PBR 시계열 스킬

사용자가 종목을 입력하면 10년 PER · PBR · 시가총액 · 주가 시계열을 받아오고 두 가지 형태로 결과를 제공한다:

1. **PNG 캡처** — 4분할 차트 한 장. Read 도구로 채팅에 표시
2. **인터랙티브 페이지** — `http://localhost:8765/stock.html?code={code}` URL 안내

## 워크플로

### 1. 종목 식별

| 입력 패턴 | 처리 |
|---|---|
| 한글 회사명 (예: "삼성전자") | pykrx의 `stock.get_market_ticker_list()` 와 `get_market_ticker_name()` 으로 매칭. 부분 일치가 여러 개면 사용자에게 확인 |
| 6자리 숫자 (예: "005930") | KR 종목코드로 직접 사용 |
| 모호한 입력 (예: "삼성") | 사용자에게 어떤 회사인지 명확화 질문 |
| 미국 ticker (예: "UNH") | "현재는 한국 종목만 지원합니다. stockanalysis.com 데이터 연동 후 미국 추가 예정" 안내 |

### 2. 데이터 수집

```
python scripts/fetch_stock_kr.py {code}
```

→ `data/stocks/{code}.json` 생성. 다음 데이터 모두 포함:
- 일별 PER · PBR · 배당수익률 · 시가총액 (pykrx, 10년)
- 일별 종가 (FDR 수정종가)
- **Forward PER · PBR · EPS · BPS** (네이버 Wisereport, 다음 회계연도 컨센서스)
- **26개 증권사 목표가 + 평균 Forward PER** (네이버 Wisereport)

### 3. PNG 생성

```
python scripts/render_stock.py {code}
```

→ `static_charts/{code}.png` (4분할 차트, PER/PBR엔 Forward 빨간 점선 포함)

### 4. 결과 출력

1. Read 도구로 `static_charts/{code}.png` 채팅에 표시
2. 핵심 지표 요약: 현재 PER, Forward PER, 평균 목표가, 26개 증권사 컨센서스
3. 인터랙티브 페이지 URL: `http://localhost:8765/stock.html?code={code}`

### 5. 캐시 정책

`data/stocks/{code}.json`의 `updated_at`이 24시간 이내면 데이터 수집 생략, PNG/페이지만 갱신.

## 주의사항

- **KRX 인증**: `.env`의 `KRX_ID`/`KRX_PW` 필요. 미설정 시 사용자에게 안내.
- **네이버 Wisereport**: 비공식 크롤링. 차단 시 forward/consensus 가 빈 dict 로 반환되지만 나머지 데이터는 정상.
- **미국 종목**: 현재 미지원. `scripts/fetch_stock_us.py`는 코드만 보존된 상태이고, stockanalysis.com 보강 적용 후 SKILL.md 업데이트 예정.
- **로컬 서버**: 인터랙티브 페이지는 `python -m http.server 8765` 로컬 서버 필요. GitHub Pages 배포 후엔 `https://hsh2578.github.io/index-per-pbr/stock.html?code={code}` 로도 접근 가능.
