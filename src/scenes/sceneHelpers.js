import Phaser from 'phaser';
import { DOC_FOOTPRINTS, DOC_FOOTPRINT_FALLBACK } from '../systems/packing.js';

// Shared UI primitives. Still placeholder-grade visuals (rectangles and a
// serif webfont) — the Phase 4 art pass replaces the look, not the API.

const PALETTE = {
  bg: 0x14171f,
  panel: 0x1f2430,
  panelEdge: 0x39425a,
  text: '#f2ede1',
  dim: '#9aa3b8',
  accent: '#8fbf6b',
  gold: '#e8c35a',
  danger: '#d97b6c',
  button: 0x2f3646,
  buttonHover: 0x3c4658,
  buttonOn: 0x4b6340,
  noise: 0x2b3244,
  read: 0x4f5c78,
  hot: 0xe8c35a
};

const FONT = 'Georgia, "Times New Roman", serif';

export const palette = PALETTE;
export const font = FONT;

export function drawTitle(scene, text, y = 44) {
  return scene.add
    .text(scene.scale.width / 2, y, text, { fontFamily: FONT, fontSize: '30px', color: PALETTE.text })
    .setOrigin(0.5);
}

export function drawSubtitle(scene, text, y = 74) {
  return scene.add
    .text(scene.scale.width / 2, y, text, { fontFamily: FONT, fontSize: '15px', color: PALETTE.dim })
    .setOrigin(0.5);
}

export function drawBody(scene, text, y = 220, opts = {}) {
  return scene.add
    .text(opts.x ?? scene.scale.width / 2, y, text, {
      fontFamily: FONT,
      fontSize: opts.fontSize || '16px',
      color: opts.color || PALETTE.text,
      align: opts.align || 'center',
      lineSpacing: opts.lineSpacing ?? 5,
      wordWrap: { width: opts.width || Math.min(760, scene.scale.width - 120) }
    })
    .setOrigin(opts.originX ?? 0.5, opts.originY ?? 0);
}

export function drawPanel(scene, x, y, width, height, fill = PALETTE.panel) {
  return scene.add
    .rectangle(x, y, width, height, fill)
    .setStrokeStyle(2, PALETTE.panelEdge)
    .setOrigin(0, 0);
}

export function drawButton(scene, label, y, onClick, opts = {}) {
  const width = opts.width || 260;
  const height = opts.height || 48;
  const x = opts.x ?? scene.scale.width / 2;
  const base = opts.fill ?? PALETTE.button;

  const rect = scene.add
    .rectangle(x, y, width, height, base)
    .setStrokeStyle(2, PALETTE.panelEdge)
    .setInteractive({ useHandCursor: true });

  const text = scene.add
    .text(x, y, label, {
      fontFamily: FONT,
      fontSize: opts.fontSize || '18px',
      color: opts.color || PALETTE.text,
      align: 'center'
    })
    .setOrigin(0.5);

  rect.on('pointerover', () => rect.setFillStyle(opts.hover ?? PALETTE.buttonHover));
  rect.on('pointerout', () => rect.setFillStyle(rect.getData('on') ? PALETTE.buttonOn : base));
  rect.on('pointerdown', () => onClick && onClick());

  return {
    rect,
    text,
    setOn(on) {
      rect.setData('on', on);
      rect.setFillStyle(on ? PALETTE.buttonOn : base);
    },
    setLabel(v) {
      text.setText(v);
    },
    destroy() {
      rect.destroy();
      text.destroy();
    }
  };
}

export function drawMoneyBadge(scene, money) {
  return scene.add
    .text(scene.scale.width - 20, 18, `$${money.toLocaleString()}`, {
      fontFamily: FONT,
      fontSize: '20px',
      color: money < 0 ? PALETTE.danger : PALETTE.accent
    })
    .setOrigin(1, 0);
}

