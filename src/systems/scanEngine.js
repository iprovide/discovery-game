// The Scan — the crux mechanic (GAMEPLAN.md 3.4).
//
// A document is a run of positions: mostly noise, with its hotZones sitting
// inside as contiguous runs. The Rule 34 request does two things at once:
//
//   1. RETRIEVAL — a document comes back only if it matches every field the
//      request actually specifies.
//   2. COMPRESSION — the more optional specifiers the request pins down, the
//      shorter the retrieved document is. The hot zones never shrink, so a
//      precise request packs the same payload into a much smaller haystack.
//
// Review is then sampling, not reading: each assigned document gets a budget
// of random fixed-width windows. A hot zone whose *union* coverage crosses
// the capture threshold pops as a reveal.
//
// LABOR (Phase 3, GAMEPLAN.md 3.4 + 3.11). Labor is one purchased pool of
// *effort* (positions of reading), and the player divides it by PACKING A BOX:
//
//   staffing tier  — buys a pool of effort AND a container of a given size
//                    in grid cells. Bigger team, bigger box.
//   the box        — what the player packs by hand (src/systems/packing.js).
//                    What's packed is what gets reviewed; effort per document
//                    is simply tier.effort / packed.length, so breadth and
//                    depth are one physical trade-off instead of two notches.
//   reading style  — each style has a window width, its own effort price per
//                    pass (rising faster than the width, so a careful pass
//                    buys far fewer passes), and a list of finding KINDS it
//                    can register at all.
//
// The old `allocationNotches` Spread row is gone: the playtest reported it as
// arithmetic rather than a read on the case, and the box says the same thing
// with your hands.
//
// SKILL (Phase 3B) enters as `skillMultiplier`, a bounded scale on the effort
// pool and nothing else. It never decides which documents or which findings
// are hit, which is what keeps the scan seeded and tools/sweep.mjs honest.
//
// FINDING KINDS (2026-09-03). Effort-shaped knobs alone made Reading nearly
// redundant with Spread: measured across five synthetic case shapes, the three
// styles produced *identical* best outcomes in four of them, because sixty
// passes on a compressed document will find anything eventually. So Reading is
// no longer an efficiency dial, it is an eligibility filter:
//
//   aside    a one-line remark          registered by  skim, read
//   passage  a paragraph                registered by  read, pore
//   thread   a long buried exchange     registered by  pore only
//
// No style's list contains another's, so there is no universally correct
// reading — skim registers the least but gets the most passes, pore is the
// only route to a thread and pays for it in speed. Which kind holds a case's
// money is now the case author's main personality dial (docs/case-patterns.md).
//
// Capture is also single-pass: the old rule let a skimmer stitch a find out of
// several unrelated glances, which is what let width wash out. One pass has to
// take in enough of the finding on its own.

import { makeRng } from './rng.js';
import { autoPack, boxOf } from './packing.js';

export const UNSPECIFIED = '';

// Canonical finding kinds, shortest first. Authored lengths should sit
// comfortably inside a registering style's geometric reach (width / capture
// threshold), not at its edge: aside 18-30, passage 36-48, thread 58-78.
export const KINDS = ['aside', 'passage', 'thread'];

// Cases may leave a zone's kind off; length then decides. Authoring in Notion
// stays a two-number affair for anyone who doesn't want to think about it.
export function kindOf(zone) {
  if (zone.kind && KINDS.includes(zone.kind)) return zone.kind;
  if (zone.length < 34) return 'aside';
  if (zone.length < 54) return 'passage';
  return 'thread';
}

// ---------------------------------------------------------------- retrieval

function matchesField(doc, fieldId, value) {
  // Unspecified constrains nothing. A multi-select field arrives as an array;
  // an empty one is the same as unspecified.
  if (Array.isArray(value)) {
    if (!value.length) return true;
    if (fieldId === 'docType') return value.includes(doc.type);
    return value.includes(doc[fieldId]);
  }
  if (!value) return true;
  switch (fieldId) {
    case 'docType':
      return doc.type === value;
    case 'dateAfter':
      return doc.date >= value;
    case 'custodian':
      return doc.custodian === value;
    case 'location':
      return doc.location === value;
    case 'label':
      return (doc.labels || []).includes(value);
    default:
      return true;
  }
}

export function retrieve(documentPool, request) {
  return documentPool.filter((doc) =>
    Object.entries(request).every(([fieldId, value]) => matchesField(doc, fieldId, value))
  );
}

