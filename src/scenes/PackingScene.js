import Phaser from 'phaser';
import { drawTitle, drawPanel, drawButton, drawMoneyBadge, palette, font } from './sceneHelpers.js';
import {
  currentCase,
  getMoney,
  getRequest,
  getPlan,
  setPacked,
  setPackingSnapshot
} from '../systems/gameState.js';
import {
  retrieve,
  resolvePlan,
  expectedCoverage,
  depthWord,
  volumeWord
} from '../systems/scanEngine.js';
import {
  autoPack,
  footprintOf,
  makeGrid,
  canPlace,
  stamp,
  clearId,
  boxCells
} from '../systems/packing.js';

// THE BOX (GAMEPLAN.md 3.11, Phase 3A).
//
// This screen is the Spread knob, made physical. Staffing bought a container;
// what you put in it is what gets reviewed, and the fixed pool of attention is
// divided among whatever is in there — so cramming the box is breadth bought
// with depth, and you can see the trade instead of reading it off a notch.
//
// Grid, never physics (design rule 1): every placement is exact whole cells,
// so the same pack always resolves the same way and tools/sweep.mjs keeps
// measuring the real game.
//
// What a document shows you here: type, date, custodian and size. Never value.
// That is the gamble, and it is the reason packing is a decision rather than a
// sorting chore.

const CELL = 48;

// Panels
const TRAY = { x: 32, y: 70, w: 292, h: 380 };
const BOX = { x: 336, y: 70, w: 592, h: 380 };

const TYPE_COLOR = {
  email: 0x4f5c78,
  memo: 0x5a5470,
  'test-report': 0x466b62,
  invoice: 0x6b5f45,
  photograph: 0x6b4f52,
  'text-message': 0x44607a
};
const TYPE_FALLBACK = 0x4f5c78;

const TYPE_SHORT = {
  email: 'EMAIL',
  memo: 'MEMO',
  'test-report': 'REPORT',
  invoice: 'INVOICE',
  photograph: 'PHOTO',
  'text-message': 'TEXT'
};

export default class PackingScene extends Phaser.Scene {
  constructor() {
    super('Packing');
  }