// A dropdown that opens a real option list. Options are
// { value, label }; `allowAny` prepends an "— any —" entry that clears the
// field (that's how a request leaves a specifier unspecified).
export function drawDropdown(scene, opts) {
  const { x, y, width = 330, height = 32, options, allowAny = false, onChange } = opts;
  let value = opts.value || '';

  const entries = allowAny ? [{ value: '', label: '— any —' }, ...options] : options.slice();

  const box = scene.add
    .rectangle(x, y, width, height, PALETTE.button)
    .setStrokeStyle(2, PALETTE.panelEdge)
    .setOrigin(0, 0)
    .setInteractive({ useHandCursor: true });

  const labelFor = (v) => entries.find((e) => e.value === v)?.label ?? '— any —';

  const text = scene.add
    .text(x + 10, y + height / 2, labelFor(value), {
      fontFamily: FONT,
      fontSize: '15px',
      color: value ? PALETTE.text : PALETTE.dim
    })
    .setOrigin(0, 0.5);

  const caret = scene.add
    .text(x + width - 12, y + height / 2, '▾', { fontFamily: FONT, fontSize: '14px', color: PALETTE.dim })
    .setOrigin(1, 0.5);

  let list = null;

  function close() {
    if (list) {
      list.destroy(true);
      list = null;
    }
  }

  function open() {
    if (list) {
      close();
      return;
    }
    list = scene.add.container(0, 0).setDepth(1000);

    // Click-away shield behind the list.
    const shield = scene.add
      .rectangle(0, 0, scene.scale.width, scene.scale.height, 0x000000, 0.35)
      .setOrigin(0, 0)
      .setInteractive();
    shield.on('pointerdown', close);
    list.add(shield);

    const rowH = 28;
    const listH = entries.length * rowH + 8;
    // Flip upward if the list would run off the bottom of the canvas.
    const top = y + height + listH > scene.scale.height - 8 ? y - listH - 2 : y + height + 2;

    const bg = scene.add
      .rectangle(x, top, width, listH, PALETTE.panel)
      .setStrokeStyle(2, PALETTE.panelEdge)
      .setOrigin(0, 0);
    list.add(bg);

    entries.forEach((entry, i) => {
      const ry = top + 4 + i * rowH;
      const hit = scene.add
        .rectangle(x + 2, ry, width - 4, rowH, PALETTE.panel)
        .setOrigin(0, 0)
        .setInteractive({ useHandCursor: true });
      const t = scene.add
        .text(x + 12, ry + rowH / 2, entry.label, {
          fontFamily: FONT,
          fontSize: '15px',
          color: entry.value === value ? PALETTE.accent : PALETTE.text
        })
        .setOrigin(0, 0.5);
      hit.on('pointerover', () => hit.setFillStyle(PALETTE.buttonHover));
      hit.on('pointerout', () => hit.setFillStyle(PALETTE.panel));
      hit.on('pointerdown', () => {
        value = entry.value;
        text.setText(labelFor(value));
        text.setColor(value ? PALETTE.text : PALETTE.dim);
        close();
        onChange && onChange(value);
      });
      list.add(hit);
      list.add(t);
    });
  }

  box.on('pointerover', () => box.setFillStyle(PALETTE.buttonHover));
  box.on('pointerout', () => box.setFillStyle(PALETTE.button));
  box.on('pointerdown', open);

  return {
    get value() {
      return value;
    },
    close,
    destroy() {
      close();
      box.destroy();
      text.destroy();
      caret.destroy();
    }
  };
}

// Scrolling body text inside a fixed frame — used for the fact pattern and
// the disclosures, which are both longer than one screen of comfortable type.
export function drawScrollingText(scene, opts) {
  const { x, y, width, height, text: content, fontSize = '16px' } = opts;

  const frame = scene.add
    .rectangle(x, y, width, height, PALETTE.panel)
    .setStrokeStyle(2, PALETTE.panelEdge)
    .setOrigin(0, 0);

  const body = scene.add
    .text(x + 18, y + 14, content, {
      fontFamily: FONT,
      fontSize,
      color: PALETTE.text,
      lineSpacing: 6,
      wordWrap: { width: width - 36 }
    })
    .setOrigin(0, 0);

  const mask = scene.make
    .graphics()
    .fillRect(x + 2, y + 2, width - 4, height - 4)
    .createGeometryMask();
  body.setMask(mask);

  const overflow = Math.max(0, body.height + 28 - height);
  let offset = 0;

  const hint =
    overflow > 0
      ? scene.add
          .text(x + width - 14, y + height - 10, 'scroll ▾', {
            fontFamily: FONT,
            fontSize: '12px',
            color: PALETTE.dim
          })
          .setOrigin(1, 1)
      : null;

  if (overflow > 0) {
    frame.setInteractive();
    scene.input.on('wheel', (_p, _o, _dx, dy) => {
      offset = Phaser.Math.Clamp(offset + dy * 0.5, 0, overflow);
      body.setY(y + 14 - offset);
      if (hint) hint.setAlpha(offset >= overflow - 1 ? 0 : 1);
    });
  }

  return { frame, body };
}

