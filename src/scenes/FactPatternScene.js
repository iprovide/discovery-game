import Phaser from 'phaser';
import { drawTitle, drawSubtitle, drawButton, drawMoneyBadge, drawScrollingText, palette, font } from './sceneHelpers.js';
import { currentCase, getMoney, getCaseIndex } from '../systems/gameState.js';

export default class FactPatternScene extends Phaser.Scene {
  constructor() {
    super('FactPattern');
  }

  create() {
    const caseData = currentCase();
    this.cameras.main.setBackgroundColor(palette.bg);
    drawMoneyBadge(this, getMoney());

    this.add
      .text(20, 18, `CASE ${String(getCaseIndex() + 1).padStart(2, '0')}`, {
        fontFamily: font,
        fontSize: '13px',
        color: palette.dim
      })
      .setOrigin(0, 0);

    drawTitle(this, caseData.title, 48);
    drawSubtitle(this, caseData.subtitle, 78);

    drawScrollingText(this, {
      x: 90,
      y: 110,
      width: 780,
      height: 300,
      text: caseData.factPattern
    });

    this.add
      .text(90, 424, `Our client: ${caseData.client}`, {
        fontFamily: font,
        fontSize: '14px',
        color: palette.accent
      })
      .setOrigin(0, 0);
    this.add
      .text(90, 446, `Opposing: ${caseData.opponent}`, {
        fontFamily: font,
        fontSize: '14px',
        color: palette.dim
      })
      .setOrigin(0, 0);

    drawButton(this, 'Read their disclosures ▶', 484, () => this.scene.start('Disclosures'), {
      width: 300,
      height: 44
    });
  }
}