  create() {
    this.cameras.main.setBackgroundColor(palette.bg);
    // Right-click rotates a document, so the browser menu has to go.
    if (this.input.mouse) this.input.mouse.disableContextMenu();

    this.caseData = currentCase();
    this.plan = getPlan();
    this.request = getRequest();
    this.labor = resolvePlan(this.caseData, this.plan);
    this.box = this.labor.box;

    this.retrieved = retrieve(this.caseData.documentPool, this.request);

    drawMoneyBadge(this, getMoney());
    drawTitle(this, 'Pack the Box', 26);
    this.add
      .text(
        this.scale.width / 2,
        50,
        `${this.labor.tier.label}  ·  ${this.box.w} × ${this.box.h}  ·  ` +
          `${volumeWord(this.retrieved.length)} came back`,
        { fontFamily: font, fontSize: '14px', color: palette.dim }
      )
      .setOrigin(0.5);

    drawButton(this, '◀ Redraft', 26, () => this.scene.start('RequestBuilder'), {
      x: 88,
      width: 116,
      height: 28,
      fontSize: '13px'
    });

    // ---- panels
    drawPanel(this, TRAY.x, TRAY.y, TRAY.w, TRAY.h);
    this.add
      .text(TRAY.x + 12, TRAY.y + 8, 'LEFT ON THE CART', {
        fontFamily: font,
        fontSize: '11px',
        color: palette.dim
      })
      .setOrigin(0, 0);

    drawPanel(this, BOX.x, BOX.y, BOX.w, BOX.h);
    this.add
      .text(BOX.x + 12, BOX.y + 8, 'THE BOX', { fontFamily: font, fontSize: '11px', color: palette.dim })
      .setOrigin(0, 0);

    // Grid origin — the outline is drawn at its true size, so a bigger team's
    // box is visibly a bigger box rather than the same rectangle relabelled.
    const gw = this.box.w * CELL;
    const gh = this.box.h * CELL;
    this.gridOx = Math.round(BOX.x + (BOX.w - gw) / 2);
    this.gridOy = Math.round(BOX.y + 30 + (BOX.h - 40 - gh) / 2);

    this.gridGfx = this.add.graphics();
    this.ghostGfx = this.add.graphics().setDepth(900);
    this.drawGrid();

    // ---- tray scrolling
    this.trayScroll = 0;
    this.trayOverflow = 0;
    this.trayMask = this.make
      .graphics()
      .fillRect(TRAY.x + 2, TRAY.y + 26, TRAY.w - 4, TRAY.h - 30)
      .createGeometryMask();
    this.input.on('wheel', (p, _o, _dx, dy) => {
      if (p.x < TRAY.x || p.x > TRAY.x + TRAY.w) return;
      this.trayScroll = Phaser.Math.Clamp(this.trayScroll + dy * 0.5, 0, this.trayOverflow);
      this.layoutTray();
    });

    // ---- readouts
    this.readout = this.add
      .text(40, 458, '', { fontFamily: font, fontSize: '15px', color: palette.text })
      .setOrigin(0, 0);
    this.leftBehind = this.add
      .text(40, 480, '', { fontFamily: font, fontSize: '13px', color: palette.dim })
      .setOrigin(0, 0);
    // One line, doing two jobs: the controls when nothing is under the
    // pointer, the document's particulars when something is. Below the button
    // row so it can run the full width of the screen.
    this.hoverText = this.add
      .text(40, 508, '', { fontFamily: font, fontSize: '12px', color: palette.dim })
      .setOrigin(0, 0);

    this.autoBtn = drawButton(this, 'Let the paralegals sort it', 478, () => this.autoPackAll(), {
      x: 535,
      width: 210,
      height: 32,
      fontSize: '13px'
    });
    this.clearBtn = drawButton(this, 'Empty it', 478, () => this.emptyBox(), {
      x: 700,
      width: 110,
      height: 32,
      fontSize: '13px'
    });
    this.sendBtn = drawButton(this, 'Send to review ▶', 478, () => this.send(), {
      x: 845,
      width: 170,
      height: 32,
      fontSize: '14px'
    });

    // ---- pieces
    this.grid = makeGrid(this.box);
    this.pieces = this.retrieved.map((doc) => ({
      doc,
      rot: 0,
      placed: null,
      container: null
    }));
    this.pieces.forEach((p) => this.buildPiece(p));

    this.dragging = null;
    this.input.on('pointermove', (p) => this.onMove(p));
    this.input.on('pointerup', (p) => this.onUp(p));
    this.input.keyboard.on('keydown-R', () => {
      if (this.dragging) this.rotate(this.dragging.piece);
      else if (this.hovered) this.rotate(this.hovered);
    });

    // Open on the auto-pack. The playtest note that mattered most is that the
    // labor rows felt like homework — starting from a sensible box means the
    // player edits an arrangement rather than facing an empty grid, and the
    // "sort it for me" button is one click away for the rest of the level.
    this.autoPackAll();
  }

  // ------------------------------------------------------------- geometry

  cellsOf(piece) {
    const f = footprintOf(piece.doc);
    return piece.rot ? { w: f.h, h: f.w } : { w: f.w, h: f.h };
  }

  drawGrid() {
    const g = this.gridGfx;
    g.clear();
    g.fillStyle(0x11141b, 1);
    g.fillRect(this.gridOx, this.gridOy, this.box.w * CELL, this.box.h * CELL);
    g.lineStyle(1, 0x39425a, 0.55);
    for (let x = 0; x <= this.box.w; x += 1) {
      g.beginPath();
      g.moveTo(this.gridOx + x * CELL, this.gridOy);
      g.lineTo(this.gridOx + x * CELL, this.gridOy + this.box.h * CELL);
      g.strokePath();
    }
    for (let y = 0; y <= this.box.h; y += 1) {
      g.beginPath();
      g.moveTo(this.gridOx, this.gridOy + y * CELL);
      g.lineTo(this.gridOx + this.box.w * CELL, this.gridOy + y * CELL);
      g.strokePath();
    }
    g.lineStyle(3, 0x6b5a3c, 1);
    g.strokeRect(this.gridOx - 2, this.gridOy - 2, this.box.w * CELL + 4, this.box.h * CELL + 4);
  }

