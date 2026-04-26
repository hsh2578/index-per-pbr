const KEYS = ['kospi', 'kosdaq', 'sp500', 'nasdaq'];
const COLORS = {
  kospi:     '#2563eb',
  kosdaq:    '#059669',
  sp500:     '#dc2626',
  nasdaq: '#7c3aed',
};
const METRICS = [
  { key: 'per',       chartId: 'chart-per',   label: 'PER' },
  { key: 'pbr',       chartId: 'chart-pbr',   label: 'PBR' },
  { key: 'div_yield', chartId: 'chart-div',   label: '배당수익률' },
  { key: 'close',     chartId: 'chart-close', label: '종가' },
];

const datasets = {};
let currentMode = 'compare';

async function load() {
  await Promise.all(KEYS.map(async (key) => {
    try {
      const r = await fetch(`data/${key}.json?t=${Date.now()}`);
      if (!r.ok) throw new Error(`${key} HTTP ${r.status}`);
      datasets[key] = await r.json();
    } catch (e) {
      console.warn(`[load] ${key} 실패:`, e.message);
      datasets[key] = null;
    }
  }));

  const validDates = Object.values(datasets)
    .filter(d => d?.updated_at)
    .map(d => new Date(d.updated_at).getTime());
  if (validDates.length) {
    document.getElementById('updated').textContent =
      new Date(Math.max(...validDates)).toLocaleString('ko-KR');
  }

  const notes = Object.values(datasets)
    .filter(d => d?.note)
    .map(d => `· ${d.name}: ${d.note}`);
  document.getElementById('note').innerHTML = notes.join('<br>');

  bindControls();
  render();
}

function bindControls() {
  document.querySelectorAll('.tab').forEach(btn => {
    btn.addEventListener('click', () => {
      currentMode = btn.dataset.mode;
      document.querySelectorAll('.tab').forEach(b => b.classList.toggle('is-active', b === btn));
      updateModePanel();
      render();
    });
  });
  document.querySelectorAll('input[type=checkbox]').forEach(cb => {
    cb.addEventListener('change', render);
  });
  document.getElementById('opt-period').addEventListener('change', render);
}

function updateModePanel() {
  const isCompare = currentMode === 'compare';
  document.getElementById('panel-compare').style.display = isCompare ? '' : 'none';
}

function getSelected() {
  if (currentMode !== 'compare') {
    return datasets[currentMode] ? [currentMode] : [];
  }
  return KEYS.filter(k =>
    document.querySelector(`#panel-compare input[data-key="${k}"]`)?.checked && datasets[k]
  );
}

function getPeriodCutoff() {
  const yrs = parseInt(document.getElementById('opt-period').value, 10);
  const d = new Date();
  d.setFullYear(d.getFullYear() - yrs);
  return d;
}

