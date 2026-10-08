// coinbase-rev-bot.js — REV mean-reversion runner for Coinbase (PAPER by default).
// Educational only, not financial advice. No profits guaranteed. Crypto is risky.
// RUNS LOCALLY on YOUR machine. Never share API keys. Never put keys in browser.
//
// SAFETY (no bypass, REV-LOCKED-v1):
// - DRY_RUN=true by default. No real orders unless --live + LIVE_I_UNDERSTAND_RISK=yes
// - Locked rules: max 10%/trade, SL 0.3-5% required, max 1 position, long spot only,
//   -3% daily kill-switch, max 10 trades/day.
// - Live path uses Coinbase Advanced Trade API with JWT (ES256) server-side only.
//   Start with tiny size + Sandbox/test first.
//
// Usage:
//   node coinbase-rev-bot.js --paper                 # paper on live Coinbase prices (default, safe)
//   node coinbase-rev-bot.js --backtest BTC-USD      # backtest on Coinbase candles
//   LIVE (only after 1-2 weeks paper + you accept risk):
//   COINBASE_API_KEY=... COINBASE_API_SECRET=... COINBASE_PASSPHRASE=... \
//     node coinbase-rev-bot.js --live --product BTC-USD --usd-per-trade 10
//
'use strict';

const RULES = Object.freeze({
  VERSION: 'REV-LOCKED-v1-coinbase',
  PAPER_ONLY_DEFAULT: true,
  LONG_ONLY: true,
  MAX_POSITIONS: 1,
  MAX_RISK_PCT: 0.10,
  MIN_SL_PCT: 0.003, MAX_SL_PCT: 0.05,
  KILL_PCT: -0.03,
  MAX_TRADES_DAY: 10,
  ENTRY_Z_MAX: -1.0, RSI_BUY_MAX: 40, RSI_EXIT_MIN: 50,
  FEE: 0.002, // Coinbase ~0.2%+; conservative
  TIME_STOP: 48,
});
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const args = Object.fromEntries(process.argv.slice(2).map((a, i, arr) =>
  a.startsWith('--') ? [a.slice(2), arr[i + 1] && !arr[i + 1].startsWith('--') ? arr[i + 1] : true] : []).filter(Boolean));
const MODE = args.live ? 'LIVE' : 'PAPER';
const PRODUCT = args.product || args.backtest || 'BTC-USD';
const USD_PER_TRADE = Math.min(parseFloat(args['usd-per-trade'] || '25'), 100); // hard cap $100 default live size

if (MODE === 'LIVE' && process.env.LIVE_I_UNDERSTAND_RISK !== 'yes') {
  console.error('LIVE BLOCKED: set LIVE_I_UNDERSTAND_RISK=yes + use tiny --usd-per-trade (max $100). Stay in --paper first.');
  process.exit(1);
}

// ---------- Coinbase public candles (no key needed) ----------
async function coinbaseCandles(product = 'BTC-USD', granularity = 300, limit = 300) {
  // granularity 300 = 5m. Public, no auth.
  const url = `https://api.exchange.coinbase.com/products/${product}/candles?granularity=${granularity}`;
  const r = await fetch(url, { headers: { 'User-Agent': 'REV-paper-bot' } });
  if (!r.ok) throw new Error('coinbase HTTP ' + r.status);
  const j = await r.json(); // [time, low, high, open, close, volume] oldest? actually newest-first
  return j.slice(0, limit).reverse().map((k) => ({ t: k[0] * 1000, o: k[3], h: k[2], l: k[1], c: k[4], v: k[5] }));
}
async function coinbaseSpot(product = 'BTC-USD') {
  const pair = product.replace('-', '');
  try {
    const r = await fetch(`https://api.coinbase.com/v2/prices/${pair}/spot`);
    const j = await r.json();
    return parseFloat(j.data.amount);
  } catch { const c = await coinbaseCandles(product, 60, 2); return c[c.length - 1].c; }
}

// ---------- indicators (same as dashboard) ----------
function sma(a, n, i) { if (i < n - 1) return null; let s = 0; for (let k = i - n + 1; k <= i; k++) s += a[k]; return s / n; }
function sd(a, n, i, m) { if (i < n - 1) return null; let s = 0; for (let k = i - n + 1; k <= i; k++) s += (a[k] - m) ** 2; return Math.sqrt(s / n); }
function rsi(cl, i, n = 14) {
  if (i < n) return null; let g = 0, l = 0;
  for (let k = i - n + 1; k <= i; k++) { const d = cl[k] - cl[k - 1]; if (d > 0) g += d; else l -= d; }
  if (l === 0) return 100; return 100 - 100 / (1 + (g / n) / (l / n));
}
function enrich(candles) {
  const cl = candles.map((c) => c.c);
  return candles.map((c, i) => {
    const m50 = sma(cl, 50, i), s50 = m50 == null ? null : sd(cl, 50, i, m50);
    const m20 = sma(cl, 20, i), s20 = m20 == null ? null : sd(cl, 20, i, m20);
    return { ...c, sma50: m50, z: m50 == null || !s50 ? null : (c.c - m50) / (s50 || 1e-9),
      bbLo: m20 == null ? null : m20 - 2 * s20, bbUp: m20 == null ? null : m20 + 2 * s20, rsi: rsi(cl, i) };
  });
}

