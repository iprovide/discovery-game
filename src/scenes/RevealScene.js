import Phaser from 'phaser';
import { drawTitle, drawPanel, drawButton, drawMoneyBadge, palette, font } from './sceneHelpers.js';
import { currentCase, getMoney, getResult } from '../systems/gameState.js';

// The payoff beat (GAMEPLAN.md 3.6). One popup per captured hot zone, in the
// order the scan found them. Money is not banked here — CaseSummary commits
// the net once, so replaying this scene can never double-pay.
export default class RevealScene extends Phaser.Scene {
  constructor() {
    super('Reveal');
  }

  create() {
    this.cameras.main.setBackgroundColor(palette.bg);
    const result = getResult();
    this.result = result;
    this.reveals = result.reveals;
    this.running = 0;

    this.moneyBadge = drawMoneyBadge(this, getMoney());

    if (!this.reveals.length) {
      drawTitle(this, 'Nothing.', 180);
      this.add
        .text(this.scale.width / 2, 236, this.emptyMessage(), {
          fontFamily: font,
          fontSize: '16px',
          color: palette.dim,
          align: 'center',
          lineSpacing: 6,
          wordWrap: { width: 620 }
        })
        .setOrigin(0.5, 0);
      drawButton(this, 'Close the file ▶', 400, () => this.scene.start('CaseSummary'), { width: 260 });
      return;
    }

    drawTitle(this, 'Discovery!', 46);
    this.counter = this.add
      .text(this.scale.width / 2, 80, '', { fontFamily: font, fontSize: '13px', color: palette.dim })
      .setOrigin(0.5);

    this.panel = drawPanel(this, 130, 116, 700, 250);
    this.source = this.add
      .text(this.scale.width / 2, 142, '', { fontFamily: font, fontSize: '13px', color: palette.accent })
      .setOrigin(0.5, 0);
    this.flavor = this.add
      .text(this.scale.width / 2, 178, '', {
        fontFamily: font,
        fontSize: '18px',
        color: palette.text,
        align: 'center',
        lineSpacing: 7,
        wordWrap: { width: 620 }
      })
      .setOrigin(0.5, 0);
    this.amount = this.add
      .text(this.scale.width / 2, 320, '', { fontFamily: font, fontSize: '30px', color: palette.gold })
      .setOrigin(0.5, 0);

    this.nextBtn = drawButton(this, 'Next ▶', 424, () => this.advance(), { width: 240 });
    this.input.keyboard.on('keydown-SPACE', () => this.advance());

    this.index = -1;
    this.advance();
  }

  emptyMessage() {
    const s = this.result.stats;
    if (s.retrievedCount === 0) {
      return 'Nothing came back at all. The request was scoped so tightly that\nno document in their possession answered it.';
    }
    if (s.retrievedValue === 0) {
      return `${s.retrievedCount} documents came back and every one of them was junk.\nThe request matched the wrong things.`;
    }
    return (
      `${s.assignedCount} documents were reviewed and nothing crossed the threshold.\n` +
      'There was something in there — the haystack was just too big for the hours you bought.'
    );
  }

  advance() {
    this.index += 1;
    if (this.index >= this.reveals.length) {
      this.scene.start('CaseSummary');
      return;
    }

    const reveal = this.reveals[this.index];
    this.counter.setText(`${this.index + 1} of ${this.reveals.length}`);
    this.source.setText(`— ${reveal.kind || 'finding'} in “${reveal.docTitle}”`);
    this.flavor.setText(reveal.flavor);
    this.amount.setText(`+$${reveal.value}`);
    this.running += reveal.value;
    this.moneyBadge.setText(`$${(getMoney() + this.running).toLocaleString()}`);

    if (this.index === this.reveals.length - 1) this.nextBtn.setLabel('Close the file ▶');

    // Loot-drop pop.
    [this.flavor, this.amount, this.source].forEach((t) => t.setAlpha(0));
    this.amount.setScale(0.6);
    this.tweens.add({ targets: [this.flavor, this.source], alpha: 1, duration: 260 });
    this.tweens.add({
      targets: this.amount,
      alpha: 1,
      scale: 1,
      duration: 420,
      delay: 140,
      ease: 'Back.easeOut'
    });
    this.cameras.main.flash(140, 232, 195, 90);
  }
}
