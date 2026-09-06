import Phaser from 'phaser';
import { drawTitle, drawSubtitle, drawButton, palette, font } from './sceneHelpers.js';
import { currentCase } from '../systems/gameState.js';

export default class BootScene extends Phaser.Scene {
  constructor() {
    super('Boot');
  }

  create() {
    this.cameras.main.setBackgroundColor(palette.bg);
    drawTitle(this, 'DISCOVERY!', 180);
    drawSubtitle(this, 'a woodland litigation practice', 218);
    this.add
      .text(this.scale.width / 2, 262, `Level 1 · ${currentCase().title}`, {
        fontFamily: font,
        fontSize: '14px',
        color: palette.dim
      })
      .setOrigin(0.5);
    drawButton(this, 'Take the case ▶', 340, () => this.scene.start('FactPattern'), { width: 260 });
  }
}
