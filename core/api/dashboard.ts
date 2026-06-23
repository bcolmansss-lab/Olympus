/**
 * Olympus live dashboard — a single self-contained HTML page.
 *
 * Zero build step, zero external assets: it consumes the SSE stream at
 * /v1/stream and the REST endpoints to render the Decision Inbox, the live
 * event spine, and the autonomy posture in real time. Served at GET / by the
 * API server. This is a reference operator console, not a production UI.
 */

export const DASHBOARD_HTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Olympus — Operator Console</title>
<style>
  :root {
    --bg: #0b0e14; --panel: #11161f; --line: #1e2733; --ink: #e6edf3;
    --dim: #8b98a5; --accent: #4ea1ff; --good: #3fb950; --warn: #d29922; --bad: #f85149;
    --mono: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace;
  }
  * { box-sizing: border-box; }
  body { margin: 0; background: var(--bg); color: var(--ink);
    font: 14px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
  header { display: flex; align-items: center; gap: 14px; padding: 14px 22px;
    border-bottom: 1px solid var(--line); background: var(--panel); position: sticky; top: 0; z-index: 5; }
  header h1 { font-size: 16px; margin: 0; letter-spacing: .3px; }
  header .sub { color: var(--dim); font-size: 12px; }
  .pill { margin-left: auto; display: flex; align-items: center; gap: 8px; font-size: 12px; color: var(--dim); }
  .dot { width: 9px; height: 9px; border-radius: 50%; background: var(--bad); transition: background .3s; }
  .dot.live { background: var(--good); box-shadow: 0 0 8px var(--good); }
  main { display: grid; grid-template-columns: 1.4fr 1fr; gap: 16px; padding: 18px 22px; max-width: 1280px; margin: 0 auto; }
  @media (max-width: 900px) { main { grid-template-columns: 1fr; } }
  .panel { background: var(--panel); border: 1px solid var(--line); border-radius: 10px; overflow: hidden; }
  .panel h2 { font-size: 12px; text-transform: uppercase; letter-spacing: .8px; color: var(--dim);
    margin: 0; padding: 12px 16px; border-bottom: 1px solid var(--line); display: flex; justify-content: space-between; }
  .panel .body { padding: 6px 0; max-height: 62vh; overflow-y: auto; }
  .stats { display: flex; gap: 18px; padding: 12px 16px; border-bottom: 1px solid var(--line); }
  .stat { display: flex; flex-direction: column; }
  .stat b { font-size: 22px; font-weight: 650; }
  .stat span { font-size: 11px; color: var(--dim); text-transform: uppercase; letter-spacing: .5px; }
  .item { padding: 11px 16px; border-bottom: 1px solid var(--line); }
  .item:last-child { border-bottom: 0; }
  .item .q { font-weight: 600; }
  .item .note { color: var(--dim); font-size: 12.5px; margin-top: 2px; }
  .tag { display: inline-block; font-size: 10.5px; font-weight: 700; text-transform: uppercase;
    letter-spacing: .5px; padding: 2px 7px; border-radius: 5px; margin-right: 8px; vertical-align: middle; }
  .tag.auto_executed { background: rgba(63,185,80,.16); color: var(--good); }
  .tag.needs_approval { background: rgba(210,153,34,.16); color: var(--warn); }
  .tag.escalated { background: rgba(248,81,73,.16); color: var(--bad); }
  .tag.resolved { background: rgba(78,161,255,.14); color: var(--accent); }
  .ev { font-family: var(--mono); font-size: 12px; padding: 5px 16px; border-bottom: 1px solid var(--line);
    display: flex; gap: 10px; animation: flash .8s ease-out; }
  .ev .t { color: var(--dim); white-space: nowrap; }
  .ev .topic { color: var(--accent); }
  @keyframes flash { from { background: rgba(78,161,255,.12); } to { background: transparent; } }
  .empty { color: var(--dim); padding: 18px 16px; font-style: italic; }
  .diag { grid-column: 1 / -1; }
  .diag .controls { display: flex; gap: 10px; padding: 12px 16px; border-bottom: 1px solid var(--line); }
  .diag input { flex: 1; background: var(--bg); border: 1px solid var(--line); color: var(--ink);
    border-radius: 6px; padding: 8px 11px; font-size: 13px; }
  .diag input:focus { outline: 0; border-color: var(--accent); }
  .fact { display: grid; grid-template-columns: 92px 56px 1fr; gap: 12px; align-items: baseline;
    padding: 8px 16px; border-bottom: 1px solid var(--line); font-size: 13px; }
  .fact:last-child { border-bottom: 0; }
  .src { font-family: var(--mono); font-size: 10.5px; font-weight: 700; text-transform: uppercase;
    letter-spacing: .5px; padding: 2px 6px; border-radius: 5px; text-align: center; }
  .src.graph { background: rgba(78,161,255,.16); color: var(--accent); }
  .src.vector { background: rgba(63,185,80,.16); color: var(--good); }
  .src.semantic { background: rgba(210,153,34,.16); color: var(--warn); }
  .src.aggregate { background: rgba(139,152,165,.18); color: var(--dim); }
  .score { font-family: var(--mono); color: var(--dim); font-size: 12px; }
  .grounded { font-size: 11px; color: var(--good); }
  .briefing { padding: 11px 22px; border-bottom: 1px solid var(--line); font-size: 13.5px;
    background: linear-gradient(90deg, rgba(78,161,255,.10), transparent); }
  .briefing.urgent { background: linear-gradient(90deg, rgba(248,81,73,.16), transparent); }
  .briefing.attention { background: linear-gradient(90deg, rgba(210,153,34,.14), transparent); }
  .briefing b { color: var(--accent); }
  button.demo { margin-left: 10px; background: var(--accent); color: #04101f; border: 0; font-weight: 650;
    padding: 6px 12px; border-radius: 6px; cursor: pointer; font-size: 12px; }
  button.demo:hover { filter: brightness(1.1); }
  button.demo:disabled { opacity: .5; cursor: default; }
  /* Company Health hero */
  .health { grid-column: 1 / -1; }
  .health .body { max-height: none; padding: 14px 16px; }
  .health-top { display: flex; align-items: center; gap: 16px; margin-bottom: 14px; flex-wrap: wrap; }
  .health-score { font-family: var(--mono); font-size: 38px; font-weight: 700; line-height: 1; }
  .health-score .max { font-size: 16px; color: var(--dim); font-weight: 400; }
  .health-headline { color: var(--dim); font-size: 13px; flex: 1; min-width: 180px; }
  .grade { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: .6px;
    padding: 4px 10px; border-radius: 6px; }
  .grade.excellent { background: rgba(63,185,80,.18); color: var(--good); }
  .grade.good { background: rgba(45,212,191,.18); color: #2dd4bf; }
  .grade.fair { background: rgba(210,153,34,.18); color: var(--warn); }
  .grade.poor { background: rgba(245,158,66,.18); color: #f59e42; }
  .grade.critical { background: rgba(248,81,73,.18); color: var(--bad); }
  .dim-row { margin: 8px 0; }
  .dim-row .lbl { display: flex; justify-content: space-between; font-size: 12px; margin-bottom: 3px; }
  .dim-row .lbl .nm { color: var(--ink); }
  .dim-row .lbl .sc { font-family: var(--mono); color: var(--dim); }
  .dim-row .track { background: var(--bg); border-radius: 5px; height: 8px; overflow: hidden; }
  .dim-row .fill { height: 100%; border-radius: 5px; background: var(--accent); transition: width .4s; }
  .dim-row .detail { font-size: 11.5px; color: var(--dim); margin-top: 3px; }
  /* Business Modules grid */
  .modules { grid-column: 1 / -1; }
  .module-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
    gap: 12px; padding: 14px 16px; }
  .module-card { background: var(--bg); border: 1px solid var(--line); border-radius: 8px; padding: 11px 13px; }
  .module-card .mt { font-size: 11px; text-transform: uppercase; letter-spacing: .6px; color: var(--dim); }
  .module-card .mv { font-family: var(--mono); font-size: 20px; font-weight: 650; margin: 4px 0 2px; }
  .module-card .ms { font-size: 11.5px; color: var(--dim); }
</style>
</head>
<body>
<header>
  <h1>⛰ Olympus</h1>
  <span class="sub">Autonomous Business Operating System — Operator Console</span>
  <button class="demo" id="run">Run a decision</button>
  <span class="pill"><span class="dot" id="dot"></span><span id="status">connecting…</span></span>
</header>
<div id="briefing" class="briefing"></div>
<main>
  <section class="panel health">
    <h2>Company Health <span id="health-grade-slot" class="sub"></span></h2>
    <div class="body" id="health"><div class="empty">Loading company health…</div></div>
  </section>
  <section class="panel modules">
    <h2>Business Modules <span class="sub">live</span></h2>
    <div class="module-grid" id="modules"><div class="empty">Loading modules…</div></div>
  </section>
  <section class="panel">
    <h2>Decision Inbox <span id="inbox-count" class="sub"></span></h2>
    <div class="stats" id="stats"></div>
    <div class="body" id="inbox"><div class="empty">No decisions yet.</div></div>
  </section>
  <section class="panel">
    <h2>Event Spine <span class="sub">live</span></h2>
    <div class="body" id="events"><div class="empty">Waiting for events…</div></div>
  </section>
  <section class="panel diag">
    <h2>GraphRAG Diagnosis <span id="grounded" class="grounded"></span></h2>
    <div class="controls">
      <input id="q" type="text" value="why did mid-market churn rise onboarding"
        placeholder="Ask a grounded question…" />
      <button class="demo" id="diagnose">Diagnose</button>
    </div>
    <div class="body" id="facts"><div class="empty">Run a diagnosis to see the grounded context bundle.</div></div>
  </section>
</main>
<script>
const $ = (id) => document.getElementById(id);
const fmt = (ts) => new Date(ts).toLocaleTimeString();

async function refreshInbox() {
  try {
    const r = await fetch('/v1/inbox');
    const { stats, items } = await r.json();
    $('stats').innerHTML = [
      ['total', stats.total], ['pending', stats.pending],
      ['auto', stats.autoExecuted], ['resolved', stats.resolved],
    ].map(([k, v]) => '<div class="stat"><b>' + v + '</b><span>' + k + '</span></div>').join('');
    $('inbox-count').textContent = items.length ? '(' + items.length + ')' : '';
    $('inbox').innerHTML = items.length
      ? items.map((i) =>
          '<div class="item"><div class="q"><span class="tag ' + i.status + '">' +
          i.status.replace('_', ' ') + '</span>' + esc(i.question) + '</div>' +
          '<div class="note">' + esc(i.note) +
          (i.consensusScore != null ? ' · consensus ' + i.consensusScore : '') + '</div></div>'
        ).join('')
      : '<div class="empty">No decisions yet.</div>';
  } catch (e) { /* server may be briefly unavailable */ }
}

function esc(s) { return String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c])); }

