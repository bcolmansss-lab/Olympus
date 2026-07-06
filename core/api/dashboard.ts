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
    --bg: #0f0f1a; --panel: #1a1a2e; --line: #252540; --ink: #e8e8f0;
    --dim: #8888aa; --accent: #6366f1; --accent2: #818cf8; --good: #22d3a5; --warn: #f59e0b; --bad: #ef4444;
    --mono: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace;
    --sans: -apple-system, BlinkMacSystemFont, "Segoe UI", "Inter", Roboto, sans-serif;
  }
  * { box-sizing: border-box; }
  body { margin: 0; background: var(--bg); color: var(--ink); font: 14px/1.6 var(--sans); }
  header {
    display: flex; align-items: center; gap: 14px; padding: 14px 24px;
    border-bottom: 1px solid var(--line); background: var(--panel);
    position: sticky; top: 0; z-index: 5;
    box-shadow: 0 1px 16px rgba(0,0,0,.4);
  }
  header h1 { font-size: 17px; margin: 0; letter-spacing: .2px; font-weight: 700; }
  header h1 span { color: var(--accent2); }
  header .sub { color: var(--dim); font-size: 12px; }
  .pill { margin-left: auto; display: flex; align-items: center; gap: 8px; font-size: 12px; color: var(--dim); }
  .dot { width: 9px; height: 9px; border-radius: 50%; background: var(--bad); transition: background .3s; }
  .dot.live { background: var(--good); box-shadow: 0 0 8px var(--good); }
  main { display: grid; grid-template-columns: 1.4fr 1fr; gap: 18px; padding: 20px 24px; max-width: 1400px; margin: 0 auto; }
  @media (max-width: 960px) { main { grid-template-columns: 1fr; } }
  .panel {
    background: var(--panel); border: 1px solid var(--line); border-radius: 12px; overflow: hidden;
    transition: box-shadow .2s;
  }
  .panel:hover { box-shadow: 0 4px 24px rgba(99,102,241,.1); }
  .panel h2 {
    font-size: 11px; text-transform: uppercase; letter-spacing: 1px; color: var(--dim);
    margin: 0; padding: 13px 18px; border-bottom: 1px solid var(--line);
    display: flex; justify-content: space-between; align-items: center; font-weight: 600;
  }
  .panel h2 .icon { font-size: 14px; }
  .panel .body { padding: 6px 0; max-height: 62vh; overflow-y: auto; }
  .stats { display: flex; gap: 20px; padding: 13px 18px; border-bottom: 1px solid var(--line); }
  .stat { display: flex; flex-direction: column; }
  .stat b { font-size: 24px; font-weight: 700; color: var(--ink); }
  .stat span { font-size: 10px; color: var(--dim); text-transform: uppercase; letter-spacing: .6px; margin-top: 1px; }
  .item { padding: 12px 18px; border-bottom: 1px solid var(--line); }
  .item:last-child { border-bottom: 0; }
  .item .q { font-weight: 600; font-size: 13px; }
  .item .note { color: var(--dim); font-size: 12px; margin-top: 3px; }
  .tag { display: inline-block; font-size: 10px; font-weight: 700; text-transform: uppercase;
    letter-spacing: .5px; padding: 2px 7px; border-radius: 5px; margin-right: 8px; vertical-align: middle; }
  .tag.auto_executed { background: rgba(34,211,165,.14); color: var(--good); }
  .tag.needs_approval { background: rgba(245,158,11,.14); color: var(--warn); }
  .tag.escalated { background: rgba(239,68,68,.14); color: var(--bad); }
  .tag.resolved { background: rgba(99,102,241,.16); color: var(--accent2); }
  .ev { font-family: var(--mono); font-size: 11.5px; padding: 5px 18px; border-bottom: 1px solid var(--line);
    display: flex; gap: 10px; animation: flash .9s ease-out; }
  .ev .t { color: var(--dim); white-space: nowrap; }
  .ev .topic { color: var(--accent2); }
  @keyframes flash { from { background: rgba(99,102,241,.14); } to { background: transparent; } }
  @keyframes shimmer { 0%,100% { opacity:.35; } 50% { opacity:.7; } }
  .skeleton { animation: shimmer 1.6s infinite; background: var(--line); border-radius: 4px; }
  .empty { color: var(--dim); padding: 18px 18px; font-style: italic; font-size: 13px; }
  .diag { grid-column: 1 / -1; }
  .diag .controls { display: flex; gap: 10px; padding: 13px 18px; border-bottom: 1px solid var(--line); }
  .diag input { flex: 1; background: var(--bg); border: 1px solid var(--line); color: var(--ink);
    border-radius: 8px; padding: 8px 12px; font-size: 13px; font-family: var(--sans); }
  .diag input:focus { outline: 0; border-color: var(--accent); box-shadow: 0 0 0 3px rgba(99,102,241,.15); }
  .fact { display: grid; grid-template-columns: 92px 56px 1fr; gap: 12px; align-items: baseline;
    padding: 8px 18px; border-bottom: 1px solid var(--line); font-size: 13px; }
  .fact:last-child { border-bottom: 0; }
  .src { font-family: var(--mono); font-size: 10px; font-weight: 700; text-transform: uppercase;
    letter-spacing: .5px; padding: 2px 6px; border-radius: 5px; text-align: center; }
  .src.graph { background: rgba(99,102,241,.16); color: var(--accent2); }
  .src.vector { background: rgba(34,211,165,.14); color: var(--good); }
  .src.semantic { background: rgba(245,158,11,.14); color: var(--warn); }
  .src.aggregate { background: rgba(136,136,170,.14); color: var(--dim); }
  .score { font-family: var(--mono); color: var(--dim); font-size: 12px; }
  .grounded { font-size: 11px; color: var(--good); }
  .briefing { padding: 11px 24px; border-bottom: 1px solid var(--line); font-size: 13.5px;
    background: linear-gradient(90deg, rgba(99,102,241,.12), transparent); }
  .briefing.urgent { background: linear-gradient(90deg, rgba(239,68,68,.16), transparent); }
  .briefing.attention { background: linear-gradient(90deg, rgba(245,158,11,.14), transparent); }
  .briefing b { color: var(--accent2); }
  button.demo {
    margin-left: 8px; background: var(--accent); color: #fff; border: 0; font-weight: 600;
    padding: 7px 14px; border-radius: 8px; cursor: pointer; font-size: 12px; font-family: var(--sans);
    transition: filter .15s, transform .1s;
  }
  button.demo:hover { filter: brightness(1.15); transform: translateY(-1px); }
  button.demo:active { transform: translateY(0); filter: brightness(.95); }
  button.demo:disabled { opacity: .45; cursor: default; transform: none; }
  /* Company Health hero */
  .health { grid-column: 1 / -1; }
  .health .body { max-height: none; padding: 16px 18px; }
  .health-top { display: flex; align-items: center; gap: 24px; margin-bottom: 16px; flex-wrap: wrap; }
  .health-ring { position: relative; width: 90px; height: 90px; flex-shrink: 0; }
  .health-ring svg { transform: rotate(-90deg); }
  .health-ring .ring-bg { fill: none; stroke: var(--line); stroke-width: 7; }
  .health-ring .ring-fill { fill: none; stroke-width: 7; stroke-linecap: round; transition: stroke-dashoffset .6s cubic-bezier(.4,0,.2,1), stroke .3s; }
  .health-ring .ring-label { position: absolute; inset: 0; display: flex; flex-direction: column;
    align-items: center; justify-content: center; font-family: var(--mono); }
  .health-ring .ring-num { font-size: 20px; font-weight: 700; line-height: 1; }
  .health-ring .ring-max { font-size: 9px; color: var(--dim); }
  .health-headline { color: var(--dim); font-size: 13px; flex: 1; min-width: 200px; line-height: 1.5; }
  .grade { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: .6px;
    padding: 4px 11px; border-radius: 6px; }
  .grade.excellent { background: rgba(34,211,165,.16); color: var(--good); }
  .grade.good { background: rgba(99,102,241,.16); color: var(--accent2); }
  .grade.fair { background: rgba(245,158,11,.16); color: var(--warn); }
  .grade.poor { background: rgba(245,158,11,.16); color: #f59e42; }
  .grade.critical { background: rgba(239,68,68,.16); color: var(--bad); }
  .dim-row { margin: 9px 0; }
  .dim-row .lbl { display: flex; justify-content: space-between; font-size: 12px; margin-bottom: 4px; }
  .dim-row .lbl .nm { color: var(--ink); font-weight: 500; }
  .dim-row .lbl .sc { font-family: var(--mono); color: var(--dim); }
  .dim-row .track { background: var(--bg); border-radius: 6px; height: 7px; overflow: hidden; }
  .dim-row .fill { height: 100%; border-radius: 6px; background: var(--accent); transition: width .5s cubic-bezier(.4,0,.2,1); }
  .dim-row .detail { font-size: 11px; color: var(--dim); margin-top: 3px; }
  /* Core business modules (finance/pipeline/etc.) */
  .modules { grid-column: 1 / -1; }
  .module-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
    gap: 12px; padding: 16px 18px; }
  .module-card {
    background: var(--bg); border: 1px solid var(--line); border-radius: 10px; padding: 13px 15px;
    transition: border-color .2s, transform .15s;
  }
  .module-card:hover { border-color: var(--accent); transform: translateY(-2px); }
  .module-card .mt { font-size: 10px; text-transform: uppercase; letter-spacing: .7px; color: var(--dim); font-weight: 600; }
  .module-card .mv { font-family: var(--mono); font-size: 21px; font-weight: 700; margin: 5px 0 3px; color: var(--ink); }
  .module-card .ms { font-size: 11px; color: var(--dim); }
  /* Business Operations section */
  .biz-ops { grid-column: 1 / -1; }
  .biz-ops-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
    gap: 14px; padding: 16px 18px; }
  .biz-card {
    background: var(--bg); border: 1px solid var(--line); border-radius: 12px; padding: 16px 18px;
    display: flex; flex-direction: column; gap: 12px;
    transition: border-color .2s, transform .15s, box-shadow .2s;
    cursor: default;
  }
  .biz-card:hover { border-color: var(--accent); transform: translateY(-2px); box-shadow: 0 6px 24px rgba(99,102,241,.12); }
  .biz-card-head { display: flex; align-items: center; justify-content: space-between; }
  .biz-card-title { font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: .7px; color: var(--dim); display: flex; align-items: center; gap: 7px; }
  .biz-card-title .ic { font-size: 16px; }
  .biz-status { width: 9px; height: 9px; border-radius: 50%; flex-shrink: 0; }
  .biz-status.green { background: var(--good); box-shadow: 0 0 6px var(--good); }
  .biz-status.yellow { background: var(--warn); box-shadow: 0 0 6px var(--warn); }
  .biz-status.red { background: var(--bad); box-shadow: 0 0 6px var(--bad); }
  .biz-metrics { display: flex; gap: 18px; }
  .biz-metric { display: flex; flex-direction: column; }
  .biz-metric .bm-val { font-family: var(--mono); font-size: 22px; font-weight: 700; color: var(--ink); line-height: 1.1; }
  .biz-metric .bm-lbl { font-size: 10px; color: var(--dim); text-transform: uppercase; letter-spacing: .5px; margin-top: 2px; }
  .biz-skeleton { display: flex; gap: 12px; }
  .biz-skeleton .sk { height: 32px; border-radius: 6px; }
  /* Board Report modal */
  .overlay { position: fixed; inset: 0; background: rgba(0,0,4,.75); display: none;
    align-items: center; justify-content: center; z-index: 20; padding: 24px; backdrop-filter: blur(4px); }
  .overlay.open { display: flex; }
  .modal { background: var(--panel); border: 1px solid var(--line); border-radius: 14px;
    width: 100%; max-width: 880px; max-height: 88vh; display: flex; flex-direction: column; overflow: hidden;
    box-shadow: 0 24px 64px rgba(0,0,0,.6); }
  .modal-head { display: flex; align-items: center; justify-content: space-between; padding: 15px 22px;
    border-bottom: 1px solid var(--line); }
  .modal-head h2 { margin: 0; font-size: 15px; letter-spacing: .2px; color: var(--ink); font-weight: 700; }
  .modal-close { background: transparent; border: 0; color: var(--dim); font-size: 24px; line-height: 1;
    cursor: pointer; padding: 0 4px; transition: color .15s; }
  .modal-close:hover { color: var(--ink); }
  .report-body { padding: 20px 26px; overflow-y: auto; font-size: 13.5px; }
  .report-body h1 { font-size: 22px; color: var(--accent2); margin: 0 0 12px; }
  .report-body h2 { font-size: 17px; color: var(--ink); margin: 22px 0 9px; padding: 0;
    border: 0; text-transform: none; letter-spacing: 0; }
  .report-body h3 { font-size: 14px; color: var(--accent2); margin: 16px 0 6px; }
  .report-body p { margin: 8px 0; }
  .report-body ul { margin: 8px 0; padding-left: 22px; }
  .report-body li { margin: 3px 0; }
  .report-body strong { color: var(--ink); font-weight: 700; }
  .report-body table { border-collapse: collapse; width: 100%; margin: 12px 0; font-size: 12.5px; }
  .report-body th, .report-body td { border: 1px solid var(--line); padding: 7px 11px; text-align: left; }
  .report-body th { color: var(--dim); text-transform: uppercase; letter-spacing: .4px; font-size: 11px; }
