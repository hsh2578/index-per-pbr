# 지수 PER · PBR 대시보드

KOSPI / KOSDAQ / S&P 500 / NASDAQ 100 의 PER · PBR · 배당수익률 · 지수 종가를 10년 시계열로 보여주는 정적 대시보드.

## 설치

```bash
pip install -r requirements.txt
```

### KRX 계정 등록 (KOSPI/KOSDAQ 데이터에 필요)

pykrx 1.2.x 부터 KRX 정보데이터시스템 인증이 필요합니다.

1. [https://data.krx.co.kr/](https://data.krx.co.kr/) 에서 무료 가입
2. 프로젝트 루트의 `.env.example` 을 `.env` 로 복사
3. `.env` 안에 본인 KRX_ID / KRX_PW 입력

`.env` 파일은 `.gitignore` 에 등록되어 있어 GitHub 에 올라가지 않습니다.

## 사용 순서

### 1) 데이터 갱신

```bash
python scripts/update_all.py
```

`data/kospi.json`, `data/kosdaq.json`, `data/sp500.json`, `data/nasdaq100.json` 4개 파일이 생성/갱신됩니다. 첫 실행 시 KRX 호출 때문에 1~3분 정도 소요될 수 있습니다.

### 2) 로컬 미리보기

```bash
python -m http.server 8000
```

브라우저에서 [http://localhost:8000](http://localhost:8000) 접속.

> `index.html`을 더블클릭하면 `file://` 프로토콜이라 fetch가 막힙니다. 반드시 위 명령으로 로컬 서버를 띄워야 합니다.

## 화면

- **사이드바**: 지수 선택 (다중), 평균±1σ 밴드 토글, 기간 선택 (1Y/3Y/5Y/10Y), 종가 정규화 토글
- **메인 4차트**: PER / PBR / 배당수익률 / 종가 — 선택된 지수가 모두 같은 차트에 겹쳐 그려짐
- **요약 박스**: 현재 PER + 기간 평균 + z-score (±1σ 기준)

## 데이터 출처와 한계

| 지수 | PER/PBR/배당 | 가격 | 입도 |
|---|---|---|---|
| KOSPI | pykrx (KRX 공식) | pykrx | 일별 |
| KOSDAQ | pykrx (KRX 공식) | pykrx | 일별 |
| S&P 500 | multpl.com | yfinance | 월별 |
| NASDAQ 100 | yfinance 현재값만 | yfinance | 월별 |

NASDAQ 100 의 historical PER/PBR 시계열은 무료 출처에 안정적으로 존재하지 않아 현재 시점 1개 값만 표시합니다. 향후 macrotrends 캡처 또는 100개 종목 합성 계산으로 추가 가능.

## GitHub Pages 배포

`data/*.json` 까지 commit 후 GitHub Pages 활성화 (Source: `/` root branch). HTML/JS/JSON 만 정적 서빙되므로 별도 빌드 단계 없음. 자동 갱신은 `.github/workflows/update.yml` 추가 시 가능 (별도 작업).

## 향후

- 개별 종목 검색 (Claude Skill, on-demand 캡처)
- 해외 개별 종목 (macrotrends + stockanalysis 캡처)
- NASDAQ 100 PER 시계열 데이터 보강