  // -------------------------------------------------------------- pieces

  buildPiece(piece) {
    const c = this.add.container(0, 0);
    const rect = this.add.rectangle(0, 0, CELL, CELL, TYPE_COLOR[piece.doc.type] || TYPE_FALLBACK).setOrigin(0, 0);
    rect.setStrokeStyle(2, 0x1a1e27);
    const rule = this.add.graphics();
    const label = this.add
      .text(5, 4, '', { fontFamily: font, fontSize: '10px', color: '#e8edf8' })
      .setOrigin(0, 0);
    const sub = this.add
      .text(5, 16, '', { fontFamily: font, fontSize: '9px', color: '#b9c3d6' })
      .setOrigin(0, 0);
    c.add([rect, rule, label, sub]);
    piece.container = c;
    piece.rect = rect;
    piece.rule = rule;
    piece.label = label;
    piece.sub = sub;

    c.setInteractive(new Phaser.Geom.Rectangle(0, 0, CELL, CELL), Phaser.Geom.Rectangle.Contains);
    c.on('pointerover', () => {
      this.hovered = piece;
      this.showDetail(piece);
    });
    c.on('pointerout', () => {
      if (this.hovered === piece) this.hovered = null;
      if (!this.dragging) this.hoverText.setText(this.hint());
    });
    c.on('pointerdown', (pointer, lx, ly) => {
      if (pointer.rightButtonDown()) {
        this.rotate(piece);
        return;
      }
      this.pickUp(piece, pointer, lx, ly);
    });

    this.paintPiece(piece);
  }

  paintPiece(piece) {
    const { w, h } = this.cellsOf(piece);
    const pw = w * CELL - 4;
    const ph = h * CELL - 4;
    piece.rect.setSize(pw, ph);
    piece.container.input.hitArea.setSize(pw, ph);

    const short = TYPE_SHORT[piece.doc.type] || piece.doc.type.toUpperCase();
    piece.label.setText(pw >= 60 ? short : short.slice(0, 3));
    piece.label.setFontSize(pw >= 60 ? 10 : 9);
    piece.sub.setText(ph >= 60 ? piece.doc.date.slice(5) : '');

    // Ruled lines, so a document reads as paper rather than a tetromino.
    piece.rule.clear();
    piece.rule.lineStyle(1, 0xdfe5f2, 0.16);
    const lines = Math.max(1, Math.min(6, Math.floor(ph / 12) - 2));
    for (let i = 1; i <= lines; i += 1) {
      const ly = Math.round(ph * 0.45 + i * 9);
      if (ly > ph - 6) break;
      piece.rule.beginPath();
      piece.rule.moveTo(6, ly);
      piece.rule.lineTo(pw - 6, ly);
      piece.rule.strokePath();
    }
  }

  rotate(piece) {
    const f = footprintOf(piece.doc);
    if (f.w === f.h) return;
    const next = piece.rot ? 0 : 1;
    if (piece.placed) {
      const cells = next ? { w: f.h, h: f.w } : { w: f.w, h: f.h };
      clearId(this.grid, piece.doc.id);
      if (!canPlace(this.grid, this.box, piece.placed.x, piece.placed.y, cells.w, cells.h, piece.doc.id)) {
        // No room to turn it where it sits: it goes back on the cart rotated
        // rather than silently refusing.
        piece.rot = next;
        piece.placed = null;
        this.paintPiece(piece);
        this.refresh();
        return;
      }
      piece.rot = next;
      stamp(this.grid, this.box, piece.placed.x, piece.placed.y, cells.w, cells.h, piece.doc.id);
    } else {
      piece.rot = next;
    }
    this.paintPiece(piece);
    this.refresh();
  }

  // ---------------------------------------------------------------- drag

