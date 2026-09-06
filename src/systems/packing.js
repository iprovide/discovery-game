// The Box (GAMEPLAN.md 3.11). Packing replaces the Spread knob: staffing buys
// a container of a certain size, the player decides by hand what goes in it,
// and depth falls out of how full it is (effort is fixed per box, so twelve
// documents each get a shallower look than four).
//
// GRID, NOT PHYSICS (design rule 1, determinism). A physics stacker settles
// differently every run, which would make tools/sweep.mjs meaningless. Every
// document is an axis-aligned rectangle of whole cells and every placement is
// exact.
//
// Nothing in this file knows anything about a document's value. Footprint is
// set by type alone — that's the whole point: you pack knowing type, date,
// custodian and size, and never worth.

// ---------------------------------------------------------------- footprints

// THE source of truth for how big a document is. src/scenes/sceneHelpers.js
// derives its pixel DOC_SHAPES from this table rather than keeping a second
// copy, so the builder's pile preview and the packing grid cannot drift apart.
export const DOC_FOOTPRINTS = {
  'text-message': { w: 1, h: 1 },
  invoice: { w: 2, h: 2 },
  photograph: { w: 3, h: 2 },
  email: { w: 2, h: 3 },
  memo: { w: 2, h: 4 },
  'test-report': { w: 3, h: 4 }
};

export const DOC_FOOTPRINT_FALLBACK = { w: 2, h: 3 };

export function footprintOf(doc) {
  const type = typeof doc === 'string' ? doc : doc.type;
  return DOC_FOOTPRINTS[type] || DOC_FOOTPRINT_FALLBACK;
}

export function footprintArea(doc) {
  const f = footprintOf(doc);
  return f.w * f.h;
}

// A tier that predates the Box still gets a sane container rather than
// crashing the scan, but every shipped case should carry `box`.
export const DEFAULT_BOX = { w: 8, h: 5 };

export function boxOf(tier) {
  const b = tier && tier.box;
  if (!b || !b.w || !b.h) return DEFAULT_BOX;
  return { w: b.w, h: b.h };
}

export function boxCells(box) {
  return box.w * box.h;
}

// ------------------------------------------------------------------- grid

// Occupancy is a flat array of doc ids (or null), indexed y * w + x.
export function makeGrid(box) {
  return new Array(box.w * box.h).fill(null);
}

export function fits(box, x, y, w, h) {
  return x >= 0 && y >= 0 && x + w <= box.w && y + h <= box.h;
}

// `ignoreId` lets a placed document be dragged over its own cells without
// colliding with itself.
export function canPlace(grid, box, x, y, w, h, ignoreId = null) {
  if (!fits(box, x, y, w, h)) return false;
  for (let dy = 0; dy < h; dy += 1) {
    for (let dx = 0; dx < w; dx += 1) {
      const cell = grid[(y + dy) * box.w + (x + dx)];
      if (cell !== null && cell !== ignoreId) return false;
    }
  }
  return true;
}

export function stamp(grid, box, x, y, w, h, id) {
  for (let dy = 0; dy < h; dy += 1) {
    for (let dx = 0; dx < w; dx += 1) grid[(y + dy) * box.w + (x + dx)] = id;
  }
  return grid;
}

export function clearId(grid, id) {
  for (let i = 0; i < grid.length; i += 1) if (grid[i] === id) grid[i] = null;
  return grid;
}

// Build occupancy from a placement list — used to validate a hand-packed box
// that arrives from the scene or from a save.
export function gridFromPlacements(box, placements) {
  const grid = makeGrid(box);
  placements.forEach((p) => stamp(grid, box, p.x, p.y, p.w, p.h, p.id));
  return grid;
}

// --------------------------------------------------------------- auto-pack

