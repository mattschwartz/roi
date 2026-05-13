import Phaser from 'phaser';

import { BootScene } from '@scenes/BootScene';

// Smoke entry point. This boots a minimal Phaser game with a single
// scene that renders 'ROI' on a black background — proves Phaser +
// Vite + TS + Bun wire together end-to-end. Real scene topology
// (Boot → Preload → Menu → Floor1..5 → End, plus Hud / RunScene)
// lands in the downstream scene-topology task.
const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  parent: 'game',
  width: 1280,
  height: 720,
  backgroundColor: '#000000',
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  scene: [BootScene],
};

new Phaser.Game(config);
