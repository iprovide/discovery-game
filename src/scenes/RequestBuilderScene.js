import Phaser from 'phaser';
import {
  drawTitle,
  drawPanel,
  drawButton,
  drawDropdown,
  drawMultiSelect,
  drawMoneyBadge,
  drawSegmented,
  drawDocumentPile,
  drawTextOverlay,
  palette,
  font
} from './sceneHelpers.js';
import {
  currentCase,
  getMoney,
  setRequest,
  getRequest,
  getPlan,
  setPlan,
  unlockedSpecifiers
} from '../systems/gameState.js';
import {
  requestToSentence,
  autoPackFor,
  retrieve,
  requestCost
} from '../systems/scanEngine.js';

// Findings are named by kind everywhere the player sees them, so the reading
// row reads as "what am I equipped to notice" rather than "how fast do I read".
const plural = (kinds, join = ' + ') => (kinds || []).map((k) => `${k}s`).join(join);

// Deliberately absent from this screen: any number describing how well the
// request is likely to do. The old bullseye reduced the whole plan to one green
// number, and playtesting found exactly what that invites — clicking every
// button in turn to see which makes the text greenest. Scope is shown (the pile,
// and how much of it gets opened); worth is not.

// The heart of the game. Two mandatory fields, three discovered specifiers,
// and a labor plan the player cuts two ways here and a third with their hands
// on the packing screen.
//
// The exact responsive-document count that used to live here is gone on
// purpose (GAMEPLAN.md 3.9): it turned the central gamble into arithmetic.
// What replaces it is the pile — drawn at real per-type footprints, lit for
// the documents the box your staffing buys will hold. Scope is shown; worth
// is not.
//
// Phase 3A: the Spread row is gone. How much of the pile you carry is now
// decided with your hands on the packing screen, which is the next scene.
export default class RequestBuilderScene extends Phaser.Scene {
  constructor() {
    super('RequestBuilder');
  }