// A row of mutually-exclusive small buttons. Used for the three labor knobs,
// which all want "pick exactly one of these" and don't want a dropdown's
// extra click.
export function drawSegmented(scene, opts) {
  const { x, y, width, height = 30, options, value, onChange, gap = 6 } = opts;
  const each = (width - gap * (options.length - 1)) / options.length;
  const buttons = options.map((opt, i) => {
    const btn = drawButton(scene, opt.label, y + height / 2, () => onChange && onChange(opt.id), {
      x: x + i * (each + gap) + each / 2,
      width: each,
      height,
      fontSize: opts.fontSize || '14px'
    });
    return { btn, opt };
  });

  function setValue(v) {
    buttons.forEach(({ btn, opt }) => btn.setOn(opt.id === v));
  }
  setValue(value);
  return { setValue, buttons };
}

// A modal panel of scrolling text, dismissed by clicking anywhere outside it.
// Used for the fact pattern on the request builder, which the player needs to
// re-read while drafting but shouldn't have to leave the screen for.
export function drawTextOverlay(scene, opts) {
  const { title, body } = opts;
  const w = opts.width || 700;
  const h = opts.height || 400;
  const x = (scene.scale.width - w) / 2;
  const y = (scene.scale.height - h) / 2;

  const layer = scene.add.container(0, 0).setDepth(2000);
  const shield = scene.add
    .rectangle(0, 0, scene.scale.width, scene.scale.height, 0x000000, 0.6)
    .setOrigin(0, 0)
    .setInteractive();
  layer.add(shield);

  const frame = scene.add
    .rectangle(x, y, w, h, PALETTE.panel)
    .setStrokeStyle(2, PALETTE.panelEdge)
    .setOrigin(0, 0)
    .setInteractive();
  layer.add(frame);

  const heading = scene.add
    .text(x + 24, y + 18, title, { fontFamily: FONT, fontSize: '20px', color: PALETTE.text })
    .setOrigin(0, 0);
  layer.add(heading);

  const text = scene.add
    .text(x + 24, y + 56, body, {
      fontFamily: FONT,
      fontSize: '16px',
      color: PALETTE.text,
      lineSpacing: 6,
      wordWrap: { width: w - 48 }
    })
    .setOrigin(0, 0);
  layer.add(text);

  const mask = scene.make
    .graphics()
    .fillRect(x + 2, y + 52, w - 4, h - 84)
    .createGeometryMask();
  text.setMask(mask);

  const overflow = Math.max(0, text.height + 56 + 28 - h);
  let offset = 0;
  // Scoped to this overlay and removed on close — a scene-level handler that
  // outlives the container would fire against destroyed objects.
  const onWheel = (_p, _o, _dx, dy) => {
    if (!overflow) return;
    offset = Phaser.Math.Clamp(offset + dy * 0.5, 0, overflow);
    text.setY(y + 56 - offset);
  };
  scene.input.on('wheel', onWheel);

  const hint = scene.add
    .text(x + w - 24, y + h - 16, overflow ? 'scroll ▾  ·  click anywhere to close' : 'click anywhere to close', {
      fontFamily: FONT,
      fontSize: '12px',
      color: PALETTE.dim
    })
    .setOrigin(1, 1);
  layer.add(hint);

  function close() {
    scene.input.off('wheel', onWheel);
    mask.destroy();
    layer.destroy(true);
    if (opts.onClose) opts.onClose();
  }
  shield.on('pointerdown', close);
  frame.on('pointerdown', close);

  return { close };
}

// The box (GAMEPLAN.md 3.5). Replaces the bullseye, which asked the player to
// hill-climb a green number and could not stay honest once chain payouts made
// outcomes bimodal.
//
// This shows one thing, physically: the pile your request pulled, and how much
// of it your team will actually open. Documents are drawn at a footprint set by
// their type — a text message is a scrap, a transcript is a brick — which is
// both the "give the types some identity" note and a standing preview of the
// real packing mini-game.
//
// It deliberately shows no value signal of any kind. Scope is information the
// player has earned; what is *in* the box is the gamble.
// Derived, not duplicated: the cell footprints in src/systems/packing.js are
// the single source of truth for how big a document is, so the preview here
// and the packing grid cannot drift out of step.
const cellsToPixels = (f) => ({ w: f.w * 6 + 7, h: f.h * 7 + 6 });
const DOC_SHAPES = Object.fromEntries(
  Object.entries(DOC_FOOTPRINTS).map(([type, f]) => [type, cellsToPixels(f)])
);
const DOC_FALLBACK = cellsToPixels(DOC_FOOTPRINT_FALLBACK);