let evCount = 0;
function addEvent(ev) {
  const list = $('events');
  if (evCount === 0) list.innerHTML = '';
  const row = document.createElement('div');
  row.className = 'ev';
  row.innerHTML = '<span class="t">' + fmt(ev.ts) + '</span><span class="topic">' + esc(ev.topic) + '</span>';
  list.prepend(row);
  evCount++;
  while (list.children.length > 60) list.removeChild(list.lastChild);
}

function connect() {
  const es = new EventSource('/v1/stream?topic=*');
  es.onopen = () => { $('dot').classList.add('live'); $('status').textContent = 'live'; };
  es.onerror = () => { $('dot').classList.remove('live'); $('status').textContent = 'reconnecting…'; };
  es.onmessage = () => {};
  // The server names each event by its topic, so listen broadly via a catch-all.
  ['decision.opened','decision.session.opened','decision.session.resolved','decision.reconciled',
   'agent.proposed','agent.challenged','agent.supported','agent.escalated',
   'sim.requested','sim.completed','action.gated','action.executed',
   'autonomy.granted','autonomy.revoked','okg.node.versioned','okg.edge.added',
   'memory.episode.recorded','audit.recorded']
    .forEach((t) => es.addEventListener(t, (e) => {
      try { addEvent(JSON.parse(e.data)); } catch (_) {}
      if (t.startsWith('decision.') || t === 'action.gated') { refreshInbox(); refreshBriefing(); refreshHealth(); refreshModules(); }
    }));
}

