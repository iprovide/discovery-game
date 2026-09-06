// Balance harness: sweeps requests x labor plans through the real engine.
// Run: node tools/sweep.mjs [samples]
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { estimateOutcome, resolvePlan, retrieve } from '../src/systems/scanEngine.js';
import { autoPack, boxOf } from '../src/systems/packing.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const caseData = JSON.parse(
  fs.readFileSync(path.join(here, '../src/data/cases/case-01.json'), 'utf8')
);
const SAMPLES = Number(process.argv[2] || 120);

// Phase 3: the sweep packs with autoPack — THE SAME FUNCTION the "let the
// paralegals sort it" button calls — so what the harness measures is a box a
// player could actually have packed. Hand-packing should beat these numbers a
// little; if it ever beats them a lot, autoPack is too dumb to be a default.
// Skill (Phase 3B) is a bounded multiplier on the effort pool, so the sweep
// runs at x1.0 and reports the ends.
const SKILL_FLOOR = 0.8;
const SKILL_CEIL = 1.35;

const requests = {
  'broad     (emails, Jun 1)': { docType: 'email', dateAfter: '2026-06-01' },
  'broad+dcy (emails + photographs, Jun 1)': {
    docType: ['email', 'photograph'],
    dateAfter: '2026-06-01'
  },
  'mid       (emails, Jul 1, WRAPGUARD)': { docType: 'email', dateAfter: '2026-07-01', label: 'wrapguard' },
  'narrow    (+ Hollow Oak)': { docType: 'email', dateAfter: '2026-07-01', location: 'hollow-oak', label: 'wrapguard' },
  'overnarrow(+ custodian)': { docType: 'email', dateAfter: '2026-07-01', location: 'hollow-oak', label: 'wrapguard', custodian: 'beatrice-badger' },
  'memos     (memo, Jun 1)': { docType: ['memo'], dateAfter: '2026-06-01' },
  'texts     (text-message, Jun 1)': { docType: ['text-message'], dateAfter: '2026-06-01' },
  'two types (email + memo, Jul 1, WRAPGUARD)': {
    docType: ['email', 'memo'],
    dateAfter: '2026-07-01',
    label: 'wrapguard'
  },
  'long-form (memo + report + photo, Jun 1)': {
    docType: ['memo', 'test-report', 'photograph'],
    dateAfter: '2026-06-01'
  },
  'everything(all six types, Jun 1)': {
    docType: ['email', 'memo', 'test-report', 'invoice', 'photograph', 'text-message'],
    dateAfter: '2026-06-01'
  }
};

const sc = caseData.scoringConfig;
const plans = [];
sc.laborTiers.forEach((t) =>
  sc.readingStyles.forEach((r) => plans.push({ tierId: t.id, styleId: r.id }))
);

// THE PACKING AXIS. Deleting Spread deleted the harness's only view of the
// breadth/depth trade, so it has to come back as what the player actually
// does: put fewer documents in the box and each one gets read harder. These
// are the old notches expressed physically — fill it, half-fill it, take a
// handful — and every one of them is a box autoPack could produce, because it
// IS autoPack, run over a truncated pile.
const PACK_MODES = [
  { id: 'full', frac: 1 },
  { id: 'half', frac: 0.5 },
  { id: 'deep', frac: 0.25 }
];

function packFor(caseData, request, tier, mode) {
  const box = boxOf(tier);
  const retrieved = retrieve(caseData.documentPool, request);
  const full = autoPack(retrieved, box);
  const keep = Math.max(1, Math.ceil(full.packed.length * mode.frac));
  if (keep >= full.packed.length) return { pack: full, retrieved, box };
  const subset = full.packedDocs.slice(0, keep);
  return { pack: autoPack(subset, box), retrieved, box };
}

const pad = (s, n) => String(s).padEnd(n);
const money = (n) => `$${Math.round(n)}`;

const rowsFor = (request) => {
  const rows = [];
  plans.forEach((plan) => {
    const tier = sc.laborTiers.find((t) => t.id === plan.tierId);
    PACK_MODES.forEach((mode) => {
      const { pack, retrieved, box } = packFor(caseData, request, tier, mode);
      const est = estimateOutcome({ caseData, request, plan, packed: pack.packed, samples: SAMPLES });
      const labor = resolvePlan(caseData, plan, { packedCount: pack.packed.length });
      rows.push({ plan, mode, est, labor, pack, retrieved, box });
    });
  });
  return rows;
};

