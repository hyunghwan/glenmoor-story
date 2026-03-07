import Phaser from 'phaser'

export class BootScene extends Phaser.Scene {
  constructor() {
    super('boot')
  }

  preload(): void {
    this.load.json('map:glenmoor-pass', 'data/maps/glenmoor-pass.json')
  }

  create(): void {
    this.scene.start('battle')
  }
}
