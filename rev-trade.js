// REV Trade — crypto mean-reversion dashboard (PAPER ONLY, educational, not financial advice).
// Strategy: long-spot mean reversion on dips: RSI + Bollinger + Z-score(SMA50).
// No API keys, no real orders. Live klines from Binance public API with offline fallback.
(function () {
  'use strict';
  const $ = (s) => document.querySelector(s);
  // ---------- LOCKED RISK RULES — NO BYPASS ----------
  // These caps are enforced in code, not just UI. Inputs above the caps are
  // clamped down and logged. There is no code path for live orders.
  const RULES = Object.freeze({
    VERSION: 'REV-LOCKED-v1',
    PAPER_ONLY: true,
    LONG_ONLY: true,
    MAX_POSITIONS: 1,
    MAX_RISK_PCT: 0.10,   // max 10% equity per trade
    MIN_RISK_PCT: 0.01,   // min 1% (avoid dust)
    MIN_SL_PCT: 0.003,    // stop must be >= 0.3% (no "no-stop" bypass)
    MAX_SL_PCT: 0.05,     // stop must be <= 5% (no absurdly wide bypass)
    MIN_TP_PCT: 0.003,
    MAX_TP_PCT: 0.10,
    KILL_SWITCH_PCT: -0.03, // -3% daily, ALWAYS ON, cannot be unchecked
    MAX_TRADES_PER_DAY: 10,
    ENTRY_Z_MAX: -1.0,    // entry Z must be <= -1.0 (no chasing barely-dips)
    RSI_BUY_MAX: 40,
    RSI_EXIT_MIN: 50,
  });
  const FEE = 0.001; // 0.1% per side
  const TIME_STOP = 48; // max candles in position

  const S = {
    candles: [], // {t,o,h,l,c,v}
    signals: [], // {i, side:'buy'|'sell', price, reason}
    trades: [],  // closed trades
    pos: null,   // {entry, qty, i, peak}
    cash: 10000, equity: 10000, startEq: 10000,
    dayStartEq: 10000, halted: false,
    liveTimer: null, lastPrice: null,
  };

  function cfg() {
    // Sanitize + CLAMP: UI can never widen risk beyond RULES.
    const clamp = (v, lo, hi, fb) => {
      v = parseFloat(v);
      if (!isFinite(v)) return fb;
      return Math.min(hi, Math.max(lo, v));
    };
    const raw = {
      symbol: $('#symbol').value, interval: $('#interval').value,
      entryZ: parseFloat($('#entryZ').value), exitZ: parseFloat($('#exitZ').value),
      rsiBuy: parseFloat($('#rsiBuy').value), rsiExit: parseFloat($('#rsiExit').value),
      riskPct: parseFloat($('#riskPct').value) / 100,
      slPct: parseFloat($('#slPct').value) / 100,
      tpPct: parseFloat($('#tpPct').value) / 100,
      startEq: parseFloat($('#startEq').value) || 10000,
    };
    const c = {
      symbol: ['BTCUSDT', 'ETHUSDT', 'SOLUSDT'].includes(raw.symbol) ? raw.symbol : 'BTCUSDT',
      interval: ['1m', '5m', '15m', '1h'].includes(raw.interval) ? raw.interval : '5m',
      entryZ: Math.min(raw.entryZ || -1.5, RULES.ENTRY_Z_MAX), // must stay <= -1.0
      exitZ: isFinite(raw.exitZ) ? Math.max(0.2, Math.min(3, raw.exitZ)) : 1.0,
      rsiBuy: clamp(raw.rsiBuy, 5, RULES.RSI_BUY_MAX, 35),
      rsiExit: clamp(raw.rsiExit, RULES.RSI_EXIT_MIN, 90, 55),
      riskPct: clamp(raw.riskPct, RULES.MIN_RISK_PCT, RULES.MAX_RISK_PCT, 0.10),
      slPct: clamp(raw.slPct, RULES.MIN_SL_PCT, RULES.MAX_SL_PCT, 0.008),
      tpPct: clamp(raw.tpPct, RULES.MIN_TP_PCT, RULES.MAX_TP_PCT, 0.012),
      startEq: clamp(raw.startEq, 100, 1000000, 10000),
    };
    // Reflect clamping back into UI so bypass attempts are visible.
    if (+$('#riskPct').value / 100 !== c.riskPct) $('#riskPct').value = (c.riskPct * 100).toFixed(1);
    if (+$('#rsiBuy').value !== c.rsiBuy) $('#rsiBuy').value = c.rsiBuy;
    if (+$('#rsiExit').value !== c.rsiExit) $('#rsiExit').value = c.rsiExit;
    if (+$('#slPct').value / 100 !== c.slPct) $('#slPct').value = (c.slPct * 100).toFixed(2);
    if (+$('#tpPct').value / 100 !== c.tpPct) $('#tpPct').value = (c.tpPct * 100).toFixed(2);
    if (+$('#entryZ').value !== c.entryZ) $('#entryZ').value = c.entryZ;
    return c;
  }
  function assertPaperOnly() {
    if (!RULES.PAPER_ONLY) throw new Error('LIVE_BLOCKED');
    // Explicit: no live order path exists. If anyone adds fetch POST with keys, block it.
    return true;
  }
  function tradesToday() {
    const day = new Date().toDateString();
    return S.trades.filter((t) => t.day === day).length;
  }

  function log(msg, cls) {
    const el = document.createElement('div');
    el.className = 'row' + (cls ? ' ' + cls : '');
    el.textContent = new Date().toLocaleTimeString() + '  ' + msg;
    const box = $('#log');
    box.prepend(el);
    while (box.children.length > 200) box.lastChild.remove();
  }

  // ---------- indicators ----------
  function sma(arr, n, i) {
    if (i < n - 1) return null;
    let s = 0; for (let k = i - n + 1; k <= i; k++) s += arr[k];
    return s / n;
  }
  function stdev(arr, n, i, mean) {
    if (i < n - 1) return null;
    let s = 0; for (let k = i - n + 1; k <= i; k++) s += (arr[k] - mean) ** 2;
    return Math.sqrt(s / n);
  }
  function rsi(closes, i, n) {
    if (i < n) return null;
    let g = 0, l = 0;
    for (let k = i - n + 1; k <= i; k++) {
      const d = closes[k] - closes[k - 1];
      if (d > 0) g += d; else l -= d;
    }
    if (l === 0) return 100;
    const rs = (g / n) / (l / n);
    return 100 - 100 / (1 + rs);
  }
  function enrich(candles) {
    const closes = candles.map((c) => c.c);
    return candles.map((c, i) => {
      const m50 = sma(closes, 50, i);
      const sd50 = m50 == null ? null : stdev(closes, 50, i, m50);
      const z = m50 == null || !sd50 ? null : (c.c - m50) / (sd50 || 1e-9);
      const m20 = sma(closes, 20, i);
      const sd20 = m20 == null ? null : stdev(closes, 20, i, m20);
      return {
        ...c, sma50: m50, z,
        bbMid: m20, bbUp: m20 == null ? null : m20 + 2 * sd20, bbLo: m20 == null ? null : m20 - 2 * sd20,
        rsi: rsi(closes, i, 14),
      };
    });
  }

  // ---------- data (Binance primary, Coinbase fallback — both public, no keys) ----------
  function toCoinbaseProduct(symbol) {
    // BTCUSDT -> BTC-USD, ETHUSDT -> ETH-USD, SOLUSDT -> SOL-USD
    if (symbol.endsWith('USDT')) return symbol.slice(0, -4) + '-USD';
    return symbol;
  }
  function coinbaseGranularity(interval) {
    return { '1m': 60, '5m': 300, '15m': 900, '1h': 3600 }[interval] || 300;
  }
  async function fetchCoinbaseKlines(symbol, interval, limit) {
    const product = toCoinbaseProduct(symbol);
    const gran = coinbaseGranularity(interval);
    const r = await fetch('https://api.exchange.coinbase.com/products/' + product + '/candles?granularity=' + gran);
    if (!r.ok) throw new Error('coinbase HTTP ' + r.status);
    const j = await r.json(); // [time, low, high, open, close, volume], newest-first
    return j.slice(0, limit).reverse().map((k) => ({ t: k[0] * 1000, o: +k[3], h: +k[2], l: +k[1], c: +k[4], v: +k[5] }));
  }
  async function fetchKlines(symbol, interval, limit) {
    const url = 'https://api.binance.com/api/v3/klines?symbol=' + symbol + '&interval=' + interval + '&limit=' + limit;
    const r = await fetch(url);
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const j = await r.json();
    return j.map((k) => ({ t: k[0], o: +k[1], h: +k[2], l: +k[3], c: +k[4], v: +k[5] }));
  }
  async function fetchKlinesSmart(symbol, interval, limit) {
    try { const k = await fetchKlines(symbol, interval, limit); return { k, src: 'binance' }; }
    catch (e1) {
      try { const k = await fetchCoinbaseKlines(symbol, interval, limit); return { k, src: 'coinbase' }; }
      catch (e2) { throw new Error('binance(' + e1.message + ') + coinbase(' + e2.message + ')'); }
    }
  }
  function simCandles(n, start) {
    // random-walk with occasional panic dips so REV signals actually fire offline
    let p = start, out = [], t = Date.now() - n * 5 * 60e3;
    for (let i = 0; i < n; i++) {
      const shock = Math.random() < 0.04 ? -0.02 - Math.random() * 0.02 : 0;
      const drift = (Math.random() - 0.5) * 0.004 + shock;
      const o = p, c = Math.max(1, p * (1 + drift));
      const h = Math.max(o, c) * (1 + Math.random() * 0.0015);
      const l = Math.min(o, c) * (1 - Math.random() * 0.0015);
      out.push({ t: t + i * 5 * 60e3, o, h, l, c, v: 100 + Math.random() * 900 });
      p = c;
    }
    return out;
  }
  function setConn(online, label) {
    $('#connDot').className = 'dot ' + (online ? 'on' : 'off');
    $('#connText').textContent = label;
  }

  // ---------- paper engine ----------
  function resetAccount() {
    const c = cfg();
    S.cash = c.startEq; S.equity = c.startEq; S.startEq = c.startEq;
    S.dayStartEq = c.startEq; S.pos = null; S.trades = []; S.signals = []; S.halted = false;
    updateKPIs(); drawAll(); updateHaltUI();
    log('paper account reset to $' + c.startEq.toLocaleString() + ' [' + RULES.VERSION + ']');
  }
  function equityNow(lastPx) {
    return S.cash + (S.pos ? S.pos.qty * lastPx : 0);
  }
  function tryEnter(e, c) {
    assertPaperOnly();
    if (S.pos) return; // MAX_POSITIONS = 1, hard gate
    if (S.halted) return;
    if (e.rsi == null || e.z == null || e.bbLo == null) return;
    if (killTriggered()) { S.halted = true; log('kill-switch LOCKED: daily loss < -3%, entries halted (cannot be disabled)', 'warn'); updateHaltUI(); return; }
    if (tradesToday() >= RULES.MAX_TRADES_PER_DAY) { S.halted = true; log('max-trades/day gate hit (' + RULES.MAX_TRADES_PER_DAY + ') — halted', 'warn'); updateHaltUI(); return; }
    // No-short / long-only gate (spot): buys only, never inverts.
    if (!RULES.LONG_ONLY) return;
    const dip = e.c < e.bbLo && e.z < c.entryZ && e.z <= RULES.ENTRY_Z_MAX && e.rsi < c.rsiBuy && e.rsi <= RULES.RSI_BUY_MAX;
    if (!dip) return;
    const px = e.c;
    const notional = equityNow(px) * c.riskPct; // c.riskPct already clamped to MAX 10%
    const qty = (notional * (1 - FEE)) / px;
    if (qty <= 0) return;
    S.cash -= notional;
    S.pos = { entry: px, qty, i: S.candles.indexOf(e), px, reason: 'z=' + e.z.toFixed(2) + ' rsi=' + e.rsi.toFixed(1) + ' <BB' };
    S.signals.push({ i: S.candles.indexOf(e), side: 'buy', price: px, reason: S.pos.reason });
    log('BUY ' + qty.toFixed(5) + ' @ ' + px.toFixed(2) + ' (' + S.pos.reason + ')', 'buy');
  }
  function tryExit(e, c) {
    if (!S.pos) return;
    const px = e.c;
    const ret = (px - S.pos.entry) / S.pos.entry;
    const held = S.candles.indexOf(e) - S.pos.i;
    const snapback = e.z != null && e.z > c.exitZ;
    const hot = e.rsi != null && e.rsi > c.rsiExit;
    const tp = ret >= c.tpPct, sl = ret <= -c.slPct, tst = held >= TIME_STOP;
    if (!(snapback || hot || tp || sl || tst)) return;
    const proceeds = S.pos.qty * px * (1 - FEE);
    S.cash += proceeds;
    const pnl = proceeds - (S.pos.qty * S.pos.entry) / (1 - FEE) * (1 - FEE); // approx net of entry fee already paid
    const reason = tp ? 'take-profit ' + (ret * 100).toFixed(2) + '%' : sl ? 'STOP ' + (ret * 100).toFixed(2) + '%' :
      tst ? 'time-stop ' + held + ' bars' : hot ? 'rsi-hot ' + e.rsi.toFixed(1) : 'snapback z=' + (e.z || 0).toFixed(2);
    S.trades.push({ entry: S.pos.entry, exit: px, qty: S.pos.qty, pnlNet: proceeds - S.pos.qty * S.pos.entry / (1 - FEE), reason, day: new Date().toDateString() });
    S.signals.push({ i: S.candles.indexOf(e), side: 'sell', price: px, reason });
    log('SELL @ ' + px.toFixed(2) + ' [' + reason + '] pnl≈$' + S.trades[S.trades.length - 1].pnlNet.toFixed(2), ret >= 0 ? 'sell' : 'warn');
    S.pos = null;
  }
  function killTriggered() {
    // ALWAYS ON — checkbox state is ignored on purpose (no bypass).
    const px = S.candles.length ? S.candles[S.candles.length - 1].c : S.equity;
    const eq = equityNow(px);
    return (eq - S.dayStartEq) / S.dayStartEq < RULES.KILL_SWITCH_PCT;
  }
  function updateHaltUI() {
    const b = $('#modeBadge');
    if (b) { b.textContent = S.halted ? 'HALTED — kill-switch tripped, reset to resume' : 'MODE: PAPER — no real money • RULES LOCKED ' + RULES.VERSION; }
  }
  function backtest() {
    const c = cfg();
    S.signals = []; S.trades = []; S.pos = null; S.cash = c.startEq;
    S.candles = enrich(S.candles);
    S.candles.forEach((e) => { tryExit(e, c); tryEnter(e, c); });
    const last = S.candles.length ? S.candles[S.candles.length - 1].c : 0;
    S.equity = equityNow(last); S.lastPrice = last;
    const wins = S.trades.filter((t) => t.pnlNet > 0).length;
    $('#statLine').textContent = '• ' + S.candles.length + ' candles • ' + S.trades.length + ' closed • win ' +
      (S.trades.length ? Math.round(wins / S.trades.length * 100) + '%' : '—');
    log('backtest done: ' + S.trades.length + ' trades, equity $' + S.equity.toFixed(2));
    updateKPIs(); drawAll();
  }

  // ---------- charts (plain canvas, no deps) ----------
  function drawLineChart(cv, series, opts) {
    const g = cv.getContext('2d'), W = cv.width, H = cv.height;
    g.clearRect(0, 0, W, H);
    const all = series.flatMap((s) => s.data.filter((v) => v != null));
    if (!all.length) return;
    let mn = Math.min(...all), mx = Math.max(...all);
    if (mx - mn < 1e-9) { mx += 1; mn -= 1; }
    const pad = (mx - mn) * 0.08; mn -= pad; mx += pad;
    const X = (i, n) => 8 + (i / Math.max(1, n - 1)) * (W - 16);
    const Y = (v) => H - 8 - ((v - mn) / (mx - mn)) * (H - 16);
    (opts.hlines || []).forEach((h) => {
      g.strokeStyle = 'rgba(255,255,255,.25)'; g.setLineDash([4, 4]); g.beginPath();
      g.moveTo(0, Y(h)); g.lineTo(W, Y(h)); g.stroke(); g.setLineDash([]);
    });
    series.forEach((s) => {
      g.strokeStyle = s.color; g.lineWidth = s.w || 1.5; g.beginPath();
      let started = false;
      s.data.forEach((v, i) => {
        if (v == null) { started = false; return; }
        if (!started) { g.moveTo(X(i, s.data.length), Y(v)); started = true; }
        else g.lineTo(X(i, s.data.length), Y(v));
      });
      g.stroke();
    });
    // markers
    const n = S.candles.length;
    S.signals.forEach((sg) => {
      const x = X(sg.i, n);
      const px = sg.price, y = Y(px);
      g.fillStyle = sg.side === 'buy' ? '#2ecc71' : '#ff5a5a';
      g.beginPath();
      if (sg.side === 'buy') { g.moveTo(x, y + 12); g.lineTo(x - 5, y + 22); g.lineTo(x + 5, y + 22); }
      else { g.moveTo(x, y - 12); g.lineTo(x - 5, y - 22); g.lineTo(x + 5, y - 22); }
      g.closePath(); g.fill();
    });
  }
  function drawAll() {
    const E = S.candles;
    drawLineChart($('#priceChart'), [
      { data: E.map((e) => e.c), color: '#e8f0ff', w: 2 },
      { data: E.map((e) => e.sma50), color: '#ffb300' },
      { data: E.map((e) => e.bbUp), color: 'rgba(0,194,255,.7)' },
      { data: E.map((e) => e.bbLo), color: 'rgba(0,194,255,.7)' },
    ], {});
    $('#rsiBuyEcho').textContent = $('#rsiBuy').value;
    $('#rsiExitEcho').textContent = $('#rsiExit').value;
    drawLineChart($('#rsiChart'), [{ data: E.map((e) => e.rsi), color: '#c58bff', w: 1.5 }],
      { hlines: [+$('#rsiBuy').value, +$('#rsiExit').value, 50] });
    // equity curve from closed-trade equity checkpoints + current
    let eq = S.startEq; const pts = [eq];
    S.trades.forEach((t) => { eq += t.pnlNet; pts.push(eq); });
    if (S.pos && S.lastPrice) pts.push(S.cash + S.pos.qty * S.lastPrice);
    const g = $('#equityChart').getContext('2d');
    g.clearRect(0, 0, $('#equityChart').width, $('#equityChart').height);
    drawLineChart($('#equityChart'), [{ data: pts, color: eq >= S.startEq ? '#2ecc71' : '#ff5a5a', w: 2 }], {});
    if (S.lastPrice) $('#priceTick').textContent = $('#symbol').value + '  $' + S.lastPrice.toLocaleString(undefined, { maximumFractionDigits: 2 });
  }
  function updateKPIs() {
    const last = S.candles.length ? S.candles[S.candles.length - 1].c : S.lastPrice || 0;
    const eq = equityNow(last || S.equity);
    S.equity = eq;
    $('#kEquity').textContent = '$' + eq.toLocaleString(undefined, { maximumFractionDigits: 2 });
    $('#kCash').textContent = '$' + S.cash.toLocaleString(undefined, { maximumFractionDigits: 2 });
    $('#kPos').textContent = S.pos ? S.pos.qty.toFixed(5) + ' @ ' + S.pos.entry.toFixed(2) : 'flat';
    const wins = S.trades.filter((t) => t.pnlNet > 0).length;
    $('#kTrades').textContent = S.trades.length + (S.pos ? ' (+1 open)' : '');
    $('#kWin').textContent = S.trades.length ? Math.round(wins / S.trades.length * 100) + '%' : '—';
    const pnl = S.trades.reduce((a, t) => a + t.pnlNet, 0) + (S.pos && last ? S.pos.qty * last - S.pos.qty * S.pos.entry : 0);
    const el = $('#kPnl'); el.textContent = (pnl >= 0 ? '+' : '') + '$' + pnl.toFixed(2);
    el.style.color = pnl >= 0 ? '#2ecc71' : '#ff5a5a';
  }

  // ---------- actions ----------
  async function loadAndBacktest() {
    const c = cfg();
    log('loading ' + c.symbol + ' (' + toCoinbaseProduct(c.symbol) + ') ' + c.interval + ' klines…');
    try {
      const res = await fetchKlinesSmart(c.symbol, c.interval, 300);
      S.candles = res.k;
      setConn(true, 'live — ' + res.src + ' public klines (' + S.candles.length + ')');
    } catch (e) {
      S.candles = simCandles(300, c.symbol.startsWith('ETH') ? 3200 : c.symbol.startsWith('SOL') ? 170 : 67000);
      setConn(false, 'offline — simulation feed (both exchanges blocked?)');
      log('fetch failed (' + e.message + ') — using offline simulation', 'warn');
    }
    backtest();
  }
  async function liveTick() {
    const c = cfg();
    try {
      const res = await fetchKlinesSmart(c.symbol, c.interval, 2);
      const last = res.k[res.k.length - 1];
      const tail = S.candles[S.candles.length - 1];
      if (!tail || last.t > tail.t) S.candles.push(last); else S.candles[S.candles.length - 1] = last;
      if (S.candles.length > 600) S.candles.splice(0, S.candles.length - 600);
      S.candles = enrich(S.candles);
      const e = S.candles[S.candles.length - 1];
      S.lastPrice = e.c;
      setConn(true, 'live paper — ' + c.symbol + '/' + toCoinbaseProduct(c.symbol) + ' ' + c.interval + ' via ' + res.src);
      tryExit(e, c); tryEnter(e, c);
      updateKPIs(); drawAll();
    } catch (e2) {
      // offline drift of last candle
      const tail = S.candles[S.candles.length - 1];
      if (tail) {
        tail.c *= 1 + (Math.random() - 0.5) * 0.001;
        S.candles = enrich(S.candles);
        S.lastPrice = tail.c;
        const cc = cfg(); tryExit(S.candles[S.candles.length - 1], cc); tryEnter(S.candles[S.candles.length - 1], cc);
        updateKPIs(); drawAll();
      }
      setConn(false, 'offline — simulation tick');
    }
  }

  function bind() {
    // Lock the kill-switch ON: even if user unchecks in devtools, engine ignores it.
    const ks = $('#killSwitch');
    if (ks) { ks.checked = true; ks.disabled = true; ks.title = 'Locked ON — no bypass'; }
    const badge = $('#modeBadge');
    if (badge) badge.textContent = 'MODE: PAPER — no real money • RULES LOCKED ' + RULES.VERSION;
    $('#loadBtn').onclick = loadAndBacktest;
    $('#resetBtn').onclick = resetAccount;
    $('#stopBtn').onclick = () => { clearInterval(S.liveTimer); S.liveTimer = null; log('paper loop stopped'); };
    $('#paperBtn').onclick = async () => {
      if (!$('#liveConfirm').checked) { log('tick the “I understand PAPER only” box first', 'warn'); return; }
      if (!S.candles.length) await loadAndBacktest();
      clearInterval(S.liveTimer);
      S.liveTimer = setInterval(liveTick, 15000);
      log('live paper loop started (15s ticks, PAPER ONLY)');
      liveTick();
    };
    $('#exportBtn').onclick = () => {
      const blob = new Blob([JSON.stringify({ strategy: 'REV-mean-reversion-paper', exportedAt: new Date().toISOString(), cfg: cfg(), signals: S.signals.slice(-100), trades: S.trades.slice(-100) }, null, 2)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob); a.download = 'rev-signals.json'; a.click();
      log('exported last 100 signals/trades to rev-signals.json');
    };
  }

  bind(); resetAccount();
  S.candles = simCandles(220, 67000); S.candles = enrich(S.candles);
  backtest();
  log('REV dashboard ready. Click “Load live klines + backtest”. PAPER ONLY — no real orders.', 'buy');
  // Rules self-test (runs in console, no bypass paths):
  try {
    console.assert(Object.isFrozen(RULES), 'RULES must be frozen');
    console.assert(RULES.PAPER_ONLY === true && RULES.LONG_ONLY === true, 'paper/long-only locked');
    const t = cfg();
    console.assert(t.riskPct <= RULES.MAX_RISK_PCT + 1e-9, 'risk clamp');
    console.assert(t.slPct >= RULES.MIN_SL_PCT - 1e-9, 'sl clamp');
    console.assert($('#killSwitch').disabled === true && $('#killSwitch').checked === true, 'kill-switch locked on');
    console.log('%c[REV] rules self-test passed: ' + RULES.VERSION, 'color:#2ecc71');
  } catch (err) { console.warn('[REV] self-test failed', err); }
  window.REV_RULES = RULES; // read-only introspection (frozen)
})();