export function drawDocumentPile(scene, opts) {
  const { x, y, width, height } = opts;
  const gfx = scene.add.graphics();
  const caption = scene.add
    .text(x + width / 2, y + height - 4, '', {
      fontFamily: FONT,
      fontSize: '13px',
      color: PALETTE.dim,
      align: 'center',
      wordWrap: { width: width - 16 }
    })
    .setOrigin(0.5, 1);

  return {
    // `fitted` is a Set of document ids the box will actually hold — the very
    // ones autoPack places, so the lit documents in the preview are the lit
    // documents on the packing screen.
    update(docs, fitted) {
      const fittedIds = fitted instanceof Set ? fitted : new Set();
      const openedCount = fitted instanceof Set ? fitted.size : fitted;
      gfx.clear();
      const pad = 8;
      const gap = 5;
      const usableW = width - pad * 2;
      const usableH = height - 30;

      // Lay the pile out at the largest scale that still fits. A thin folder
      // therefore draws as a few big documents and a warehouse as a mass of
      // small ones, so the size of the pile reads before any caption does.
      const layoutAt = (scale) => {
        const rows = [];
        let row = [];
        let rowW = 0;
        let tallest = 0;
        docs.forEach((doc, i) => {
          const base = DOC_SHAPES[doc.type] || DOC_FALLBACK;
          const shape = { w: Math.round(base.w * scale), h: Math.round(base.h * scale) };
          if (rowW + shape.w + gap > usableW && row.length) {
            rows.push({ items: row, w: rowW - gap, h: tallest });
            row = [];
            rowW = 0;
            tallest = 0;
          }
          shape.lit = fittedIds.size ? fittedIds.has(doc.id) : i < openedCount;
          row.push(shape);
          rowW += shape.w + gap;
          tallest = Math.max(tallest, shape.h);
        });
        if (row.length) rows.push({ items: row, w: rowW - gap, h: tallest });
        const totalH = rows.reduce((t, r) => t + r.h + gap, -gap);
        return { rows, totalH };
      };

      let layout = layoutAt(1);
      for (let scale = 2.4; scale >= 0.55; scale -= 0.05) {
        const candidate = layoutAt(scale);
        if (candidate.totalH <= usableH) {
          layout = candidate;
          break;
        }
      }

      const { rows, totalH } = layout;
      let cursorY = y + Math.max(4, (usableH - totalH) / 2);
      let drawn = 0;
      rows.forEach((r) => {
        const baseY = cursorY + r.h;
        let cx = x + pad + (usableW - r.w) / 2;
        r.items.forEach((shape) => {
          const opened = shape.lit;
          const h = shape.h;
          const top = baseY - h;
          gfx.fillStyle(opened ? 0x6f7f9e : 0x262c39, 1);
          gfx.fillRect(cx, top, shape.w, h);
          gfx.lineStyle(1, opened ? 0xc8cfe0 : 0x39425a, 1);
          gfx.strokeRect(cx, top, shape.w, h);
          if (opened && shape.w > 12) {
            // Ruled lines, so an opened document reads as one somebody read.
            gfx.lineStyle(1, 0xdfe5f2, 0.45);
            const lines = Math.max(2, Math.min(4, Math.floor(h / 9)));
            for (let i = 1; i <= lines; i += 1) {
              const ly = top + (h * i) / (lines + 1);
              gfx.beginPath();
              gfx.moveTo(cx + 3, ly);
              gfx.lineTo(cx + shape.w - 3, ly);
              gfx.strokePath();
            }
          }
          cx += shape.w + gap;
          drawn += 1;
        });
        cursorY += r.h + gap;
      });

      const total = docs.length;
      const left = Math.max(0, total - openedCount);
      if (total === 0) {
        caption.setText('Nothing came back responsive.');
        caption.setColor(PALETTE.danger);
      } else if (left === 0) {
        caption.setText(`All ${total} fit in the box.`);
        caption.setColor(PALETTE.accent);
      } else {
        caption.setText(`${openedCount} fit in the box. ${left} stay on the cart.`);
        caption.setColor(PALETTE.danger);
      }
    },
    destroy() {
      gfx.destroy();
      caption.destroy();
    }
  };
}