$('run').onclick = async () => {
  const btn = $('run'); btn.disabled = true; btn.textContent = 'running…';
  try {
    await fetch('/v1/autonomy/grants', { method: 'PUT', body: JSON.stringify({
      domain: 'finance', capability: 'reallocate_budget', level: 5,
      blast_radius: { max_amount: 250000, max_per_day: 10 } }) });
    await fetch('/v1/ask', { method: 'POST', body: JSON.stringify({
      question: 'Cut Q3 marketing spend ' + (10 + Math.floor(Math.random() * 15)) + '% to extend runway?',
      domain: 'finance', options: ['cut-spend', 'hold'], capability: 'reallocate_budget',
      intervention: { variable: 'marketing_spend', delta: -0.18 },
      exposureAmount: 120000 + Math.floor(Math.random() * 200000), simSeed: Date.now() % 1000 }) });
  } finally { btn.disabled = false; btn.textContent = 'Run a decision'; refreshInbox(); }
};

async function refreshBriefing() {
  try {
    const b = await (await fetch('/v1/briefing')).json();
    const sev = b.sections.some((s) => s.severity === 'urgent') ? 'urgent'
      : b.sections.some((s) => s.severity === 'attention') ? 'attention' : '';
    const el = $('briefing');
    el.className = 'briefing ' + sev;
    el.innerHTML = '<b>Briefing.</b> ' + esc(b.headline);
  } catch (e) { /* ignore */ }
}

