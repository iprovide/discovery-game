// The playtest feedback box.
//
// Deliberately plain DOM rather than a Phaser scene, for three reasons: Phaser
// has no native text input, a DOM overlay still works if the game itself has
// thrown, and a real <textarea> gets the browser's spellcheck, selection and
// mobile keyboard for free.
//
// What makes a report useful is not the prose, it is the run attached to it.
// "packing felt fiddly" is worth very little; "packing felt fiddly" next to
// *eleven documents in an all-hands box on a broad request* is a design note.
// So every report carries the state of the run, and the tester can see exactly
// what is being attached before they send it — no silent telemetry.

import state from './gameState.js';

// ---------------------------------------------------------------- config

// Where reports go. Empty means "no endpoint yet": the box still works and
// falls back to putting the report on the clipboard for the tester to paste
// back to whoever gave them the link.
//
// To wire it up, paste a form endpoint here — Formspree, Formspark, Basin, a
// Google Apps Script web app, anything that accepts a JSON POST. Nothing else
// in the game needs to change.
export const FEEDBACK_ENDPOINT = '';

// Deliberately not a mailto: address. This repository is public, and putting a
// real inbox in it publishes that address to every scraper on the internet.
const CONTACT_HINT = 'send it back to whoever gave you this link';

const MAX_ERRORS = 6;

// --------------------------------------------------------- error capture

// A small ring buffer, so a report can carry what the console said. This is
// what turns a feedback box into a bug reporter.
const recentErrors = [];
function noteError(kind, text) {
  recentErrors.push(`[${kind}] ${String(text).slice(0, 400)}`);
  while (recentErrors.length > MAX_ERRORS) recentErrors.shift();
}

let game = null;
export function attachGame(instance) {
  game = instance;
}

export function installErrorCapture() {
  window.addEventListener('error', (e) => noteError('error', e.message));
  window.addEventListener('unhandledrejection', (e) => noteError('promise', e.reason));
  const original = console.error;
  console.error = (...args) => {
    noteError('console', args.map((a) => (a && a.stack) || a).join(' '));
    original.apply(console, args);
  };
}

// --------------------------------------------------------------- context

// Unspecified fields are the majority of a broad request and say nothing; the
// report is easier to read without them.
function cleanRequest(request) {
  if (!request) return null;
  const out = {};
  Object.entries(request).forEach(([k, v]) => {
    if (Array.isArray(v) ? v.length : v) out[k] = v;
  });
  return Object.keys(out).length ? out : null;
}

function activeSceneKey() {
  if (!game || !game.scene) return 'unknown';
  const running = game.scene.getScenes(true);
  return running.length ? running[running.length - 1].scene.key : 'none';
}

// Everything worth knowing about the run, and nothing that would bloat the
// payload — lastResult carries full document layouts and window lists, so only
// its headline numbers come along.
export function collectContext() {
  const r = state.lastResult;
  const plan = state.plan || {};
  return {
    build: typeof __BUILD__ === 'string' ? __BUILD__ : 'dev',
    when: new Date().toISOString(),
    screen: activeSceneKey(),
    caseIndex: state.caseIndex,
    attempt: state.attempt,
    money: state.money,
    request: cleanRequest(state.request),
    plan: { tier: plan.tierId || null, style: plan.styleId || null },
    packedCount: Array.isArray(state.packed) ? state.packed.length : null,
    packing: state.packingSnapshot,
    result: r
      ? {
          net: r.net,
          gross: r.gross,
          laborCost: r.laborCost,
          productionCost: r.productionCost,
          box: r.box,
          packed: r.stats.assignedCount,
          leftOnCart: r.stats.unreadCount,
          finds: r.stats.capturedZones,
          missedWrongKind: r.stats.missedWrongKind,
          missedInAssigned: r.stats.missedInAssigned,
          missedUnread: r.stats.missedUnread
        }
      : null,
    viewport: `${window.innerWidth}x${window.innerHeight}`,
    agent: navigator.userAgent,
    errors: recentErrors.slice()
  };
}

// The human-readable version — what the tester sees in the panel, and what
// goes on the clipboard when there is no endpoint.
function contextSummary(ctx) {
  const lines = [];
  lines.push(`screen: ${ctx.screen}`);
  if (ctx.plan.tier) lines.push(`plan: ${ctx.plan.tier} / ${ctx.plan.style}`);
  if (ctx.packing) {
    const b = ctx.packing;
    lines.push(`box: ${b.packed} packed / ${b.onCart} on the cart, ${b.box} at ${b.fill}% — ${b.depth}`);
  } else if (ctx.packedCount !== null) {
    lines.push(`packed: ${ctx.packedCount}`);
  }
  if (ctx.request) lines.push(`request: ${JSON.stringify(ctx.request)}`);
  if (ctx.result) lines.push(`result: net $${ctx.result.net}, ${ctx.result.finds} finds`);
  if (ctx.errors.length) lines.push(`errors: ${ctx.errors.length}`);
  lines.push(`build: ${ctx.build}`);
  return lines.join('\n');
}

// ------------------------------------------------------------------ ui