// -------------------------------------------------------------- compression

// Only the *optional* (discovered) specifiers earn compression — the two
// mandatory fields are the floor every request has to clear.
export function countOptionalSpecifiers(request, caseData) {
  const optionalIds = caseData.requestFields.discoverable.map((f) => f.id);
  return optionalIds.filter((id) => request[id]).length;
}

// Asking for a second kind of document is a second production to review, and
// it is priced accordingly: the first type is included, every one after it
// costs. Without that, "tick every box" is free breadth and the type row stops
// being a decision — the same trap the old free labor levels fell into.
export function requestCost(caseData, request) {
  const perExtra = caseData.scoringConfig.extraDocTypeCost || 0;
  const types = request.docType;
  const count = Array.isArray(types) ? types.length : types ? 1 : 0;
  return Math.max(0, count - 1) * perExtra;
}

export function compressionFactorFor(request, caseData) {
  const curve = caseData.scoringConfig.compressionCurve;
  const used = countOptionalSpecifiers(request, caseData);
  return curve[Math.min(used, curve.length - 1)];
}

// ------------------------------------------------------------- doc layout

// Place each hot zone at a random, non-overlapping position inside the
// compressed document. Zone sizes are fixed; only the surrounding noise
// changes, which is the whole point.
export function layoutDocument(doc, compressionFactor, config, rng) {
  const payload = (doc.hotZones || []).reduce((sum, z) => sum + z.length, 0);
  const length = Math.max(
    config.minDocumentLength,
    payload + 20,
    Math.round(doc.baseLength * compressionFactor)
  );

  const zones = [];
  const slots = doc.hotZones || [];
  // Deal the noise out into (n + 1) gaps between the zones, then walk left to
  // right. Guarantees non-overlap without a rejection loop.
  const noise = length - payload;
  const cuts = [];
  for (let i = 0; i < slots.length; i += 1) cuts.push(rng());
  cuts.sort((a, b) => a - b);

  let cursor = 0;
  slots.forEach((zone, i) => {
    const gapStart = i === 0 ? 0 : cuts[i - 1];
    const gapEnd = cuts[i];
    void gapStart;
    void gapEnd;
    const gap = Math.floor(noise * (i === 0 ? cuts[0] : cuts[i] - cuts[i - 1]));
    cursor += gap;
    zones.push({
      index: i,
      start: cursor,
      end: cursor + zone.length,
      length: zone.length,
      kind: kindOf(zone),
      value: zone.value,
      flavor: zone.flavor
    });
    cursor += zone.length;
  });

  return { docId: doc.id, length, zones };
}

// ------------------------------------------------------------------- scan

// Coverage of one zone: the largest share of it that any SINGLE pass took in.
//
// Not the union, and not even the longest contiguous run across passes
// (2026-09-03). Both of those let enough glances add up to a finding, which is
// how window width ended up not mattering. One pass has to take in enough of
// the thing on its own to register it — you have to read a passage through to
// get the point of it, and coming back to it twice doesn't count.
function coverageOf(zone, windows) {
  const overlaps = [];
  for (const w of windows) {
    const start = Math.max(zone.start, w.start);
    const end = Math.min(zone.end, w.end);
    if (end > start) overlaps.push([start, end]);
  }
  if (!overlaps.length) return 0;
  let best = 0;
  for (const [start, end] of overlaps) best = Math.max(best, end - start);
  return best / zone.length;
}

// Skim a document: N random windows of fixed width. Returns the windows in
// the order they were read (the Processing scene animates exactly this) plus
// per-zone coverage and which zones were captured.
export function scanDocument(layout, budget, config, rng, opts = {}) {
  const width = opts.windowWidth || config.windowWidth;
  const fast = opts.fast === true;
  const catches = opts.catches || KINDS;
  const windows = [];
  for (let i = 0; i < budget; i += 1) {
    const start = Math.floor(rng() * Math.max(1, layout.length - width));
    windows.push({ start, end: Math.min(layout.length, start + width) });
  }

  const zoneResults = layout.zones.map((zone) => {
    // An associate reading for one kind of thing does not register another —
    // deep in a long argument you skip the throwaway line, and skimming you
    // cannot hold a long exchange in your head. This is a wall, not a penalty.
    const eligible = catches.includes(zone.kind);
    const coverage = eligible ? coverageOf(zone, windows) : 0;
    const captured = eligible && coverage >= config.captureThreshold;

    // Which pass registered it, so the animation pops the reveal on the right
    // window instead of at the end. Single-pass capture makes this a lookup
    // rather than the old O(windows^2) rescan.
    let capturedAtStep = -1;
    if (!fast && captured) {
      for (let i = 0; i < windows.length; i += 1) {
        if (coverageOf(zone, [windows[i]]) >= config.captureThreshold) {
          capturedAtStep = i;
          break;
        }
      }
    }
    return { ...zone, coverage, eligible, captured, capturedAtStep };
  });

  return { windows, zones: zoneResults };
}