const GRADE_FILL = { excellent: 'var(--good)', good: '#2dd4bf', fair: 'var(--warn)',
  poor: '#f59e42', critical: 'var(--bad)' };

async function refreshHealth() {
  try {
    const h = await (await fetch('/v1/health')).json();
    const grade = String(h.grade || '').toLowerCase();
    const fill = GRADE_FILL[grade] || 'var(--accent)';
    const composite = (typeof h.composite === 'number') ? h.composite.toFixed(1) : '—';
    $('health-grade-slot').innerHTML = grade
      ? '<span class="grade ' + esc(grade) + '">' + esc(grade) + '</span>' : '';
    const dims = Array.isArray(h.dimensions) ? h.dimensions : [];
    $('health').innerHTML =
      '<div class="health-top">' +
        '<div class="health-score" style="color:' + fill + '">' + composite +
          ' <span class="max">/ 100</span></div>' +
        '<div class="health-headline">' + esc(h.headline || '') + '</div>' +
      '</div>' +
      (dims.length
        ? dims.map((d) => {
            const score = Math.max(0, Math.min(100, Number(d.score) || 0));
            return '<div class="dim-row">' +
              '<div class="lbl"><span class="nm">' + esc(d.name) + '</span>' +
              '<span class="sc">' + score.toFixed(0) + '</span></div>' +
              '<div class="track"><div class="fill" style="width:' + score + '%;background:' + fill + '"></div></div>' +
              (d.detail ? '<div class="detail">' + esc(d.detail) + '</div>' : '') +
            '</div>';
          }).join('')
        : '<div class="empty">No dimension data.</div>');
  } catch (e) {
    $('health').innerHTML = '<div class="empty">Health unavailable.</div>';
  }
}

