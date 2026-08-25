const COINS = {
  bitcoin: { symbol: 'BTC', name: 'Bitcoin', color: '#F7931A' },
  ethereum: { symbol: 'ETH', name: 'Ethereum', color: '#8FA2F5' },
  solana: { symbol: 'SOL', name: 'Solana', color: '#14F195' },
  binancecoin: { symbol: 'BNB', name: 'BNB', color: '#F3BA2F' },
  // Cardano's brand blue is #0033AD, which is close to unreadable on a
  // dark background. Lightened to keep the legend legible.
  cardano: { symbol: 'ADA', name: 'Cardano', color: '#4C8DFF' },
};

const REFRESH_MS = 60_000;

const els = {
  status: document.getElementById('status'),
  statusText: document.getElementById('status-text'),
  cards: document.getElementById('cards'),
  chart: document.getElementById('chart'),
  legend: document.getElementById('legend'),
  ranges: document.querySelectorAll('.ranges button'),
};

let rangeHours = 24;
// Kept so the chart can be redrawn on resize without refetching.
let lastSeries = new Map();

/* ---------- formatting ---------- */

const usd = (value, digits) =>
  new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value);

function formatPrice(value) {
  if (value === null || value === undefined) return '—';
  // Sub-dollar coins need more decimals to say anything at all.
  if (value >= 1000) return usd(value, 0);
  if (value >= 1) return usd(value, 2);
  return usd(value, 4);
}

function formatCompact(value) {
  if (value === null || value === undefined) return '—';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    notation: 'compact',
    maximumFractionDigits: 2,
  }).format(value);
}

function formatPercent(value) {
  if (value === null || value === undefined) return '—';
  return `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`;
}

function direction(value) {
  if (value === null || value === undefined) return 'flat';
  if (value > 0.005) return 'up';
  if (value < -0.005) return 'down';
  return 'flat';
}

const ARROWS = {
  up: 'M8 3l5 7H3z',
  down: 'M8 13L3 6h10z',
  flat: 'M3 7h10v2H3z',
};

function arrow(dir) {
  return `<svg viewBox="0 0 16 16" aria-hidden="true"><path d="${ARROWS[dir]}" fill="currentColor"/></svg>`;
}

/* ---------- rendering ---------- */

/**
 * Applies colours that vary per coin.
 *
 * These cannot be written as style attributes in the markup above: the Content
 * Security Policy sets `style-src 'self'`, which blocks inline style
 * attributes. Setting the same properties through the CSSOM is not inline
 * style and is allowed, so the policy stays strict without losing the colours.
 */
function paintColours(root) {
  for (const card of root.querySelectorAll('[data-coin-color]')) {
    card.style.setProperty('--coin', card.dataset.coinColor);
  }
  for (const swatch of root.querySelectorAll('[data-swatch-color]')) {
    swatch.style.setProperty('background', swatch.dataset.swatchColor);
  }
}


function setStatus(state, text) {
  els.status.dataset.state = state;
  els.statusText.textContent = text;
}

function renderCards(coins, series) {
  if (coins.length === 0) {
    els.cards.innerHTML =
      '<li class="note">No observations recorded yet. The first collection runs within ten minutes.</li>';
    return;
  }

  els.cards.innerHTML = coins
    .map((row) => {
      const meta = COINS[row.coin_id] ?? {
        symbol: row.coin_id.toUpperCase(),
        name: row.coin_id,
        color: '#8B98A9',
      };
      const dir = direction(row.change_24h_pct);

      return `
        <li class="card" data-coin-color="${meta.color}">
          <div class="card-head">
            <span class="symbol">${meta.symbol}</span>
            <span class="name">${meta.name}</span>
          </div>
          <p class="price">${formatPrice(row.price_usd)}</p>
          <p class="change" data-dir="${dir}">
            ${arrow(dir)}
            <span>${formatPercent(row.change_24h_pct)}</span>
            <span class="name">24h</span>
          </p>
          ${sparkline(series.get(row.coin_id) ?? [], meta.color)}
          <dl class="stats">
            <div><dt>Market cap</dt><dd>${formatCompact(row.market_cap_usd)}</dd></div>
            <div><dt>Volume 24h</dt><dd>${formatCompact(row.volume_24h_usd)}</dd></div>
          </dl>
        </li>`;
    })
    .join('');

  paintColours(els.cards);
}

