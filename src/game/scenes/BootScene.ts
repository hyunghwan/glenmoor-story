import Phaser from 'phaser'

export class BootScene extends Phaser.Scene {
  constructor() {
    super('boot')
  }

  preload(): void {
    this.load.json('map:glenmoor-pass', 'data/maps/glenmoor-pass.json')
    this.load.image('duel:backdrop', 'assets/textures/parchment_background.jpg')
    this.load.audio('music:battle', 'assets/audio/music/cynic_battle_loop.ogg')
    this.load.audio('sfx:confirm', 'assets/audio/sfx/confirm.ogg')
    this.load.audio('sfx:cancel', 'assets/audio/sfx/cancel.ogg')
    this.load.audio('sfx:select', 'assets/audio/sfx/select.ogg')
    this.load.audio('sfx:move', 'assets/audio/sfx/move.ogg')
    this.load.audio('sfx:hit', 'assets/audio/sfx/hit.ogg')
    this.load.audio('sfx:skill', 'assets/audio/sfx/skill.ogg')
    this.load.audio('sfx:victory', 'assets/audio/sfx/victory.ogg')
    this.load.audio('sfx:defeat', 'assets/audio/sfx/defeat.ogg')
  }

  create(): void {
    this.scene.start('battle')
  }
}