function money(n) {
  if (typeof n !== 'number' || !isFinite(n)) return '—';
  const a = Math.abs(n);
  const sign = n < 0 ? '-' : '';
  if (a >= 1e9) return sign + '$' + (a / 1e9).toFixed(1) + 'B';
  if (a >= 1e6) return sign + '$' + (a / 1e6).toFixed(1) + 'M';
  if (a >= 1e3) return sign + '$' + (a / 1e3).toFixed(1) + 'K';
  return sign + '$' + a.toFixed(0);
}
function card(title, value, sub) {
  return '<div class="module-card"><div class="mt">' + esc(title) + '</div>' +
    '<div class="mv">' + value + '</div><div class="ms">' + sub + '</div></div>';
}

async function refreshModules() {
  const get = async (path) => { try { return await (await fetch(path)).json(); } catch (e) { return null; } };
  const [fin, pipe, risk, sla, cap] = await Promise.all([
    get('/v1/finance'), get('/v1/pipeline'), get('/v1/risks'), get('/v1/sla'), get('/v1/capacity'),
  ]);
  const cards = [];
  if (fin && fin.burnRate) {
    const rw = (typeof fin.burnRate.runwayMonths === 'number') ? fin.burnRate.runwayMonths.toFixed(1) + ' mo' : '—';
    cards.push(card('Finance', rw, 'net income ' + money(fin.netIncome)));
  } else cards.push(card('Finance', '—', 'no data'));
  if (pipe && pipe.summary) {
    cards.push(card('Pipeline', money(pipe.summary.weightedArrUsd),
      (pipe.summary.openDeals != null ? pipe.summary.openDeals : '—') + ' open deals'));
  } else cards.push(card('Pipeline', '—', 'no data'));
  if (risk && Array.isArray(risk.top)) {
    const hi = risk.top.length ? (Number(risk.top[0].residualScore) || 0).toFixed(2) : '—';
    cards.push(card('Risk', String(risk.top.length), 'top residual ' + hi));
  } else cards.push(card('Risk', '—', 'no data'));
  if (sla && Array.isArray(sla.slas)) {
    const atRisk = Array.isArray(sla.atRisk) ? sla.atRisk.length : 0;
    const healthy = sla.slas.length - atRisk;
    cards.push(card('SLA', healthy + '/' + sla.slas.length,
      'penalties ' + money(sla.totalPenalties)));
  } else cards.push(card('SLA', '—', 'no data'));
  if (cap && Array.isArray(cap.overallocated)) {
    cards.push(card('Capacity', String(cap.overallocated.length), 'overallocated'));
  } else cards.push(card('Capacity', '—', 'no data'));
  $('modules').innerHTML = cards.join('');
}

async function diagnose() {
  const btn = $('diagnose'); const q = $('q').value.trim();
  if (!q) return;
  btn.disabled = true; btn.textContent = '…';
  try {
    const r = await fetch('/v1/diagnose', { method: 'POST', body: JSON.stringify({
      query: q, embedding: [0.85, 0.25, 0.3, 0.48], topK: 12 }) });
    const ctx = await r.json();
    $('grounded').textContent = ctx.fullyGrounded ? '✓ fully grounded · ' + ctx.facts.length + ' facts' : '';
    $('facts').innerHTML = (ctx.facts || []).length
      ? ctx.facts.map((f) =>
          '<div class="fact"><span class="src ' + f.source + '">' + f.source + '</span>' +
          '<span class="score">' + f.score + '</span>' +
          '<span>' + esc(f.claim) + '</span></div>'
        ).join('')
      : '<div class="empty">No grounded facts for that query.</div>';
  } catch (e) {
    $('facts').innerHTML = '<div class="empty">Diagnosis failed.</div>';
  } finally { btn.disabled = false; btn.textContent = 'Diagnose'; }
}
$('diagnose').onclick = diagnose;
$('q').addEventListener('keydown', (e) => { if (e.key === 'Enter') diagnose(); });

refreshInbox();
refreshBriefing();
refreshHealth();
refreshModules();
setInterval(() => { refreshHealth(); refreshModules(); }, 5000);
connect();
</script>
</body>
</html>`;