  create() {
    this.cameras.main.setBackgroundColor(palette.bg);
    const caseData = currentCase();
    this.caseData = caseData;
    drawMoneyBadge(this, getMoney());
    drawTitle(this, 'Rule 34 Request', 26);

    drawButton(this, 'The facts ▾', 26, () => this.showFacts(), {
      x: 104,
      width: 148,
      height: 30,
      fontSize: '14px'
    });

    const unlocked = unlockedSpecifiers();
    // Mandatory fields start on their first option; discovered specifiers
    // start unspecified, so the default request is the broadest legal one.
    // Restored from state when the player comes back from packing to redraft,
    // so "◀ Redraft" doesn't silently throw the draft away.
    const previous = getRequest();
    const resuming = previous && Object.keys(previous).length > 0;
    this.request = {};
    caseData.requestFields.mandatory.forEach((f) => {
      this.request[f.id] = f.multi ? [f.options[0].value] : f.options[0].value;
    });
    if (resuming) this.request = { ...this.request, ...previous };

    const fields = [
      ...caseData.requestFields.mandatory.map((f) => ({ ...f, required: true })),
      ...caseData.requestFields.discoverable
        .filter((f) => unlocked.includes(f.id))
        .map((f) => ({ ...f, required: false }))
    ];

    // ---- request fields (left)
    drawPanel(this, 32, 50, 560, 208);
    this.dropdowns = [];
    fields.forEach((field, i) => {
      const y = 60 + i * 39;
      this.add
        .text(46, y + 16, field.label, { fontFamily: font, fontSize: '14px', color: palette.text })
        .setOrigin(0, 0.5);
      this.add
        .text(186, y + 16, field.required ? 'required' : 'discovered', {
          fontFamily: font,
          fontSize: '11px',
          color: field.required ? palette.dim : palette.accent
        })
        .setOrigin(0, 0.5);
      if (!field.required && !resuming) this.request[field.id] = '';

      const common = {
        x: 256,
        y,
        width: 322,
        height: 30,
        options: field.options,
        value: this.request[field.id],
        onChange: (v) => {
          this.request[field.id] = v;
          this.refresh();
        }
      };
      this.dropdowns.push(
        field.multi
          ? drawMultiSelect(this, {
              ...common,
              costPerValue: 0,
              costPerExtra: caseData.scoringConfig.extraDocTypeCost || 0
            })
          : drawDropdown(this, { ...common, allowAny: !field.required })
      );
    });

    // ---- the box (right)
    drawPanel(this, 604, 50, 324, 208);
    this.add
      .text(616, 58, 'THE BOX', { fontFamily: font, fontSize: '11px', color: palette.dim })
      .setOrigin(0, 0);
    this.pile = drawDocumentPile(this, { x: 608, y: 74, width: 316, height: 180 });

    // ---- the request as filed
    drawPanel(this, 32, 266, 896, 54);
    this.preview = this.add
      .text(46, 276, '', {
        fontFamily: font,
        fontSize: '14px',
        color: palette.text,
        lineSpacing: 3,
        fontStyle: 'italic',
        wordWrap: { width: 868 }
      })
      .setOrigin(0, 0);

    // ---- labor plan
    drawPanel(this, 32, 328, 896, 98);
    const sc = caseData.scoringConfig;
    const rowLabel = (text, y) =>
      this.add
        .text(46, y, text, { fontFamily: font, fontSize: '13px', color: palette.dim })
        .setOrigin(0, 0.5);

    rowLabel('Staffing', 354);
    this.tierSeg = drawSegmented(this, {
      x: 150,
      y: 340,
      width: 764,
      height: 28,
      options: sc.laborTiers.map((t) => ({
        id: t.id,
        label: `${t.label}  ·  ${t.cost ? `$${t.cost}` : 'free'}`
      })),
      value: getPlan().tierId,
      onChange: (id) => {
        setPlan({ tierId: id });
        this.refresh();
      }
    });

    rowLabel('Reading', 400);
    this.styleSeg = drawSegmented(this, {
      x: 150,
      y: 386,
      width: 764,
      height: 28,
      // The point of this row is *what you can register*, not how fast you
      // read, so the button says so rather than making the player learn it.
      options: sc.readingStyles.map((r) => ({
        id: r.id,
        label: `${r.label} · ${plural(r.catches)}`
      })),
      value: getPlan().styleId,
      onChange: (id) => {
        setPlan({ styleId: id });
        this.refresh();
      }
    });


    // The third decision used to be a row of buttons here called Spread. It is
    // now the packing screen — same trade, made with the hands.
    this.add
      .text(46, 444, 'How much of the pile you carry is decided next, when you pack the box.', {
        fontFamily: font,
        fontSize: '13px',
        color: palette.dim
      })
      .setOrigin(0, 0);

    this.productionCost = this.add
      .text(46, 492, '', { fontFamily: font, fontSize: '14px', color: palette.gold })
      .setOrigin(0, 0.5);

    drawButton(this, 'File and pack ▶', 492, () => this.fileRequest(), {
      x: 812,
      width: 224,
      height: 36
    });

    this.refresh();
  }

  showFacts() {
    this.dropdowns.forEach((d) => d.close());
    drawTextOverlay(this, {
      title: this.caseData.title,
      body: this.caseData.factPattern,
      width: 720,
      height: 420
    });
  }

  refresh() {
    const caseData = this.caseData;
    const plan = getPlan();
    const retrieved = retrieve(caseData.documentPool, this.request);
    // Lit exactly as autoPack would arrange them, so the preview is the same
    // arrangement the "let the paralegals sort it" button produces rather than
    // a second, differently-wrong estimate of capacity.
    const fitted = autoPackFor(caseData, plan, retrieved);

    this.preview.setText(requestToSentence(caseData, this.request));

    // The pile, and how much of it gets opened. No pass counts: playtesting
    // found "52 passes each" reads as depth, which collides head-on with the
    // Spread row and made the two look like the same knob.
    this.pile.update(retrieved, new Set(fitted.packed));

    // The only price on this screen. Staffing carries its own on the button;
    // this is the one that's easy to run up without noticing.
    const extra = requestCost(caseData, this.request);
    this.productionCost.setText(extra ? `Extra productions: -$${extra.toLocaleString()}` : '');

    this.tierSeg.setValue(plan.tierId);
    this.styleSeg.setValue(plan.styleId);
  }

  fileRequest() {
    this.dropdowns.forEach((d) => d.close());
    setRequest({ ...this.request });
    this.scene.start('Packing');
  }
}