// -------------------------------------------------------------- labor plan

// A plan is what the player actually chooses: which staffing tier they pay for
// and how carefully each document gets read. The third decision — how much of
// the pile to carry — is not in here at all any more, because it is made with
// the hands on the packing screen and arrives as `packedCount`.
export function defaultPlan(caseData) {
  const c = caseData.scoringConfig;
  const tier = c.laborTiers.find((t) => t.default) || c.laborTiers[0];
  const style = c.readingStyles.find((r) => r.default) || c.readingStyles[Math.floor(c.readingStyles.length / 2)];
  return { tierId: tier.id, styleId: style.id };
}

// opts.packedCount — how many documents went in the box. Zero means "nothing
//   packed yet", and the depth numbers come back as 0 rather than dividing by
//   nothing; the builder uses that state before the box exists.
// opts.skillMultiplier — the mini-game result (Phase 3B). Bounded by the
//   caller; 1 is the neutral value the sweep and the skip button both use.
export function resolvePlan(caseData, plan, opts = {}) {
  const c = caseData.scoringConfig;
  const tier = c.laborTiers.find((t) => t.id === plan.tierId) || c.laborTiers[0];
  const style = c.readingStyles.find((r) => r.id === plan.styleId) || c.readingStyles[0];
  const box = boxOf(tier);

  const skillMultiplier = opts.skillMultiplier ?? 1;
  const effort = Math.max(1, Math.round(tier.effort * skillMultiplier));
  const packedCount = Math.max(0, Math.floor(opts.packedCount || 0));

  const passCost = style.effort || style.width;
  // The box holds a fixed amount of attention. Cram twelve documents in and
  // each gets a shallower look than four would — that IS the Spread knob, made
  // physical.
  const effortPerDoc = packedCount ? Math.max(passCost, Math.floor(effort / packedCount)) : 0;
  const windowsPerDocument = packedCount ? Math.max(1, Math.floor(effortPerDoc / passCost)) : 0;

  return {
    tier,
    style,
    box,
    cost: tier.cost,
    effort,
    baseEffort: tier.effort,
    skillMultiplier,
    packedCount,
    effortPerDoc,
    windowsPerDocument,
    windowWidth: style.width,
    catches: style.catches && style.catches.length ? style.catches : KINDS,
    passCost,
    // Longest zone a single window of this width can carry over the capture
    // threshold on its own. Anything longer needs two windows to line up,
    // which is close to hopeless — this is the number the reading-style knob
    // is really about.
    singleWindowReach: Math.floor(style.width / c.captureThreshold)
  };
}

// What the box will hold, for the request builder's pile preview. Goes through
// autoPack so the picture the player sees before filing is the same
// arrangement the "let the paralegals sort it" button would produce.
export function autoPackFor(caseData, plan, retrieved) {
  const c = caseData.scoringConfig;
  const tier = c.laborTiers.find((t) => t.id === plan.tierId) || c.laborTiers[0];
  return autoPack(retrieved, boxOf(tier));
}

// How thoroughly one packed document actually gets looked at: passes x window
// width against the length it will have after compression, averaged over the
// box. A real quantity, not a score — it says how deep, never how good, which
// is the line the request builder is not allowed to cross.
export function expectedCoverage({ caseData, request, plan, packedDocs }) {
  if (!packedDocs || !packedDocs.length) return 0;
  const config = caseData.scoringConfig;
  const labor = resolvePlan(caseData, plan, { packedCount: packedDocs.length });
  const factor = compressionFactorFor(request, caseData);
  const total = packedDocs.reduce((sum, doc) => {
    const payload = (doc.hotZones || []).reduce((t, z) => t + z.length, 0);
    const length = Math.max(config.minDocumentLength, payload + 20, Math.round(doc.baseLength * factor));
    return sum + (labor.windowsPerDocument * labor.windowWidth) / length;
  }, 0);
  return total / packedDocs.length;
}

