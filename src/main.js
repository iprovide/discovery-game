import Phaser from 'phaser';

import BootScene from './scenes/BootScene.js';
import FactPatternScene from './scenes/FactPatternScene.js';
import DisclosuresScene from './scenes/DisclosuresScene.js';
import RequestBuilderScene from './scenes/RequestBuilderScene.js';
import PackingScene from './scenes/PackingScene.js';
import ProcessingScene from './scenes/ProcessingScene.js';
import RevealScene from './scenes/RevealScene.js';
import CaseSummaryScene from './scenes/CaseSummaryScene.js';
import { installFeedbackBox, installErrorCapture, attachGame } from './systems/feedback.js';

// Base resolution: a 16:9 pixel-art-friendly canvas. Phaser's Scale
// Manager (FIT) letterboxes/scales this to whatever window size the
// browser gives us.
const config = {
  type: Phaser.AUTO,
  parent: 'game-root',
  width: 960,
  height: 540,
  backgroundColor: '#14171f',
  pixelArt: true,
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH
  },
  scene: [
    BootScene,
    FactPatternScene,
    DisclosuresScene,
    RequestBuilderScene,
    PackingScene,
    ProcessingScene,
    RevealScene,
    CaseSummaryScene
  ]
};

// Error capture goes in before the game does, so a crash during boot still
// shows up in a feedback report.
installErrorCapture();
const game = new Phaser.Game(config);
attachGame(game);
installFeedbackBox();

export default game;