</style>
</head>
<body>
<header>
  <h1>Olympus <span>OS</span></h1>
  <span class="sub">Autonomous Business Operating System</span>
  <button class="demo" id="run">Run decision</button>
  <button class="demo" id="report-btn">Board Report</button>
  <span class="pill"><span class="dot" id="dot"></span><span id="status">connecting…</span></span>
</header>
<div id="briefing" class="briefing"></div>
<main>
  <section class="panel health">
    <h2><span class="icon">◎</span> Company Health <span id="health-grade-slot" class="sub"></span></h2>
    <div class="body" id="health"><div class="empty">Loading company health…</div></div>
  </section>
  <section class="panel modules">
    <h2><span class="icon">▦</span> Business Modules <span class="sub">live</span></h2>
    <div class="module-grid" id="modules"><div class="empty">Loading modules…</div></div>
  </section>
  <section class="panel biz-ops">
    <h2><span class="icon">⚙</span> Business Operations <span class="sub">live · refreshes 30s</span></h2>
    <div class="biz-ops-grid" id="biz-ops">
      <div class="biz-card"><div class="biz-skeleton"><div class="skeleton sk" style="width:60px"></div><div class="skeleton sk" style="width:90px"></div></div></div>
    </div>
  </section>
  <section class="panel">
    <h2><span class="icon">✉</span> Decision Inbox <span id="inbox-count" class="sub"></span></h2>
    <div class="stats" id="stats"></div>
    <div class="body" id="inbox"><div class="empty">No decisions yet.</div></div>
  </section>
  <section class="panel">
    <h2><span class="icon">∿</span> Event Spine <span class="sub">live</span></h2>
    <div class="body" id="events"><div class="empty">Waiting for events…</div></div>
  </section>
  <section class="panel diag">
    <h2><span class="icon">◈</span> GraphRAG Diagnosis <span id="grounded" class="grounded"></span></h2>
    <div class="controls">
      <input id="q" type="text" value="why did mid-market churn rise onboarding"
        placeholder="Ask a grounded question…" />
      <button class="demo" id="diagnose">Diagnose</button>
    </div>
    <div class="body" id="facts"><div class="empty">Run a diagnosis to see the grounded context bundle.</div></div>
  </section>