// The words that go with it. Deliberately a phrase about attention, not a
// grade: packing fewer documents is not better, it is a different bet.
export function depthWord(coverage) {
  if (coverage <= 0) return 'nothing packed yet';
  if (coverage < 0.6) return 'barely opened';
  if (coverage < 1.6) return 'a glance each';
  if (coverage < 3.5) return 'a quick look each';
  if (coverage < 7) return 'a solid look each';
  if (coverage < 14) return 'a careful look each';
  return 'worked over completely';
}

// --------------------------------------------------------------- resolution

// The whole pipeline: request in, a fully-resolved (and replayable) result
// out. Nothing here touches Phaser — the scenes just render this object.
export function resolveRequest({
  caseData,
  request,
  plan,
  packed = null,
  skillMultiplier = 1,
  seed = 1,
  fast = false
}) {
  const config = caseData.scoringConfig;

  const retrieved = retrieve(caseData.documentPool, request);
  const compressionFactor = compressionFactorFor(request, caseData);

  // WHAT'S PACKED IS WHAT GETS REVIEWED. The random draw that used to stand in
  // for the box is gone (Phase 3A) — an unpacked call falls back to autoPack,
  // the same function the "let the paralegals sort it" button and
  // tools/sweep.mjs use, so every path through the engine packs by one rule.
  const tier = config.laborTiers.find((t) => t.id === plan.tierId) || config.laborTiers[0];
  const box = boxOf(tier);
  const packedIds = packed
    ? new Set(packed.filter((id) => retrieved.some((d) => d.id === id)))
    : new Set(autoPack(retrieved, box).packed);

  const assigned = retrieved.filter((d) => packedIds.has(d.id));
  const unread = retrieved.filter((d) => !packedIds.has(d.id));

  const labor = resolvePlan(caseData, plan, { packedCount: assigned.length, skillMultiplier });

  // The pack is part of the seed: repack the same request differently and the
  // layouts re-roll, which is correct — it is a different review.
  const seedKey =
    `${caseData.id}|${JSON.stringify(request)}|${plan.tierId}:${plan.styleId}` +
    `|${[...packedIds].sort().join(',')}|${seed}`;
  const rng = makeRng(seedKey);

  const reviewed = assigned.map((doc) => {
    const layout = layoutDocument(doc, compressionFactor, config, rng);
    const scan = scanDocument(layout, labor.windowsPerDocument, config, rng, {
      windowWidth: labor.windowWidth,
      catches: labor.catches,
      fast
    });
    return {
      doc,
      layout,
      windows: scan.windows,
      zones: scan.zones,
      captured: scan.zones.filter((z) => z.captured),
      earned: scan.zones.filter((z) => z.captured).reduce((s, z) => s + z.value, 0)
    };
  });

  const reveals = [];
  reviewed.forEach((r) => {
    r.captured.forEach((z) => {
      reveals.push({
        docId: r.doc.id,
        docTitle: r.doc.title,
        kind: z.kind,
        value: z.value,
        flavor: z.flavor
      });
    });
  });

  const gross = reveals.reduce((s, r) => s + r.value, 0);
  const productionCost = requestCost(caseData, request);
  const totalAvailable = caseData.documentPool.reduce(
    (s, d) => s + (d.hotZones || []).reduce((t, z) => t + z.value, 0),
    0
  );
  const retrievedValue = retrieved.reduce(
    (s, d) => s + (d.hotZones || []).reduce((t, z) => t + z.value, 0),
    0
  );

  return {
    request,
    plan,
    labor,
    laborCost: labor.cost,
    compressionFactor,
    retrieved,
    assigned,
    unread,
    reviewed,
    reveals,
    gross,
    productionCost,
    net: gross - labor.cost - productionCost,
    // Post-mortem numbers for the case summary screen.
    box,
    packed: [...packedIds],
    stats: {
      retrievedCount: retrieved.length,
      assignedCount: assigned.length,
      unreadCount: unread.length,
      capturedZones: reveals.length,
      retrievedValue,
      totalAvailable,
      // Split deliberately: value you could never have registered with this
      // reading style is a different lesson from value you simply skimmed past.
      missedWrongKind: reviewed.reduce(
        (s, r) => s + r.zones.filter((z) => !z.eligible).reduce((t, z) => t + z.value, 0),
        0
      ),
      missedInAssigned: reviewed.reduce(
        (s, r) =>
          s + r.zones.filter((z) => z.eligible && !z.captured).reduce((t, z) => t + z.value, 0),
        0
      ),
      missedUnread: unread.reduce(
        (s, d) => s + (d.hotZones || []).reduce((t, z) => t + z.value, 0),
        0
      )
    }
  };
}