// A dropdown that ticks several values at once, for a field the engine treats
// as a set (document type). Same footprint and popup behaviour as
// drawDropdown, so it drops into the field list without disturbing the layout.
//
// The closed state shows what's selected and, when more than one type is
// ticked, what the extra production is costing — that price is the only thing
// stopping "tick every box" from being free breadth.
export function drawMultiSelect(scene, opts) {
  const { x, y, width = 330, height = 32, options, onChange, costPerExtra = 0 } = opts;
  let values = (opts.value || []).slice();

  const box = scene.add
    .rectangle(x, y, width, height, PALETTE.button)
    .setStrokeStyle(2, PALETTE.panelEdge)
    .setOrigin(0, 0)
    .setInteractive({ useHandCursor: true });

  const text = scene.add
    .text(x + 10, y + height / 2, '', {
      fontFamily: FONT,
      fontSize: '15px',
      color: PALETTE.text
    })
    .setOrigin(0, 0.5);

  const cost = scene.add
    .text(x + width - 26, y + height / 2, '', {
      fontFamily: FONT,
      fontSize: '13px',
      color: PALETTE.gold
    })
    .setOrigin(1, 0.5);

  scene.add
    .text(x + width - 12, y + height / 2, '▾', { fontFamily: FONT, fontSize: '14px', color: PALETTE.dim })
    .setOrigin(1, 0.5);

  const truncate = (s, n) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

  function paint() {
    const labels = values
      .map((v) => options.find((o) => o.value === v)?.label)
      .filter(Boolean);
    text.setText(labels.length ? truncate(labels.join(', '), 30) : '— pick at least one —');
    text.setColor(labels.length ? PALETTE.text : PALETTE.danger);
    const extra = Math.max(0, values.length - 1) * costPerExtra;
    cost.setText(extra ? `+$${extra}` : '');
  }

  let list = null;
  function close() {
    if (list) {
      list.destroy(true);
      list = null;
    }
  }

  function open() {
    if (list) return close();
    list = scene.add.container(0, 0).setDepth(1000);
    const shield = scene.add
      .rectangle(0, 0, scene.scale.width, scene.scale.height, 0x000000, 0.35)
      .setOrigin(0, 0)
      .setInteractive();
    shield.on('pointerdown', close);
    list.add(shield);

    const rowH = 28;
    const listH = options.length * rowH + 8;
    const top = y + height + listH > scene.scale.height - 8 ? y - listH - 2 : y + height + 2;
    const bg = scene.add
      .rectangle(x, top, width, listH, PALETTE.panel)
      .setStrokeStyle(2, PALETTE.panelEdge)
      .setOrigin(0, 0);
    list.add(bg);

    options.forEach((entry, i) => {
      const ry = top + 4 + i * rowH;
      const on = values.includes(entry.value);
      const hit = scene.add
        .rectangle(x + 2, ry, width - 4, rowH, PALETTE.panel)
        .setOrigin(0, 0)
        .setInteractive({ useHandCursor: true });
      const tick = scene.add
        .text(x + 12, ry + rowH / 2, on ? '☑' : '☐', {
          fontFamily: FONT,
          fontSize: '15px',
          color: on ? PALETTE.accent : PALETTE.dim
        })
        .setOrigin(0, 0.5);
      const label = scene.add
        .text(x + 34, ry + rowH / 2, entry.label, {
          fontFamily: FONT,
          fontSize: '15px',
          color: on ? PALETTE.accent : PALETTE.text
        })
        .setOrigin(0, 0.5);
      // Every type past the first is priced, and the price is shown on the row
      // you are about to tick rather than discovered afterwards.
      const price = scene.add
        .text(x + width - 12, ry + rowH / 2, on || !values.length ? '' : `+$${costPerExtra}`, {
          fontFamily: FONT,
          fontSize: '12px',
          color: PALETTE.dim
        })
        .setOrigin(1, 0.5);

      hit.on('pointerover', () => hit.setFillStyle(PALETTE.buttonHover));
      hit.on('pointerout', () => hit.setFillStyle(PALETTE.panel));
      hit.on('pointerdown', () => {
        if (values.includes(entry.value)) {
          // Never let the player empty a required field from in here.
          if (values.length === 1) return;
          values = values.filter((v) => v !== entry.value);
        } else {
          values = [...values, entry.value];
        }
        paint();
        close();
        open();
        onChange && onChange(values.slice());
      });
      list.add(hit);
      list.add(tick);
      list.add(label);
      list.add(price);
    });
  }

  box.on('pointerover', () => box.setFillStyle(PALETTE.buttonHover));
  box.on('pointerout', () => box.setFillStyle(PALETTE.button));
  box.on('pointerdown', open);

  paint();
  return {
    get value() {
      return values.slice();
    },
    close,
    destroy() {
      close();
      box.destroy();
      text.destroy();
      cost.destroy();
    }
  };
}