/* Each sparkline is scaled to its own coin, so it shows that coin's shape
   rather than its size relative to Bitcoin. */
function sparkline(points, color) {
  if (points.length < 2) return '<div class="spark"></div>';

  const values = points.map((p) => p.price_usd);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const step = 100 / (points.length - 1);

  const path = values
    .map((v, i) => `${i === 0 ? 'M' : 'L'}${(i * step).toFixed(2)},${(28 - ((v - min) / span) * 26).toFixed(2)}`)
    .join(' ');

  return `<svg class="spark" viewBox="0 0 100 30" preserveAspectRatio="none" aria-hidden="true">
      <path d="${path}" fill="none" stroke="${color}" stroke-width="1.5"
            vector-effect="non-scaling-stroke" stroke-linejoin="round"/>
    </svg>`;
}

/* Plots percentage change from each coin's first observation in the
   window, which is the only way five coins spanning four orders of
   magnitude can share one axis and still say anything. */
function renderChart(series) {
  lastSeries = series;

  // One SVG unit per CSS pixel. Scaling a fixed viewBox to fit instead
  // would squash the axis labels horizontally on narrow screens.
  const box = els.chart.getBoundingClientRect();
  const width = Math.max(300, Math.round(box.width) || 1000);
  const height = Math.round(box.height) || 300;
  const pad = { top: 14, right: 54, bottom: 24, left: 10 };

  const tracks = [];
  for (const [coinId, points] of series) {
    if (points.length < 2) continue;
    const base = points[0].price_usd;
    if (!base) continue;
    tracks.push({
      coinId,
      color: COINS[coinId]?.color ?? '#8B98A9',
      values: points.map((p) => ({
        ts: p.ts,
        pct: ((p.price_usd - base) / base) * 100,
      })),
    });
  }

  if (tracks.length === 0) {
    els.chart.innerHTML = `<text x="50%" y="50%" text-anchor="middle" fill="#8B98A9" font-size="13" font-family="Inter, sans-serif">Not enough history yet</text>`;
    els.chart.setAttribute('viewBox', `0 0 ${width} ${height}`);
    els.legend.innerHTML = '';
    return;
  }

  const allPct = tracks.flatMap((t) => t.values.map((v) => v.pct));
  const allTs = tracks.flatMap((t) => t.values.map((v) => v.ts));
  const minTs = Math.min(...allTs);
  const maxTs = Math.max(...allTs);
  // Always include zero, so the baseline the percentages are measured
  // from is visible on the chart.
  const rawMin = Math.min(0, ...allPct);
  const rawMax = Math.max(0, ...allPct);
  const headroom = (rawMax - rawMin) * 0.1 || 1;
  const minPct = rawMin - headroom;
  const maxPct = rawMax + headroom;

  const x = (ts) =>
    pad.left +
    ((ts - minTs) / (maxTs - minTs || 1)) *
      (width - pad.left - pad.right);
  const y = (pct) =>
    pad.top +
    (1 - (pct - minPct) / (maxPct - minPct || 1)) *
      (height - pad.top - pad.bottom);

  const gridLines = [rawMax, (rawMax + rawMin) / 2, rawMin]
    .map(
      (value) => `
        <line x1="${pad.left}" y1="${y(value)}" x2="${width - pad.right}" y2="${y(value)}"
              stroke="#1E2A38" stroke-width="1"/>
        <text x="${width - pad.right + 8}" y="${y(value) + 4}" fill="#8B98A9"
              font-size="11" font-family="'JetBrains Mono', monospace">${formatPercent(value)}</text>`,
    )
    .join('');

  const zeroLine = `<line x1="${pad.left}" y1="${y(0)}" x2="${width - pad.right}" y2="${y(0)}"
        stroke="#2B3A4D" stroke-width="1" stroke-dasharray="3 3"/>`;

  const paths = tracks
    .map((track) => {
      const d = track.values
        .map(
          (v, i) =>
            `${i === 0 ? 'M' : 'L'}${x(v.ts).toFixed(2)},${y(v.pct).toFixed(2)}`,
        )
        .join(' ');
      return `<path d="${d}" fill="none" stroke="${track.color}" stroke-width="1.75"
               stroke-linejoin="round" stroke-linecap="round"
               vector-effect="non-scaling-stroke"/>`;
    })
    .join('');

  // A window wider than half a day needs the date as well. Two bare
  // clock times a day apart read as though the axis runs backwards.
  const spansDays = maxTs - minTs > 12 * 3600;
  const timeLabels = [minTs, maxTs]
    .map((ts, i) => {
      const date = new Date(ts * 1000);
      const clock = date.toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
      });
      const label = spansDays
        ? `${date.toLocaleDateString([], { month: 'short', day: 'numeric' })} ${clock}`
        : clock;
      return `<text x="${i === 0 ? pad.left : width - pad.right}" y="${height - 6}"
                text-anchor="${i === 0 ? 'start' : 'end'}" fill="#8B98A9"
                font-size="11" font-family="'JetBrains Mono', monospace">${label}</text>`;
    })
    .join('');

  els.chart.setAttribute('viewBox', `0 0 ${width} ${height}`);
  els.chart.innerHTML = gridLines + zeroLine + paths + timeLabels;

  els.legend.innerHTML = tracks
    .map((track) => {
      const last = track.values.at(-1).pct;
      const meta = COINS[track.coinId];
      return `<li>
          <span class="swatch" data-swatch-color="${track.color}"></span>
          <span>${meta?.symbol ?? track.coinId}</span>
          <span class="legend-change" data-dir="${last >= 0 ? 'up' : 'down'}">${formatPercent(last)}</span>
        </li>`;
    })
    .join('');

  paintColours(els.legend);
}