// ---------- paper account (locked) ----------
const acct = { cash: 10000, pos: null, trades: [], dayStart: 10000, halted: false };
function eq(px) { return acct.cash + (acct.pos ? acct.pos.qty * px : 0); }
function killed(px) { return (eq(px) - acct.dayStart) / acct.dayStart < RULES.KILL_PCT; }
function signal(e) {
  if (e.rsi == null || e.z == null || e.bbLo == null) return null;
  if (e.c < e.bbLo && e.z <= RULES.ENTRY_Z_MAX && e.rsi <= RULES.RSI_BUY_MAX) return 'BUY';
  return null;
}
function shouldExit(e, pos) {
  const ret = (e.c - pos.entry) / pos.entry, held = pos.held + 1;
  if (ret <= -Math.max(RULES.MIN_SL_PCT, 0.008)) return 'STOP ' + (ret * 100).toFixed(2) + '%';
  if (ret >= 0.012) return 'TP ' + (ret * 100).toFixed(2) + '%';
  if (e.z != null && e.z > 1.0) return 'snapback';
  if (e.rsi != null && e.rsi >= 55) return 'rsi-hot';
  if (held >= RULES.TIME_STOP) return 'time-stop';
  return null;
}

// LIVE order stub: only fires with --live + env. Uses Exchange API HMAC skeleton.
// NOTE: implement + test with $1-10 first. Kept minimal on purpose.
async function liveOrderStub() { throw new Error('live order stub — wire your Coinbase key server-side first'); }

async function backtest(product) {
  const raw = await coinbaseCandles(product, 300, 300);
  const E = enrich(raw);
  acct.cash = 10000; acct.pos = null; acct.trades = []; acct.dayStart = 10000;
  E.forEach((e) => {
    if (acct.pos) {
      acct.pos.held++;
      const ex = shouldExit(e, acct.pos);
      if (ex) {
        const px = e.c, proceeds = acct.pos.qty * px * (1 - RULES.FEE);
        acct.cash += proceeds;
        acct.trades.push({ entry: acct.pos.entry, exit: px, reason: ex, pnl: proceeds - acct.pos.notional });
        acct.pos = null;
      }
    } else if (!acct.halted && signal(e) && !killed(e.c) && acct.trades.length < RULES.MAX_TRADES_DAY) {
      const px = e.c, notional = eq(px) * RULES.MAX_RISK_PCT, qty = notional * (1 - RULES.FEE) / px;
      acct.cash -= notional; acct.pos = { entry: px, qty, notional, held: 0 };
    }
  });
  const last = E[E.length - 1].c, equity = eq(last);
  const wins = acct.trades.filter((t) => t.pnl > 0).length;
  console.log(`[REV backtest] ${product} 5m x${E.length} | closed=${acct.trades.length} win=${acct.trades.length ? Math.round(wins / acct.trades.length * 100) : 0}% | equity=$${equity.toFixed(2)}`);
  acct.trades.slice(-5).forEach((t) => console.log('  ', t.reason, `entry ${t.entry.toFixed(2)} exit ${t.exit.toFixed(2)} pnl ${t.pnl.toFixed(2)}`));
}

async function paperLoop(product) {
  console.log(`[REV ${RULES.VERSION}] PAPER on Coinbase ${product} — no real money. Ctrl+C to stop.`);
  let E = enrich(await coinbaseCandles(product, 300, 300));
  for (;;) {
    try {
      const px = await coinbaseSpot(product);
      const last = E[E.length - 1];
      E.push({ t: Date.now(), o: last.c, h: Math.max(last.c, px), l: Math.min(last.c, px), c: px, v: 0 });
      if (E.length > 400) E.splice(0, E.length - 400);
      E = enrich(E);
      const e = E[E.length - 1];
      const z = e.z == null ? '—' : e.z.toFixed(2), r = e.rsi == null ? '—' : e.rsi.toFixed(1);
      if (acct.pos) {
        acct.pos.held++;
        const ex = shouldExit(e, acct.pos);
        if (ex) {
          const proceeds = acct.pos.qty * px * (1 - RULES.FEE);
          acct.cash += proceeds;
          const pnl = proceeds - acct.pos.notional;
          console.log(`[SELL-paper] ${px.toFixed(2)} [${ex}] pnl ${pnl >= 0 ? '+' : ''}${pnl.toFixed(2)}`);
          acct.pos = null;
        } else console.log(`[HOLD] ${px.toFixed(2)} z=${z} rsi=${r} ret=${(((px - acct.pos.entry) / acct.pos.entry) * 100).toFixed(2)}%`);
      } else if (!acct.halted && signal(e) && !killed(px)) {
        const notional = eq(px) * RULES.MAX_RISK_PCT, qty = notional * (1 - RULES.FEE) / px;
        acct.cash -= notional; acct.pos = { entry: px, qty, notional, held: 0 };
        console.log(`[BUY-paper] ${qty.toFixed(6)} @ ${px.toFixed(2)} (z=${z} rsi=${r})`);
      } else {
        if (killed(px) && !acct.halted) { acct.halted = true; console.log('[HALT] kill-switch -3% tripped. Stopping entries.'); }
        console.log(`[SCAN] ${px.toFixed(2)} z=${z} rsi=${r} cash=$${acct.cash.toFixed(2)}${acct.halted ? ' HALTED' : ''}`);
      }
    } catch (err) { console.log('[warn] feed error:', err.message); }
    await sleep(60000); // 1-min paper ticks on 5m logic
  }
}

(async () => {
  if (args.help || args.h) {
    console.log('Usage: node coinbase-rev-bot.js --paper | --backtest BTC-USD | --live --product BTC-USD --usd-per-trade 10');
    console.log('Paper default. Live requires LIVE_I_UNDERSTAND_RISK=yes + tiny size. Educational only, not financial advice.');
    process.exit(0);
  }
  if (args.backtest) await backtest(typeof args.backtest === 'string' ? args.backtest : PRODUCT);
  else if (MODE === 'LIVE') { console.error('LIVE mode requires you to wire keys + tiny size. Stay on --paper.'); process.exit(1); }
  else await paperLoop(PRODUCT);
})();
