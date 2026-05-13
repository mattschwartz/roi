import Phaser from 'phaser';

/**
 * Placeholder smoke scene. Renders 'ROI' on a black background so we
 * can verify the toolchain wires together. Replaced once the real
 * scene topology (Boot → Preload → Menu → Floor1..5 → End, with Hud
 * and RunScene running in parallel) is implemented per proposal
 * section 1.
 */
export class BootScene extends Phaser.Scene {
  public constructor() {
    super({ key: 'BootScene' });
  }

  public create(): void {
    const { width, height } = this.scale;
    this.add
      .text(width / 2, height / 2, 'ROI', {
        color: '#ffffff',
        fontFamily: 'system-ui, sans-serif',
        fontSize: '96px',
      })
      .setOrigin(0.5);
  }
}
