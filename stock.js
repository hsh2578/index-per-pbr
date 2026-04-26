const params = new URLSearchParams(location.search);
const code = (params.get('code') || '005930').toUpperCase();
const COLOR = '#2563eb';
const METRICS = [
  { key: 'per',        chartId: 'chart-per',   label: 'PER' },
  { key: 'pbr',        chartId: 'chart-pbr',   label: 'PBR' },
  { key: 'market_cap', chartId: 'chart-cap',   label: '시가총액' },
  { key: 'close',      chartId: 'chart-close', label: '종가' },
];

let dataset = null;

async function load() {
  try {
    const r = await fetch(`data/stocks/${code}.json?t=${Date.now()}`);
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    dataset = await r.json();
  } catch (e) {
    document.getElementById('stock-title').innerHTML =
      `❌ <code>data/stocks/${code}.json</code> 로드 실패: ${e.message}`;
    return;
  }
  document.getElementById('stock-title').textContent =
    `${dataset.name} (${dataset.ticker}) · ${dataset.market === 'KR' ? '한국' : '미국'}`;
  document.getElementById('updated').textContent =
    new Date(dataset.updated_at).toLocaleString('ko-KR');
  document.getElementById('summary-title').textContent = `${dataset.name} 통계`;
  if (dataset.note) document.getElementById('note').textContent = dataset.note;
  bindControls();
  render();
}

function bindControls() {
  document.querySelectorAll('input[type=checkbox]').forEach(cb =>
    cb.addEventListener('change', render));
  document.getElementById('opt-period').addEventListener('change', render);
}

function getPeriodCutoff() {
  const yrs = parseInt(document.getElementById('opt-period').value, 10);
  const d = new Date();
  d.setFullYear(d.getFullYear() - yrs);
  return d;
}

function filterByPeriod(metricKey) {
  const cutoff = getPeriodCutoff();
  const xs = [], ys = [];
  for (let i = 0; i < dataset.dates.length; i++) {
    const dt = new Date(dataset.dates[i]);
    if (dt < cutoff) continue;
    xs.push(dataset.dates[i]);
    ys.push(dataset[metricKey]?.[i] ?? null);
  }
  return { xs, ys };
}

function statBand(values) {
  const v = values.filter(x => x !== null && Number.isFinite(x));
  if (v.length < 2) return null;
  const mean = v.reduce((a, b) => a + b, 0) / v.length;
  const variance = v.reduce((a, b) => a + (b - mean) ** 2, 0) / v.length;
  const sd = Math.sqrt(variance);
  return { mean, sd, n: v.length, min: Math.min(...v), max: Math.max(...v) };
}

function lastNonNull(arr) {
  for (let i = arr.length - 1; i >= 0; i--) if (arr[i] !== null) return { idx: i, val: arr[i] };
  return null;
}

function percentileRank(values, target) {
  const v = values.filter(x => x !== null && Number.isFinite(x));
  if (!v.length) return null;
  return (v.filter(x => x <= target).length / v.length) * 100;
}

function hasAnyData(metricKey) {
  const arr = dataset?.[metricKey];
  return !!(arr && arr.some(v => v !== null && Number.isFinite(v)));
}

function updateCardVisibility() {
  for (const m of METRICS) {
    const card = document.querySelector(`.chart-card[data-metric="${m.key}"]`);
    if (!card) continue;
    card.style.display = hasAnyData(m.key) ? '' : 'none';
  }
  const cards = document.querySelectorAll('.chart-card');
  const visibleCount = [...cards].filter(c => c.style.display !== 'none').length;
  document.querySelector('.charts').classList.toggle('charts-single', visibleCount === 1);
}

function buildTraces(metricKey) {
  let { xs, ys } = filterByPeriod(metricKey);
  if (!ys.length || ys.every(v => v === null)) return [];

  const showBand = document.getElementById('opt-band').checked;
  const showMean = document.getElementById('opt-mean').checked;
  const useStat = !['close', 'market_cap'].includes(metricKey);
  const traces = [];
  const stat = statBand(ys);

  if (useStat && showBand && stat && stat.sd > 0) {
    traces.push({
      x: xs, y: xs.map(() => +(stat.mean + stat.sd).toFixed(2)),
      type: 'scatter', mode: 'lines',
      line: { width: 0, color: COLOR }, showlegend: false, hoverinfo: 'skip',
    });
    traces.push({
      x: xs, y: xs.map(() => +(stat.mean - stat.sd).toFixed(2)),
      type: 'scatter', mode: 'lines',
      line: { width: 0, color: COLOR },
      fill: 'tonexty', fillcolor: hexToRgba(COLOR, 0.10),
      showlegend: false, hoverinfo: 'skip',
    });
  }
  if (useStat && showMean && stat) {
    traces.push({
      x: [xs[0], xs[xs.length - 1]], y: [stat.mean, stat.mean],
      type: 'scatter', mode: 'lines',
      line: { dash: 'dash', width: 1, color: hexToRgba(COLOR, 0.55) },
      hoverinfo: 'skip', showlegend: false,
    });
  }

  traces.push({
    x: xs, y: ys, type: 'scatter', mode: 'lines',
    name: dataset.name,
    line: { color: COLOR, width: 2, shape: 'spline', smoothing: 0.3 },
    connectgaps: true,
    hovertemplate: '%{x|%Y-%m-%d}<br>%{y:,.2f}<extra>' + dataset.name + '</extra>',
  });

  const fwd = dataset.forward || {};
  const fwdMap = { per: fwd.per_forward, pbr: fwd.pbr_forward };
  const fwdVal = fwdMap[metricKey];
  if (fwdVal != null && Number.isFinite(fwdVal)) {
    traces.push({
      x: [xs[0], xs[xs.length - 1]], y: [fwdVal, fwdVal],
      type: 'scatter', mode: 'lines',
      line: { dash: 'dot', width: 2, color: '#dc2626' },
      name: `Forward ${metricKey.toUpperCase()} ${fwdVal.toFixed(2)} (${fwd.year_estimate || ''})`,
      hovertemplate: `Forward ${metricKey.toUpperCase()} ${fwdVal.toFixed(2)}<extra>${fwd.year_estimate || ''}</extra>`,
      showlegend: true,
    });
  }
  return traces;
}

