import Phaser from 'phaser';
import { drawTitle, drawSubtitle, drawButton, drawMoneyBadge, drawScrollingText, drawPanel, palette, font } from './sceneHelpers.js';
import { currentCase, getMoney } from '../systems/gameState.js';

export default class DisclosuresScene extends Phaser.Scene {
  constructor() {
    super('Disclosures');
  }

  create() {
    const caseData = currentCase();
    this.cameras.main.setBackgroundColor(palette.bg);
    drawMoneyBadge(this, getMoney());
    drawTitle(this, 'Rule 31A Initial Disclosures', 40);
    drawSubtitle(this, `of ${caseData.opponent}`, 68);

    const body =
      caseData.disclosures.preamble +
      '\n\n' +
      caseData.disclosures.entries.map((e) => `${e.heading}\n${e.text}`).join('\n\n');

    drawScrollingText(this, { x: 40, y: 92, width: 560, height: 330, text: body, fontSize: '14px' });

    // The leads panel is the Phase 1 stand-in for what the interrogatories
    // and deposition mini-games will eventually earn you (Phases 2-3): the
    // specifiers are already unlocked, so this just points at them.
    drawPanel(this, 620, 92, 300, 330);
    this.add
      .text(640, 108, 'What jumps out', { fontFamily: font, fontSize: '16px', color: palette.gold })
      .setOrigin(0, 0);
    this.add
      .text(640, 136, caseData.disclosures.leads.map((l) => `• ${l}`).join('\n\n'), {
        fontFamily: font,
        fontSize: '13px',
        color: palette.text,
        lineSpacing: 3,
        wordWrap: { width: 262 }
      })
      .setOrigin(0, 0);
    this.add
      .text(640, 392, 'Interrogatories and depositions\narrive in Phase 2 — for now every\nspecifier is already unlocked.', {
        fontFamily: font,
        fontSize: '11px',
        color: palette.dim,
        lineSpacing: 2
      })
      .setOrigin(0, 0);

    drawButton(this, 'Draft the Rule 34 request ▶', 476, () => this.scene.start('RequestBuilder'), {
      width: 320,
      height: 44
    });
  }
}