for (const [name, request] of Object.entries(requests)) {
  console.log(`\n=== ${name} ===`);
  const rows = rowsFor(request);
  rows.sort((a, b) => b.est.median - a.est.median);
  rows.slice(0, 5).forEach((r) => {
    console.log(
      `  ${pad(`${r.plan.tierId}/${r.plan.styleId}/${r.mode.id}`, 26)}` +
        `${pad(`${r.box.w}x${r.box.h} ${r.pack.packed.length}/${r.retrieved.length}d x ${r.labor.windowsPerDocument}p @${r.labor.windowWidth}`, 26)}` +
        `med ${pad(money(r.est.median), 7)} p10-p90 ${pad(`${money(r.est.p10)}-${money(r.est.p90)}`, 16)}` +
        `clears ${Math.round(r.est.clearOdds * 100)}%`
    );
  });
  const worst = rows[rows.length - 1];
  console.log(`  ...worst: ${worst.plan.tierId}/${worst.plan.styleId}/${worst.mode.id} med ${money(worst.est.median)}`);

  // What the mini-game is allowed to be worth, at the best plan for this
  // request. If a bad round can sink a good plan or a good round can rescue
  // anything, the bounds are wrong, not the mini-game.
  const best = rows[0];

  // WHAT A GOOD HAND-PACK IS WORTH. autoPack is deliberately not optimal, so the
  // interesting question is how much a player who reads the case right can
  // beat it by. This packs the most valuable responsive documents first —
  // which no player can do reliably, since value is exactly what the box
  // hides — so it is a read on the headroom, not a plan. If it sits on top of
  // the auto number, packing by hand is a chore that buys nothing. It only
  // sweeps value-ranked prefixes, so it can very occasionally come in under
  // the auto row, which sweeps pack fullness as well.
  const oracle = plans
    .map((plan) => {
      const tier = sc.laborTiers.find((t) => t.id === plan.tierId);
      const box = boxOf(tier);
      const ranked = retrieve(caseData.documentPool, request)
        .slice()
        .sort(
          (a, b) =>
            (b.hotZones || []).reduce((t, z) => t + z.value, 0) -
            (a.hotZones || []).reduce((t, z) => t + z.value, 0)
        );
      let bestRow = null;
      for (let keep = 1; keep <= ranked.length; keep += 1) {
        const pack = autoPack(ranked.slice(0, keep), box);
        if (pack.leftOver.length) break;
        const est = estimateOutcome({ caseData, request, plan, packed: pack.packed, samples: SAMPLES });
        if (!bestRow || est.median > bestRow.est.median) bestRow = { plan, pack, est };
      }
      return bestRow;
    })
    .filter(Boolean)
    .sort((a, b) => b.est.median - a.est.median)[0];
  if (oracle) {
    console.log(
      `  value-first pack:  ${pad(`${oracle.plan.tierId}/${oracle.plan.styleId}`, 20)}` +
        `${pad(`${oracle.pack.packed.length}d`, 6)}med ${pad(money(oracle.est.median), 7)} ` +
        `clears ${Math.round(oracle.est.clearOdds * 100)}%  ` +
        `(auto ${money(best.est.median)} / ${Math.round(best.est.clearOdds * 100)}%)`
    );
  }
  const lo = estimateOutcome({ caseData, request, plan: best.plan, packed: best.pack.packed, skillMultiplier: SKILL_FLOOR, samples: SAMPLES });
  const hi = estimateOutcome({ caseData, request, plan: best.plan, packed: best.pack.packed, skillMultiplier: SKILL_CEIL, samples: SAMPLES });
  console.log(
    `  skill x${SKILL_FLOOR} ${pad(money(lo.median), 7)} (${Math.round(lo.clearOdds * 100)}%)  ` +
      `x1.0 ${pad(money(best.est.median), 7)} (${Math.round(best.est.clearOdds * 100)}%)  ` +
      `x${SKILL_CEIL} ${pad(money(hi.median), 7)} (${Math.round(hi.clearOdds * 100)}%)`
  );
}

// Which style tops the table, and how often?
const wins = {};
const tierWins = {};
const packWins = {};
for (const [, request] of Object.entries(requests)) {
  const best = rowsFor(request).sort((a, b) => b.est.median - a.est.median)[0];
  wins[best.plan.styleId] = (wins[best.plan.styleId] || 0) + 1;
  tierWins[best.plan.tierId] = (tierWins[best.plan.tierId] || 0) + 1;
  packWins[best.mode.id] = (packWins[best.mode.id] || 0) + 1;
}
console.log('\nbest-plan reading style, by request:', JSON.stringify(wins));
console.log('best-plan staffing tier, by request: ', JSON.stringify(tierWins));
// If one pack mode wins everywhere, the box is not a decision yet.
console.log('best-plan pack fullness, by request: ', JSON.stringify(packWins));