/* ---------- data ---------- */

function groupByCoin(points) {
  const series = new Map();
  for (const point of points) {
    if (!series.has(point.coin_id)) series.set(point.coin_id, []);
    series.get(point.coin_id).push(point);
  }
  return series;
}

async function getJSON(path) {
  const response = await fetch(path, { headers: { accept: 'application/json' } });
  if (!response.ok) throw new Error(`${path} responded ${response.status}`);
  return response.json();
}

async function refresh() {
  try {
    const [latest, history] = await Promise.all([
      getJSON('/api/latest'),
      getJSON(`/api/history?hours=${rangeHours}`),
    ]);

    const series = groupByCoin(history.points ?? []);
    renderCards(latest.coins ?? [], series);
    renderChart(series);

    if (latest.updatedAt) {
      const when = new Date(latest.updatedAt * 1000);
      setStatus('live', `Updated ${when.toLocaleTimeString()}`);
    } else {
      setStatus('loading', 'Awaiting first collection');
    }
  } catch (error) {
    console.error(error);
    setStatus('error', 'Connection lost — retrying');
  }
}

for (const button of els.ranges) {
  button.addEventListener('click', () => {
    rangeHours = Number(button.dataset.hours);
    for (const other of els.ranges) {
      other.setAttribute(
        'aria-pressed',
        String(other === button),
      );
    }
    refresh();
  });
}

// Polling stops while the tab is hidden and resumes on return, so a
// forgotten background tab does not keep calling the API all day.
let timer = null;

function start() {
  stop();
  timer = setInterval(refresh, REFRESH_MS);
}

function stop() {
  if (timer !== null) clearInterval(timer);
  timer = null;
}

// The chart is drawn at the element's pixel width, so a resize needs a
// redraw. Debounced, because resize fires continuously while dragging.
let resizeTimer = null;
window.addEventListener('resize', () => {
  if (resizeTimer !== null) clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => renderChart(lastSeries), 150);
});

document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    stop();
  } else {
    refresh();
    start();
  }
});

refresh();
start();