// Human-readable version of the assembled request, for the builder preview
// and the "as filed" line on the summary screen.
export function requestToSentence(caseData, request) {
  const all = [...caseData.requestFields.mandatory, ...caseData.requestFields.discoverable];
  const parts = [];
  const labelFor = (field, v) => field.options.find((o) => o.value === v)?.label;
  all.forEach((field) => {
    const value = request[field.id];
    if (Array.isArray(value)) {
      const labels = value.map((v) => labelFor(field, v)).filter(Boolean);
      if (!labels.length) return;
      const joined =
        labels.length === 1
          ? labels[0]
          : `${labels.slice(0, -1).join(', ')} and ${labels[labels.length - 1]}`;
      parts.push(field.phrase.replace('{value}', joined));
      return;
    }
    if (!value) return;
    const option = field.options.find((o) => o.value === value);
    if (!option) return;
    parts.push(field.phrase.replace('{value}', option.label));
  });
  return `We request ${parts.join(', ')}.`;
}

// ---------------------------------------------------------------- previewer

// What the builder shows before you file. The rule here is that the preview
// must never be able to lie, so it doesn't model anything — it runs the real
// engine a few dozen times on throwaway seeds and reports the spread.
//
// This is the whole point of the bullseye (GAMEPLAN.md 3.9 Fix 2): a broad
// request isn't just worth less on average, it's *wilder*, and the player
// should be able to see themselves buying that variance down with every
// qualifier they add.
export function estimateOutcome({ caseData, request, plan, packed = null, skillMultiplier = 1, samples = 24 }) {
  const nets = [];
  let retrievedCount = 0;
  let assignedCount = 0;
  let unreadCount = 0;
  let availableInRetrieved = 0;

  for (let i = 0; i < samples; i += 1) {
    // Negative seeds so a preview can never collide with the seed the real
    // scan will use, which would let the player scout the actual layout.
    const r = resolveRequest({
      caseData,
      request,
      plan,
      packed,
      skillMultiplier,
      seed: -(i + 1),
      fast: true
    });
    nets.push(r.net);
    retrievedCount = r.stats.retrievedCount;
    assignedCount = r.stats.assignedCount;
    unreadCount = r.stats.unreadCount;
    availableInRetrieved = r.stats.retrievedValue;
  }

  nets.sort((a, b) => a - b);
  const at = (q) => nets[Math.min(nets.length - 1, Math.max(0, Math.round(q * (nets.length - 1))))];
  const threshold = caseData.moneyThreshold;
  const clears = nets.filter((n) => n >= threshold).length / nets.length;
  const mean = nets.reduce((a, b) => a + b, 0) / nets.length;

  return {
    p10: at(0.1),
    median: at(0.5),
    p90: at(0.9),
    mean,
    low: nets[0],
    high: nets[nets.length - 1],
    clearOdds: clears,
    retrievedCount,
    assignedCount,
    unreadCount,
    availableInRetrieved,
    totalAvailable: caseData.documentPool.reduce(
      (s, d) => s + (d.hotZones || []).reduce((t, z) => t + z.value, 0),
      0
    )
  };
}

// The exact responsive-document count is deliberately hidden (it removed the
// gamble — E's Phase 1 notes). The player still needs to feel scope, so they
// get a size of pile instead of a number.
export function volumeWord(count) {
  if (count === 0) return 'nothing responsive';
  if (count <= 2) return 'a thin folder';
  if (count <= 5) return "a banker's box";
  if (count <= 9) return 'a filing cabinet';
  if (count <= 15) return 'a room full of boxes';
  return 'a warehouse';
}

// Coarse verdict for the payout range, in place of a percentage — this is an
// arcade game, not a spreadsheet.
export function oddsWord(clearOdds) {
  if (clearOdds <= 0.05) return { word: 'hopeless', tone: 'danger' };
  if (clearOdds < 0.3) return { word: 'a long shot', tone: 'danger' };
  if (clearOdds < 0.55) return { word: 'a coin flip', tone: 'gold' };
  if (clearOdds < 0.8) return { word: 'favourable', tone: 'accent' };
  return { word: 'comfortable', tone: 'accent' };
}
