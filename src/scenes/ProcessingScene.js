import Phaser from 'phaser';
import { drawTitle, drawSubtitle, drawPanel, drawButton, drawMoneyBadge, palette, font } from './sceneHelpers.js';
import {
  currentCase,
  getMoney,
  getRequest,
  getPlan,
  getPacked,
  getAttempt,
  setResult
} from '../systems/gameState.js';
import { resolveRequest } from '../systems/scanEngine.js';

// The scan, animated (GAMEPLAN.md 3.5). The resolution is already fully
// computed by the engine before a single pixel moves — this scene is a
// replay of `result.reviewed[i].windows` in order, so what you watch is
// exactly what happened. Passive for Phase 1; the open question of making
// it interactive is still open.
const BAR_X = 372;
const BAR_W = 540;
const BAR_Y = 250;
const BAR_H = 46;

export default class ProcessingScene extends Phaser.Scene {
  constructor() {
    super('Processing');
  }

  create() {
    const caseData = currentCase();
    this.cameras.main.setBackgroundColor(palette.bg);
    drawMoneyBadge(this, getMoney());

    this.result = resolveRequest({
      caseData,
      request: getRequest(),
      plan: getPlan(),
      // What the player packed is what gets reviewed (Phase 3A). Falling back
      // to null lets the engine auto-pack, which is what a replay or a test
      // harness gets.
      packed: getPacked(),
      seed: getAttempt()
    });
    setResult(this.result);

    drawTitle(this, 'Discovery in Progress', 38);
    const labor = this.result.labor;
    drawSubtitle(
      this,
      `${this.result.stats.assignedCount} in the box · ${this.result.stats.unreadCount} left on the cart · ` +
        `${labor.style.label.toLowerCase()}, ${labor.windowsPerDocument} passes each`,
      66
    );

    // ---- document queue (left)
    drawPanel(this, 40, 92, 300, 380);
    this.add
      .text(58, 104, 'REVIEW QUEUE', { fontFamily: font, fontSize: '12px', color: palette.dim })
      .setOrigin(0, 0);

    this.rows = this.result.reviewed.map((r, i) => {
      const y = 128 + i * 24;
      const dot = this.add.rectangle(60, y + 8, 8, 8, 0x39425a).setOrigin(0, 0);
      const label = this.add
        .text(76, y + 2, this.truncate(r.doc.title, 30), {
          fontFamily: font,
          fontSize: '12px',
          color: palette.dim
        })
        .setOrigin(0, 0);
      return { dot, label };
    });

    // ---- current document (right)
    drawPanel(this, 360, 92, 560, 380);
    this.docTitle = this.add
      .text(372, 112, '', { fontFamily: font, fontSize: '17px', color: palette.text, wordWrap: { width: 536 } })
      .setOrigin(0, 0);
    this.docMeta = this.add
      .text(372, 160, '', { fontFamily: font, fontSize: '12px', color: palette.dim })
      .setOrigin(0, 0);

    this.add
      .text(BAR_X, BAR_Y - 22, 'PAGES SAMPLED', { fontFamily: font, fontSize: '11px', color: palette.dim })
      .setOrigin(0, 0);

    this.barBg = this.add.rectangle(BAR_X, BAR_Y, BAR_W, BAR_H, palette.noise).setOrigin(0, 0);
    this.barBg.setStrokeStyle(2, palette.panelEdge);
    this.gfx = this.add.graphics();
    this.zoneGfx = this.add.graphics();

    this.status = this.add
      .text(372, 330, '', { fontFamily: font, fontSize: '13px', color: palette.dim, lineSpacing: 4, wordWrap: { width: 536 } })
      .setOrigin(0, 0);

    this.foundText = this.add
      .text(372, 430, '', { fontFamily: font, fontSize: '15px', color: palette.gold })
      .setOrigin(0, 0);

    this.skipBtn = drawButton(this, 'Skip ahead ▶', 500, () => this.finish(), {
      x: 800,
      width: 200,
      height: 38,
      fontSize: '15px'
    });

    this.found = 0;
    this.docIdx = -1;
    this.nextDoc();
  }

  truncate(s, n) {
    return s.length > n ? `${s.slice(0, n - 1)}…` : s;
  }

  nextDoc() {
    if (this.docIdx >= 0 && this.rows[this.docIdx]) {
      const r = this.result.reviewed[this.docIdx];
      this.rows[this.docIdx].dot.setFillStyle(r.captured.length ? 0xe8c35a : 0x4f5c78);
      this.rows[this.docIdx].label.setColor(r.captured.length ? palette.gold : palette.dim);
    }
    this.docIdx += 1;

    if (this.docIdx >= this.result.reviewed.length) {
      this.time.delayedCall(500, () => this.finish());
      return;
    }

    const review = this.result.reviewed[this.docIdx];
    this.current = review;
    this.step = 0;
    this.gfx.clear();
    this.zoneGfx.clear();
    this.docTitle.setText(review.doc.title);
    this.docMeta.setText(
      `${review.doc.type} · ${review.doc.date} · ${review.doc.custodian} · ${review.layout.length} pages after culling`
    );
    this.status.setText('');
    if (this.rows[this.docIdx]) {
      this.rows[this.docIdx].dot.setFillStyle(0x8fbf6b);
      this.rows[this.docIdx].label.setColor(palette.text);
    }

    const budget = review.windows.length;
    const delay = Phaser.Math.Clamp(Math.round(1300 / Math.max(1, budget)), 16, 70);
    this.timer = this.time.addEvent({
      delay,
      repeat: budget - 1,
      callback: () => this.tick()
    });
  }

  tick() {
    const review = this.current;
    const scale = BAR_W / review.layout.length;
    const w = review.windows[this.step];

    // The read window, painted onto the document bar.
    this.gfx.fillStyle(0x4f5c78, 1);
    this.gfx.fillRect(BAR_X + w.start * scale, BAR_Y + 2, Math.max(1, (w.end - w.start) * scale), BAR_H - 4);

    // A cursor showing where the associate's eye just landed.
    this.gfx.fillStyle(0xf2ede1, 0.55);
    this.gfx.fillRect(BAR_X + w.end * scale - 1, BAR_Y + 2, 2, BAR_H - 4);

    review.zones.forEach((zone) => {
      if (zone.captured && zone.capturedAtStep === this.step) this.popZone(zone, scale);
    });

    this.step += 1;
    if (this.step >= review.windows.length) {
      this.time.delayedCall(review.captured.length ? 620 : 260, () => this.nextDoc());
    }
  }

  popZone(zone, scale) {
    this.found += 1;
    this.foundText.setText(`${this.found} document${this.found === 1 ? '' : 's'} of interest so far`);

    this.zoneGfx.fillStyle(0xe8c35a, 1);
    this.zoneGfx.fillRect(BAR_X + zone.start * scale, BAR_Y + 2, Math.max(3, zone.length * scale), BAR_H - 4);

    const x = BAR_X + (zone.start + zone.length / 2) * scale;
    const pop = this.add
      .text(x, BAR_Y - 6, `+$${zone.value}`, { fontFamily: font, fontSize: '19px', color: palette.gold })
      .setOrigin(0.5, 1);
    this.tweens.add({
      targets: pop,
      y: BAR_Y - 40,
      alpha: 0,
      duration: 900,
      ease: 'Cubic.easeOut',
      onComplete: () => pop.destroy()
    });

    this.status.setText('Something in here.');
    this.status.setColor(palette.gold);
    this.cameras.main.flash(120, 232, 195, 90);
  }

  finish() {
    if (this.timer) this.timer.remove();
    this.scene.start('Reveal');
  }
}