// "Let the paralegals sort it." Greedy first-fit over a round-robin of
// document types, biggest type first, scanned row-major, unrotated orientation
// tried before rotated.
//
// THIS IS THE SHARED FUNCTION. The auto button in PackingScene, the pile
// preview on the request builder and tools/sweep.mjs all call it. If the
// harness ever packs by some other rule it stops measuring the game.
//
// WHY ROUND-ROBIN AND NOT PLAIN FIRST-FIT-DECREASING. Straight biggest-first
// was the obvious implementation and it was measured, per the standing rule,
// before being believed. On case-01 it filled the all-hands 10x6 box with
// exactly ten emails and dropped both photographs — so buying the decoy type
// cost $100 and changed nothing, and the request that used to be the best line
// in the game fell from $1,510 to $625. A silent trap, and traps have to be
// telegraphed.
//
// Dealing one of each type in rotation is also the more honest fiction: the
// paralegals don't know which document is the good one, but they do know you
// asked for two kinds of thing, and they would bring some of each.
//
// Deterministic by construction — no RNG, ties broken by document id, so the
// same pool and the same box always produce the same arrangement. Still
// deliberately decent rather than optimal: hand-packing should beat it, or the
// button would be the only sensible move.
export function autoPack(docs, box) {
  const grid = makeGrid(box);
  const placements = [];
  const leftOver = [];

  const byType = new Map();
  docs.forEach((doc) => {
    const type = doc.type || 'unknown';
    if (!byType.has(type)) byType.set(type, []);
    byType.get(type).push(doc);
  });
  const queues = [...byType.entries()]
    .sort((a, b) => {
      const areaDiff = footprintArea(b[1][0]) - footprintArea(a[1][0]);
      if (areaDiff) return areaDiff;
      const hDiff = footprintOf(b[1][0]).h - footprintOf(a[1][0]).h;
      if (hDiff) return hDiff;
      return String(a[0]).localeCompare(String(b[0]));
    })
    .map(([, list]) => list.slice().sort((a, b) => String(a.id).localeCompare(String(b.id))));

  const order = [];
  for (let round = 0; order.length < docs.length; round += 1) {
    queues.forEach((q) => {
      if (q[round]) order.push(q[round]);
    });
  }

  order.forEach((doc) => {
    const f = footprintOf(doc);
    // Portrait first. Turning everything the same way up lets mixed types tile
    // against each other instead of leaving 1-cell gutters — which is what
    // stops a photograph request from being packed at 80% while an
    // emails-only one packs at 100%.
    const orientations =
      f.w === f.h
        ? [{ w: f.w, h: f.h, rot: 0 }]
        : f.w <= f.h
          ? [{ w: f.w, h: f.h, rot: 0 }, { w: f.h, h: f.w, rot: 1 }]
          : [{ w: f.h, h: f.w, rot: 1 }, { w: f.w, h: f.h, rot: 0 }];

    let placed = null;
    outer: for (let y = 0; y < box.h; y += 1) {
      for (let x = 0; x < box.w; x += 1) {
        for (const o of orientations) {
          if (canPlace(grid, box, x, y, o.w, o.h)) {
            placed = { id: doc.id, x, y, w: o.w, h: o.h, rot: o.rot };
            break outer;
          }
        }
      }
    }

    if (placed) {
      stamp(grid, box, placed.x, placed.y, placed.w, placed.h, placed.id);
      placements.push(placed);
    } else {
      leftOver.push(doc);
    }
  });

  // Placements come back in packing order (biggest first); `packed` is
  // reordered to match the pool so the review queue reads naturally.
  const packedIds = new Set(placements.map((p) => p.id));
  const packedDocs = docs.filter((d) => packedIds.has(d.id));

  return {
    box,
    grid,
    placements,
    packed: packedDocs.map((d) => d.id),
    packedDocs,
    leftOver
  };
}

// How full the box is, 0..1. Used for the fill bar on the packing screen; it
// describes the container, not the quality of what's in it.
export function fillOf(placements, box) {
  const used = placements.reduce((s, p) => s + p.w * p.h, 0);
  return boxCells(box) ? used / boxCells(box) : 0;
}