function render() {
  if (!dataset) return;
  updateCardVisibility();
  for (const m of METRICS) {
    const traces = buildTraces(m.key);
    Plotly.react(m.chartId, traces, {
      margin: { l: 64, r: 16, t: 8, b: 36 },
      xaxis: { type: 'date', showgrid: false, color: '#6b7280' },
      yaxis: { gridcolor: '#eef2f7', color: '#6b7280' },
      paper_bgcolor: 'rgba(0,0,0,0)',
      plot_bgcolor: 'rgba(0,0,0,0)',
      hovermode: 'x unified',
      font: { family: 'inherit', size: 11 },
    }, { displayModeBar: false, responsive: true });
  }
  renderSummary();
}

function renderSummary() {
  const fmt = (v) => v == null || !Number.isFinite(v) ? '—'
    : (v >= 1000 ? v.toLocaleString('en', { maximumFractionDigits: 0 }) : v.toFixed(2));
  const blocks = [];
  const labelMap = {
    per: 'PER',
    pbr: 'PBR',
    market_cap: `시가총액 (${dataset.market_cap_unit || ''})`,
    close: `주가 (${dataset.price_unit || ''})`,
  };
  const fwd = dataset.forward || {};
  const fwdMap = { per: fwd.per_forward, pbr: fwd.pbr_forward };

  for (const m of ['per', 'pbr', 'market_cap', 'close']) {
    const { ys } = filterByPeriod(m);
    const stat = statBand(ys);
    const last = lastNonNull(ys);
    if (!last || !stat) {
      blocks.push(`<div class="stat-block"><div class="stat-label">${labelMap[m]}</div><div class="stat-val" style="color:#9ca3af">—</div></div>`);
      continue;
    }
    const z = stat.sd > 0 ? (last.val - stat.mean) / stat.sd : 0;
    const pct = percentileRank(ys, last.val);
    const zCls = z >= 0 ? 'z-pos' : 'z-neg';
    const sign = z >= 0 ? '+' : '';
    const fwdRow = (m === 'per' || m === 'pbr') && fwdMap[m] != null
      ? `<span>Forward (${fwd.year_estimate || ''})</span><span style="color:#dc2626;font-weight:600">${fmt(fwdMap[m])}</span>`
      : '';
    blocks.push(`
      <div class="stat-block">
        <div class="stat-label">${labelMap[m]}</div>
        <div class="stat-val">${fmt(last.val)}</div>
        <div class="stat-grid">
          <span>평균</span><span>${fmt(stat.mean)}</span>
          <span>z-score</span><span class="${zCls}">${sign}${z.toFixed(2)}σ</span>
          <span>최저</span><span>${fmt(stat.min)}</span>
          <span>최고</span><span>${fmt(stat.max)}</span>
          <span>백분위</span><span>${pct.toFixed(0)}%</span>
          ${fwdRow}
        </div>
      </div>`);
  }

  const cs = (dataset.consensus || {}).summary || {};
  const brokers = (dataset.consensus || {}).brokers || [];
  if (cs.broker_count || brokers.length) {
    const lastClose = lastNonNull(dataset.close)?.val;
    const tgt = cs.avg_target_price;
    const upside = (tgt && lastClose) ? ((tgt - lastClose) / lastClose * 100) : null;
    const upsideCls = upside == null ? '' : (upside >= 0 ? 'z-pos' : 'z-neg');
    const upsideStr = upside == null ? '—' : `${upside >= 0 ? '+' : ''}${upside.toFixed(1)}%`;
    blocks.push(`
      <div class="stat-block">
        <div class="stat-label">컨센서스 (${cs.broker_count || brokers.length}개 증권사)</div>
        <div class="stat-val">${fmt(tgt)}원</div>
        <div class="stat-grid">
          <span>현재가 대비</span><span class="${upsideCls}">${upsideStr}</span>
          <span>평균 Forward PER</span><span>${fmt(cs.avg_per_forward)}</span>
          <span>평균 Forward EPS</span><span>${fmt(cs.avg_eps_forward)}</span>
          <span>컨센서스 점수</span><span>${cs.consensus_score ?? '—'}</span>
        </div>
      </div>`);
  }

  document.getElementById('summary').innerHTML = blocks.join('');
}

function hexToRgba(hex, alpha) {
  const h = hex.replace('#', '');
  return `rgba(${parseInt(h.slice(0,2),16)},${parseInt(h.slice(2,4),16)},${parseInt(h.slice(4,6),16)},${alpha})`;
}

load();