function filterByPeriod(d, metricKey) {
  const cutoff = getPeriodCutoff();
  const xs = [], ys = [];
  for (let i = 0; i < d.dates.length; i++) {
    const dt = new Date(d.dates[i]);
    if (dt < cutoff) continue;
    xs.push(d.dates[i]);
    ys.push(d[metricKey]?.[i] ?? null);
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

function percentileRank(values, target) {
  const v = values.filter(x => x !== null && Number.isFinite(x));
  if (!v.length) return null;
  const below = v.filter(x => x <= target).length;
  return (below / v.length) * 100;
}

function normalizeClose(ys) {
  let base = null;
  for (const y of ys) { if (y !== null && Number.isFinite(y)) { base = y; break; } }
  if (!base) return ys;
  return ys.map(y => y === null ? null : +(y / base * 100).toFixed(2));
}

function lastNonNull(arr) {
  for (let i = arr.length - 1; i >= 0; i--) if (arr[i] !== null) return { idx: i, val: arr[i] };
  return null;
}

function buildTraces(metricKey) {
  const selected = getSelected();
  const traces = [];
  const showBand = document.getElementById('opt-band').checked;
  const showMean = document.getElementById('opt-mean').checked;
  const norm     = metricKey === 'close' && document.getElementById('opt-norm').checked
                   && currentMode === 'compare';

  for (const key of selected) {
    const d = datasets[key];
    let { xs, ys } = filterByPeriod(d, metricKey);
    if (!ys.length || ys.every(v => v === null)) continue;
    if (norm) ys = normalizeClose(ys);

    const color = COLORS[key];
    const stat = statBand(ys);

    if (!norm && showBand && stat && stat.sd > 0 && metricKey !== 'close') {
      const upper = xs.map(() => +(stat.mean + stat.sd).toFixed(2));
      const lower = xs.map(() => +(stat.mean - stat.sd).toFixed(2));
      traces.push({
        x: xs, y: upper, type: 'scatter', mode: 'lines',
        line: { width: 0, color },
        showlegend: false, hoverinfo: 'skip',
      });
      traces.push({
        x: xs, y: lower, type: 'scatter', mode: 'lines',
        line: { width: 0, color },
        fill: 'tonexty', fillcolor: hexToRgba(color, 0.10),
        showlegend: false, hoverinfo: 'skip',
      });
    }
    if (!norm && showMean && stat && metricKey !== 'close') {
      traces.push({
        x: [xs[0], xs[xs.length - 1]],
        y: [stat.mean, stat.mean],
        type: 'scatter', mode: 'lines',
        line: { dash: 'dash', width: 1, color: hexToRgba(color, 0.55) },
        name: `${d.name} 평균 ${stat.mean.toFixed(2)}`,
        hoverinfo: 'name',
        showlegend: false,
      });
    }

    traces.push({
      x: xs, y: ys, type: 'scatter', mode: 'lines',
      name: d.name,
      line: { color, width: 2, shape: 'spline', smoothing: 0.3 },
      connectgaps: true,
      hovertemplate: '%{x|%Y-%m-%d}<br>%{y:.2f}<extra>' + d.name + '</extra>',
    });
  }
  return traces;
}

function hasAnyData(metricKey) {
  const selected = getSelected();
  for (const key of selected) {
    const arr = datasets[key]?.[metricKey];
    if (arr && arr.some(v => v !== null && Number.isFinite(v))) return true;
  }
  return false;
}

function updateCardVisibility() {
  for (const m of METRICS) {
    const card = document.querySelector(`.chart-card[data-metric="${m.key}"]`);
    if (!card) continue;
    const visible = currentMode === 'compare' || hasAnyData(m.key);
    card.style.display = visible ? '' : 'none';
  }
  const cards = document.querySelectorAll('.chart-card');
  const visibleCount = [...cards].filter(c => c.style.display !== 'none').length;
  document.querySelector('.charts').classList.toggle('charts-single', visibleCount === 1);
}

function render() {
  updateCardVisibility();
  for (const m of METRICS) {
    const traces = buildTraces(m.key);
    const layout = {
      margin: { l: 56, r: 16, t: 8, b: 36 },
      xaxis: { type: 'date', showgrid: false, color: '#6b7280' },
      yaxis: { gridcolor: '#eef2f7', color: '#6b7280', zerolinecolor: '#e5e7eb' },
      paper_bgcolor: 'rgba(0,0,0,0)',
      plot_bgcolor: 'rgba(0,0,0,0)',
      legend: { orientation: 'h', y: -0.18, x: 0, font: { size: 11 } },
      hovermode: 'x unified',
      font: { family: 'inherit', size: 11 },
    };
    Plotly.react(m.chartId, traces, layout, {
      displayModeBar: false,
      responsive: true,
    });
  }
  renderSummary();
}

function renderSummary() {
  const summaryEl = document.getElementById('summary');
  const titleEl = document.getElementById('summary-title');

  if (currentMode === 'compare') {
    titleEl.textContent = '현재 PER 요약';
    summaryEl.innerHTML = renderCompareSummary();
  } else {
    const d = datasets[currentMode];
    if (!d) {
      titleEl.textContent = '요약';
      summaryEl.innerHTML = '<p style="color:#9ca3af;font-size:11px">데이터 없음</p>';
      return;
    }
    titleEl.textContent = `${d.name} 통계`;
    summaryEl.innerHTML = renderSingleSummary(d);
  }
}

function renderCompareSummary() {
  const selected = getSelected();
  const rows = [];
  for (const key of selected) {
    const d = datasets[key];
    const { ys } = filterByPeriod(d, 'per');
    const stat = statBand(ys);
    const last = lastNonNull(ys);
    if (!last || !stat) {
      rows.push(`
        <div class="row">
          <span class="name">${d.name}</span>
          <span class="val" style="color:#9ca3af">데이터 없음</span>
        </div>`);
      continue;
    }
    const z = stat.sd > 0 ? (last.val - stat.mean) / stat.sd : 0;
    const zCls = z >= 0 ? 'z-pos' : 'z-neg';
    const sign = z >= 0 ? '+' : '';
    rows.push(`
      <div class="row">
        <span class="name">${d.name}</span>
        <span class="val">
          ${last.val.toFixed(2)}
          <div class="sub ${zCls}">평균 ${stat.mean.toFixed(2)} · ${sign}${z.toFixed(2)}σ</div>
        </span>
      </div>`);
  }
  return rows.join('') || '<p style="color:#9ca3af;font-size:11px">선택된 지수 없음</p>';
}

function renderSingleSummary(d) {
  const blocks = [];
  const labelMap = { per: 'PER', pbr: 'PBR', div_yield: '배당수익률 (%)' };
  for (const m of ['per', 'pbr', 'div_yield']) {
    const { ys } = filterByPeriod(d, m);
    const stat = statBand(ys);
    const last = lastNonNull(ys);
    if (!last || !stat) {
      blocks.push(`
        <div class="stat-block">
          <div class="stat-label">${labelMap[m]}</div>
          <div class="stat-val" style="color:#9ca3af">—</div>
        </div>`);
      continue;
    }
    const z = stat.sd > 0 ? (last.val - stat.mean) / stat.sd : 0;
    const pct = percentileRank(ys, last.val);
    const zCls = z >= 0 ? 'z-pos' : 'z-neg';
    const sign = z >= 0 ? '+' : '';
    blocks.push(`
      <div class="stat-block">
        <div class="stat-label">${labelMap[m]}</div>
        <div class="stat-val">${last.val.toFixed(2)}</div>
        <div class="stat-grid">
          <span>평균</span><span>${stat.mean.toFixed(2)}</span>
          <span>z-score</span><span class="${zCls}">${sign}${z.toFixed(2)}σ</span>
          <span>최저</span><span>${stat.min.toFixed(2)}</span>
          <span>최고</span><span>${stat.max.toFixed(2)}</span>
          <span>백분위</span><span>${pct.toFixed(0)}%</span>
        </div>
      </div>`);
  }
  return blocks.join('');
}

function hexToRgba(hex, alpha) {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

load();