</main>
<div class="overlay" id="report-overlay">
  <div class="modal">
    <div class="modal-head">
      <h2>Executive Board Report</h2>
      <button class="modal-close" id="report-close" aria-label="Close">×</button>
    </div>
    <div class="report-body" id="report-body"><div class="empty">Loading report…</div></div>
  </div>
</div>
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
  ['decision.opened','decision.session.opened','decision.session.resolved','decision.reconciled',
   'agent.proposed','agent.challenged','agent.supported','agent.escalated',
   'sim.requested','sim.completed','action.gated','action.executed',
   'autonomy.granted','autonomy.revoked','okg.node.versioned','okg.edge.added',
   'memory.episode.recorded','audit.recorded']
    .forEach((t) => es.addEventListener(t, (e) => {
      try { addEvent(JSON.parse(e.data)); } catch (_) {}
      if (t.startsWith('decision.') || t === 'action.gated') { refreshInbox(); refreshBriefing(); refreshHealth(); refreshModules(); refreshBizOps(); }
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
  } finally { btn.disabled = false; btn.textContent = 'Run decision'; refreshInbox(); }
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

const GRADE_COLOR = { excellent: 'var(--good)', good: 'var(--accent2)', fair: 'var(--warn)',
  poor: '#f59e42', critical: 'var(--bad)' };

async function refreshHealth() {
  try {
    const h = await (await fetch('/v1/health')).json();
    const grade = String(h.grade || '').toLowerCase();
    const color = GRADE_COLOR[grade] || 'var(--accent2)';
    const composite = (typeof h.composite === 'number') ? h.composite : 0;
    const compositeStr = composite.toFixed(1);
    $('health-grade-slot').innerHTML = grade
      ? '<span class="grade ' + esc(grade) + '">' + esc(grade) + '</span>' : '';

    // SVG ring: circumference of r=36 circle ≈ 226.2
    const r = 36; const circ = 2 * Math.PI * r;
    const offset = circ - (composite / 100) * circ;
    const ring =
      '<svg width="90" height="90" viewBox="0 0 90 90">' +
        '<circle class="ring-bg" cx="45" cy="45" r="' + r + '"/>' +
        '<circle class="ring-fill" cx="45" cy="45" r="' + r + '"' +
          ' stroke="' + color + '"' +
          ' stroke-dasharray="' + circ.toFixed(1) + '"' +
          ' stroke-dashoffset="' + offset.toFixed(1) + '"/>' +
      '</svg>' +
      '<div class="ring-label">' +
        '<span class="ring-num" style="color:' + color + '">' + compositeStr + '</span>' +
        '<span class="ring-max">/100</span>' +
      '</div>';

    const dims = Array.isArray(h.dimensions) ? h.dimensions : [];
    $('health').innerHTML =
      '<div class="health-top">' +
        '<div class="health-ring">' + ring + '</div>' +
        '<div class="health-headline">' + esc(h.headline || '') + '</div>' +
      '</div>' +
      (dims.length
        ? dims.map((d) => {
            const score = Math.max(0, Math.min(100, Number(d.score) || 0));
            return '<div class="dim-row">' +
              '<div class="lbl"><span class="nm">' + esc(d.name) + '</span>' +
              '<span class="sc">' + score.toFixed(0) + '</span></div>' +
              '<div class="track"><div class="fill" style="width:' + score + '%;background:' + color + '"></div></div>' +
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
function pct(n) { return (typeof n === 'number' && isFinite(n)) ? n.toFixed(1) + '%' : '—'; }
function num(n) { return (typeof n === 'number' && isFinite(n)) ? String(n) : '—'; }

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

function bizCard(icon, title, metrics, statusColor) {
  const mHtml = metrics.map((m) =>
    '<div class="biz-metric"><div class="bm-val">' + m[0] + '</div><div class="bm-lbl">' + esc(m[1]) + '</div></div>'
  ).join('');
  return '<div class="biz-card">' +
    '<div class="biz-card-head">' +
      '<div class="biz-card-title"><span class="ic">' + icon + '</span>' + esc(title) + '</div>' +
      '<span class="biz-status ' + statusColor + '"></span>' +
    '</div>' +
    '<div class="biz-metrics">' + mHtml + '</div>' +
  '</div>';
}

async function refreshBizOps() {
  const get = async (path) => { try { return await (await fetch(path)).json(); } catch (e) { return null; } };
  const [support, pipeline, marketing, forecast, comms, incidents] = await Promise.all([
    get('/v1/support'), get('/v1/data-pipeline'), get('/v1/marketing'),
    get('/v1/forecast'), get('/v1/comms'), get('/v1/incidents'),
  ]);
  const cards = [];

  // Support Tickets
  if (support && support.metrics) {
    const m = support.metrics;
    const open = m.openTickets != null ? num(m.openTickets) : (m.byStatus && m.byStatus.open != null ? num(m.byStatus.open) : '—');
    const csat = (typeof m.avgCsat === 'number') ? m.avgCsat.toFixed(1) : '—';
    const status = (typeof m.openTickets === 'number' && m.openTickets > 10) ? 'yellow' : 'green';
    cards.push(bizCard('🎫', 'Support Tickets', [[open, 'open tickets'], [csat, 'avg CSAT']], status));
  } else { cards.push(bizCard('🎫', 'Support Tickets', [['—', 'no data']], 'yellow')); }

  // Data Pipeline
  if (pipeline && pipeline.summary) {
    const s = pipeline.summary;
    const total = num(s.totalPipelines);
    const healthy = num(s.healthyPipelines != null ? s.healthyPipelines : s.activePipelines);
    const status = (s.failedPipelines > 0) ? 'red' : 'green';
    cards.push(bizCard('⚡', 'Data Pipeline', [[total, 'pipelines'], [healthy, 'healthy']], status));
  } else { cards.push(bizCard('⚡', 'Data Pipeline', [['—', 'no data']], 'yellow')); }

  // Marketing Attribution
  if (marketing && marketing.summary) {
    const s = marketing.summary;
    const conv = num(s.totalConversions);
    const roi = (typeof s.overallRoi === 'number') ? s.overallRoi.toFixed(1) + 'x' : '—';
    const status = (typeof s.overallRoi === 'number' && s.overallRoi >= 2) ? 'green' : 'yellow';
    cards.push(bizCard('📣', 'Marketing', [[conv, 'conversions'], [roi, 'ROI']], status));
  } else { cards.push(bizCard('📣', 'Marketing', [['—', 'no data']], 'yellow')); }

  // Forecasting
  if (Array.isArray(forecast) && forecast.length > 0) {
    const f = forecast[0];
    const endArr = (f.projections && f.projections.length)
      ? money(f.projections[f.projections.length - 1].arrUsd) : '—';
    cards.push(bizCard('📈', 'Forecasting', [[num(forecast.length), 'scenarios'], [endArr, 'end ARR']], 'green'));
  } else { cards.push(bizCard('📈', 'Forecasting', [['—', 'no data']], 'yellow')); }

  // Communications
  if (comms && comms.summary) {
    const s = comms.summary;
    const active = num(s.activeSequences);
    const replyRate = pct(s.avgReplyRate);
    const status = (typeof s.avgReplyRate === 'number' && s.avgReplyRate >= 5) ? 'green' : 'yellow';
    cards.push(bizCard('✉', 'Comms', [[active, 'active sequences'], [replyRate, 'avg reply rate']], status));
  } else { cards.push(bizCard('✉', 'Comms', [['—', 'no data']], 'yellow')); }

  // Incidents
  if (incidents) {
    const open = Array.isArray(incidents.open) ? num(incidents.open.length) : '—';
    const mttr = (incidents.metrics && typeof incidents.metrics.mttrMs === 'number')
      ? (incidents.metrics.mttrMs / 3600000).toFixed(1) + 'h' : '—';
    const status = (Array.isArray(incidents.open) && incidents.open.length > 0) ? 'yellow' : 'green';
    cards.push(bizCard('🚨', 'Incidents', [[open, 'open'], [mttr, 'MTTR']], status));
  } else { cards.push(bizCard('🚨', 'Incidents', [['—', 'no data']], 'yellow')); }

  $('biz-ops').innerHTML = cards.join('');
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

function mdInline(s) {
  let out = esc(s);
  out = out.replace(/\\*\\*([^*]+)\\*\\*/g, '<strong>$1</strong>');
  out = out.replace(/_([^_]+)_/g, '<em>$1</em>');
  return out;
}

function renderMarkdown(md) {
  const lines = String(md).replace(/\\r\\n/g, '\\n').split('\\n');
  const out = [];
  let para = [];
  let list = [];
  const flushPara = () => {
    if (para.length) { out.push('<p>' + para.map(mdInline).join(' ') + '</p>'); para = []; }
  };
  const flushList = () => {
    if (list.length) { out.push('<ul>' + list.map((li) => '<li>' + mdInline(li) + '</li>').join('') + '</ul>'); list = []; }
  };
  const isTableSep = (l) => /^\\s*\\|?\\s*:?-{2,}:?\\s*(\\|\\s*:?-{2,}:?\\s*)+\\|?\\s*$/.test(l);
  const cells = (l) => l.trim().replace(/^\\|/, '').replace(/\\|$/, '').split('|').map((c) => c.trim());
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const t = line.trim();
    if (t.startsWith('|') && i + 1 < lines.length && isTableSep(lines[i + 1])) {
      flushPara(); flushList();
      const header = cells(t);
      i += 2;
      const rows = [];
      while (i < lines.length && lines[i].trim().startsWith('|')) { rows.push(cells(lines[i].trim())); i++; }
      i--;
      out.push('<table><thead><tr>' + header.map((c) => '<th>' + mdInline(c) + '</th>').join('') + '</tr></thead><tbody>' +
        rows.map((r) => '<tr>' + r.map((c) => '<td>' + mdInline(c) + '</td>').join('') + '</tr>').join('') +
        '</tbody></table>');
      continue;
    }
    if (t === '') { flushPara(); flushList(); continue; }
    let m;
    if ((m = /^(#{1,3})\\s+(.*)$/.exec(t))) {
      flushPara(); flushList();
      const lvl = m[1].length;
      out.push('<h' + lvl + '>' + mdInline(m[2]) + '</h' + lvl + '>');
      continue;
    }
    if ((m = /^[-*]\\s+(.*)$/.exec(t))) { flushPara(); list.push(m[1]); continue; }
    flushList();
    para.push(t);
  }
  flushPara(); flushList();
  return out.join('\\n');
}

const reportOverlay = $('report-overlay');
function closeReport() { reportOverlay.classList.remove('open'); }
$('report-btn').onclick = async () => {
  reportOverlay.classList.add('open');
  $('report-body').innerHTML = '<div class="empty">Loading report…</div>';
  try {
    const res = await fetch('/v1/report');
    const md = await res.text();
    $('report-body').innerHTML = renderMarkdown(md);
  } catch (e) {
    $('report-body').innerHTML = '<div class="empty">Report unavailable.</div>';
  }
};
$('report-close').onclick = closeReport;
reportOverlay.onclick = (e) => { if (e.target === reportOverlay) closeReport(); };
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeReport(); });

refreshInbox();
refreshBriefing();
refreshHealth();
refreshModules();
refreshBizOps();
setInterval(() => { refreshHealth(); refreshModules(); refreshBizOps(); }, 30000);
connect();
</script>
</body>
</html>`;