const CSS = `
.dfb-btn{position:fixed;right:14px;bottom:12px;z-index:50;font:14px Georgia,'Times New Roman',serif;
 color:#f2ede1;background:#2f3646;border:2px solid #39425a;padding:7px 14px;cursor:pointer}
.dfb-btn:hover{background:#3c4658}
.dfb-shield{position:fixed;inset:0;z-index:100;background:rgba(0,0,0,.66);display:flex;
 align-items:center;justify-content:center}
.dfb-panel{width:min(560px,92vw);max-height:88vh;overflow:auto;background:#1f2430;border:2px solid #39425a;
 padding:20px 22px;font:15px Georgia,'Times New Roman',serif;color:#f2ede1}
.dfb-panel h2{margin:0 0 4px;font-size:21px;font-weight:normal}
.dfb-panel p{margin:0 0 14px;font-size:13px;color:#9aa3b8;line-height:1.5}
.dfb-panel label{display:block;font-size:12px;color:#9aa3b8;margin:12px 0 4px}
.dfb-panel input,.dfb-panel textarea{width:100%;box-sizing:border-box;background:#14171f;color:#f2ede1;
 border:1px solid #39425a;padding:8px;font:14px Georgia,'Times New Roman',serif}
.dfb-panel textarea{min-height:132px;resize:vertical}
.dfb-ctx{margin-top:12px;font-size:12px;color:#9aa3b8}
.dfb-ctx pre{white-space:pre-wrap;word-break:break-word;background:#14171f;border:1px solid #39425a;
 padding:8px;margin:6px 0 0;font:11px ui-monospace,Menlo,Consolas,monospace;color:#8f9ab0}
.dfb-row{display:flex;gap:10px;justify-content:flex-end;margin-top:16px}
.dfb-row button{font:15px Georgia,'Times New Roman',serif;color:#f2ede1;background:#2f3646;
 border:2px solid #39425a;padding:8px 18px;cursor:pointer}
.dfb-row button:hover{background:#3c4658}
.dfb-row button.dfb-go{background:#4b6340}
.dfb-note{margin-top:10px;font-size:13px;min-height:18px}
.dfb-ok{color:#8fbf6b}.dfb-bad{color:#d97b6c}
`;

let panel = null;

function close() {
  if (!panel) return;
  panel.remove();
  panel = null;
  // Phaser listens for keys on the window, so R would rotate a document while
  // you were typing the word "rotate" into the box.
  if (game && game.input && game.input.keyboard) game.input.keyboard.enabled = true;
}

function open() {
  if (panel) return;
  if (game && game.input && game.input.keyboard) game.input.keyboard.enabled = false;

  const ctx = collectContext();
  const shield = document.createElement('div');
  shield.className = 'dfb-shield';
  shield.innerHTML = `
    <div class="dfb-panel" role="dialog" aria-label="Send feedback">
      <h2>How's it going?</h2>
      <p>Anything at all — what felt good, what felt like a chore, what you expected to happen
      and didn't. Rough notes are more useful than tidy ones.</p>
      <label for="dfb-who">Who are you? (optional)</label>
      <input id="dfb-who" autocomplete="off" />
      <label for="dfb-text">What happened?</label>
      <textarea id="dfb-text" placeholder="e.g. packing four documents by hand felt like the real decision, but I only tried it because I read the tooltip…"></textarea>
      <div class="dfb-ctx">Attached automatically, so you don't have to describe your setup:
        <pre id="dfb-ctx"></pre>
      </div>
      <div class="dfb-note" id="dfb-note"></div>
      <div class="dfb-row">
        <button id="dfb-cancel">Cancel</button>
        <button id="dfb-send" class="dfb-go">Send</button>
      </div>
    </div>`;
  document.body.appendChild(shield);
  panel = shield;

  shield.querySelector('#dfb-ctx').textContent = contextSummary(ctx);
  const note = shield.querySelector('#dfb-note');
  const text = shield.querySelector('#dfb-text');
  const who = shield.querySelector('#dfb-who');
  text.focus();

  shield.addEventListener('pointerdown', (e) => {
    if (e.target === shield) close();
  });
  shield.querySelector('#dfb-cancel').onclick = close;

  shield.querySelector('#dfb-send').onclick = async () => {
    const message = text.value.trim();
    if (!message) {
      note.className = 'dfb-note dfb-bad';
      note.textContent = 'Type something first.';
      return;
    }
    const payload = { message, from: who.value.trim() || 'anonymous', ...ctx };
    note.className = 'dfb-note';
    note.textContent = 'Sending…';

    if (FEEDBACK_ENDPOINT) {
      try {
        const res = await fetch(FEEDBACK_ENDPOINT, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify(payload)
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        note.className = 'dfb-note dfb-ok';
        note.textContent = 'Sent. Thank you — that genuinely helps.';
        setTimeout(close, 1200);
        return;
      } catch (err) {
        noteError('feedback', err.message);
        // Fall through to the clipboard rather than losing what they wrote.
      }
    }

    const report = `${payload.from}: ${message}\n\n---\n${contextSummary(ctx)}`;
    try {
      await navigator.clipboard.writeText(report);
      note.className = 'dfb-note dfb-ok';
      note.textContent = `Copied to your clipboard — ${CONTACT_HINT}.`;
    } catch {
      text.value = report;
      text.select();
      note.className = 'dfb-note dfb-bad';
      note.textContent = `Couldn't reach the clipboard. Copy the text above and ${CONTACT_HINT}.`;
    }
  };
}

export function installFeedbackBox() {
  const style = document.createElement('style');
  style.textContent = CSS;
  document.head.appendChild(style);

  const btn = document.createElement('button');
  btn.className = 'dfb-btn';
  btn.textContent = 'Feedback';
  btn.title = 'Tell us how it is going (F)';
  btn.onclick = open;
  document.body.appendChild(btn);

  // A hotkey too, because the interesting moment to report something is
  // usually mid-thought and reaching for the corner loses it.
  window.addEventListener('keydown', (e) => {
    if (panel) {
      if (e.key === 'Escape') close();
      return;
    }
    const typing = e.target && /^(INPUT|TEXTAREA)$/.test(e.target.tagName);
    if (typing || e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.key === 'f' || e.key === 'F') {
      // Without this the keystroke that opened the panel lands in the
      // textarea, and every report starts with a stray "f".
      e.preventDefault();
      open();
    }
  });
}