  pickUp(piece, pointer, lx, ly) {
    if (this.dragging) return;
    this.dragging = {
      piece,
      grabX: lx,
      grabY: ly,
      cellDX: Math.floor(lx / CELL),
      cellDY: Math.floor(ly / CELL),
      from: piece.placed ? { ...piece.placed } : null,
      moved: false
    };
    if (piece.placed) {
      clearId(this.grid, piece.doc.id);
      piece.placed = null;
    }
    piece.container.setDepth(1000);
    this.refresh();
  }

  onMove(pointer) {
    if (!this.dragging) return;
    const { piece, grabX, grabY } = this.dragging;
    this.dragging.moved = true;
    piece.container.setPosition(pointer.x - grabX, pointer.y - grabY);
    this.drawGhost(pointer);
  }

  targetCell(pointer) {
    const { cellDX, cellDY } = this.dragging;
    return {
      x: Math.floor((pointer.x - this.gridOx) / CELL) - cellDX,
      y: Math.floor((pointer.y - this.gridOy) / CELL) - cellDY
    };
  }

  overBox(pointer) {
    return (
      pointer.x >= BOX.x && pointer.x <= BOX.x + BOX.w && pointer.y >= BOX.y && pointer.y <= BOX.y + BOX.h
    );
  }

  drawGhost(pointer) {
    this.ghostGfx.clear();
    if (!this.dragging || !this.overBox(pointer)) return;
    const { piece } = this.dragging;
    const { w, h } = this.cellsOf(piece);
    const t = this.targetCell(pointer);
    const ok = canPlace(this.grid, this.box, t.x, t.y, w, h);
    this.ghostGfx.lineStyle(2, ok ? 0x8fbf6b : 0xd97b6c, 1);
    this.ghostGfx.fillStyle(ok ? 0x8fbf6b : 0xd97b6c, 0.16);
    const gx = this.gridOx + t.x * CELL;
    const gy = this.gridOy + t.y * CELL;
    this.ghostGfx.fillRect(gx, gy, w * CELL, h * CELL);
    this.ghostGfx.strokeRect(gx, gy, w * CELL, h * CELL);
  }

  onUp(pointer) {
    if (!this.dragging) return;
    const { piece, from } = this.dragging;
    const { w, h } = this.cellsOf(piece);
    this.ghostGfx.clear();
    piece.container.setDepth(0);

    if (this.overBox(pointer)) {
      const t = this.targetCell(pointer);
      if (canPlace(this.grid, this.box, t.x, t.y, w, h)) {
        piece.placed = { x: t.x, y: t.y };
        stamp(this.grid, this.box, t.x, t.y, w, h, piece.doc.id);
      } else if (from && canPlace(this.grid, this.box, from.x, from.y, w, h)) {
        // A fumbled drop puts it back where it was rather than dumping it out.
        piece.placed = { ...from };
        stamp(this.grid, this.box, from.x, from.y, w, h, piece.doc.id);
      }
    }

    this.dragging = null;
    this.refresh();
  }

  // -------------------------------------------------------------- actions

  autoPackAll() {
    const result = autoPack(this.retrieved, this.box);
    this.grid = makeGrid(this.box);
    const byId = new Map(result.placements.map((p) => [p.id, p]));
    this.pieces.forEach((piece) => {
      const p = byId.get(piece.doc.id);
      if (p) {
        piece.rot = p.rot;
        piece.placed = { x: p.x, y: p.y };
        stamp(this.grid, this.box, p.x, p.y, p.w, p.h, piece.doc.id);
      } else {
        piece.rot = 0;
        piece.placed = null;
      }
      this.paintPiece(piece);
    });
    this.refresh();
  }

  emptyBox() {
    this.grid = makeGrid(this.box);
    this.pieces.forEach((p) => {
      p.placed = null;
      p.rot = 0;
      this.paintPiece(p);
    });
    this.refresh();
  }

  packedPieces() {
    return this.pieces.filter((p) => p.placed);
  }

  send() {
    const packed = this.packedPieces();
    if (!packed.length) {
      this.hoverText.setText('The box is empty. Put something in it — nobody reads an empty box.');
      this.hoverText.setColor(palette.danger);
      this.cameras.main.shake(140, 0.004);
      return;
    }
    setPacked(packed.map((p) => p.doc.id));
    this.scene.start('Processing');
  }

  // ------------------------------------------------------------- readouts

  hint() {
    return 'Drag documents into the box  ·  right-click or R turns one  ·  drag one out to put it back on the cart';
  }

  showDetail(piece) {
    if (this.dragging) return;
    const d = piece.doc;
    const { w, h } = this.cellsOf(piece);
    this.hoverText.setColor(palette.dim);
    this.hoverText.setText(
      `${d.title}  —  ${d.type} · ${d.date} · ${d.custodian} · ${d.location} · ${w}×${h}`
    );
  }

  layoutTray() {
    const pad = 10;
    const gap = 8;
    const x0 = TRAY.x + pad;
    const y0 = TRAY.y + 30;
    const maxW = TRAY.w - pad * 2;
    let cx = x0;
    let cy = y0;
    let rowH = 0;

    this.pieces
      .filter((p) => !p.placed)
      .forEach((p) => {
        const { w, h } = this.cellsOf(p);
        const pw = w * CELL - 4;
        const ph = h * CELL - 4;
        if (cx + pw > x0 + maxW && cx > x0) {
          cx = x0;
          cy += rowH + gap;
          rowH = 0;
        }
        p.container.setPosition(cx, cy - this.trayScroll);
        cx += pw + gap;
        rowH = Math.max(rowH, ph);
      });

    const bottom = cy + rowH;
    this.trayOverflow = Math.max(0, bottom - (TRAY.y + TRAY.h - 12));
    if (this.trayScroll > this.trayOverflow) {
      this.trayScroll = this.trayOverflow;
    }
  }

  refresh() {
    // Placed pieces sit on the grid; everything else flows in the tray. The
    // dragged piece follows the pointer and is skipped by both.
    this.pieces.forEach((p) => {
      if (this.dragging && this.dragging.piece === p) return;
      if (p.placed) {
        p.container.setPosition(this.gridOx + p.placed.x * CELL + 2, this.gridOy + p.placed.y * CELL + 2);
        p.container.setMask(null);
        p.container.setAlpha(1);
      } else {
        p.container.setMask(this.trayMask);
        p.container.setAlpha(0.88);
      }
    });
    this.layoutTray();

    const packed = this.packedPieces();
    const packedDocs = packed.map((p) => p.doc);
    const left = this.pieces.length - packed.length;

    // Depth, in words. It says how thoroughly each document gets looked at —
    // never whether the plan is a good one. Nothing on this screen or the
    // builder ranks the pack, which is the rule the bullseye died for.
    const coverage = expectedCoverage({
      caseData: this.caseData,
      request: this.request,
      plan: this.plan,
      packedDocs
    });
    const cells = boxCells(this.box);
    const used = packed.reduce((s, p) => {
      const c = this.cellsOf(p);
      return s + c.w * c.h;
    }, 0);

    this.readout.setText(
      packed.length
        ? `${packed.length} packed  ·  ${depthWord(coverage)}  ·  box ${Math.round((used / cells) * 100)}% full`
        : 'Nothing in the box yet.'
    );
    this.readout.setColor(packed.length ? palette.text : palette.danger);

    // Reporting only — see gameState.packingSnapshot.
    setPackingSnapshot({
      packed: packed.length,
      onCart: left,
      box: `${this.box.w}x${this.box.h}`,
      fill: Math.round((used / cells) * 100),
      depth: depthWord(coverage)
    });

    this.leftBehind.setText(
      left === 0
        ? this.pieces.length
          ? 'Everything responsive went in.'
          : 'Nothing came back responsive.'
        : `${left} stay${left === 1 ? 's' : ''} on the cart.`
    );
    this.leftBehind.setColor(left === 0 ? palette.accent : palette.dim);

    if (!this.dragging && !this.hovered) this.hoverText.setText(this.hint());
    this.sendBtn.text.setColor(packed.length ? palette.text : palette.dim);
  }
}
