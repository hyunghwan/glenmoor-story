import Phaser from 'phaser'
import { inject } from '@vercel/analytics'
import './style.css'
import { I18n } from './game/i18n'
import { BootScene } from './game/scenes/BootScene'
import { DuelScene } from './game/scenes/DuelScene'
import { BattleScene } from './game/scenes/BattleScene'
import { HudController } from './game/ui'

const app = document.querySelector<HTMLDivElement>('#app')

if (!app) {
  throw new Error('Missing #app root')
}

inject({
  mode: import.meta.env.DEV ? 'development' : 'production',
})

app.innerHTML = `
  <main class="app-shell">
    <div class="app-backdrop"></div>
    <section class="experience-frame">
      <div id="game-root" class="game-root"></div>
      <div id="hud-root" class="hud-root"></div>
    </section>
  </main>
`

const hudRoot = document.querySelector<HTMLDivElement>('#hud-root')

if (!hudRoot) {
  throw new Error('Missing HUD root')
}

const i18n = new I18n('en')
const uiBus = new Phaser.Events.EventEmitter()
const hud = new HudController(hudRoot, uiBus)

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  parent: 'game-root',
  width: 1280,
  height: 720,
  backgroundColor: '#11181f',
  scene: [new BootScene(), new BattleScene(uiBus, i18n), new DuelScene(uiBus, i18n)],
  physics: {
    default: 'matter',
    matter: {
      gravity: { x: 0, y: 0 },
      enableSleeping: false,
      debug: false,
    },
  },
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    width: 1280,
    height: 720,
  },
}

const game = new Phaser.Game(config)

type Telemetry = Record<string, unknown>

let lastTelemetry: Telemetry = {}

uiBus.on('telemetry:update', (telemetry: Telemetry) => {
  lastTelemetry = telemetry
})

window.render_game_to_text = () =>
  JSON.stringify(
    {
      coordinateSystem: 'Grid origin is top-left. X increases east, Y increases south.',
      hud: hud.getCurrentView(),
      telemetry: lastTelemetry,
    },
    null,
    2,
  )

window.advanceTime = (ms: number) => {
  uiBus.emit('debug:advance', ms)
}

window.__glenmoorDebug = {
  command(command: string) {
    uiBus.emit('hud:command', command)
  },
  locale(locale: 'en' | 'ko') {
    uiBus.emit('hud:locale', locale)
  },
  tile(x: number, y: number) {
    uiBus.emit('debug:tile-click', { x, y })
  },
  stage(name: string) {
    uiBus.emit('debug:stage', name)
  },
  inspectClient(x: number, y: number) {
    const battle = game.scene.getScene('battle') as BattleScene
    return battle.debugInspectClientPoint(x, y)
  },
  lastInput() {
    const battle = game.scene.getScene('battle') as BattleScene
    return battle.debugGetLastInput()
  },
}

declare global {
  interface Window {
    render_game_to_text: () => string
    advanceTime: (ms: number) => void
    __glenmoorDebug: {
      command: (command: string) => void
      locale: (locale: 'en' | 'ko') => void
      tile: (x: number, y: number) => void
      stage: (name: string) => void
      inspectClient: (
        x: number,
        y: number,
      ) => Array<{
        name: string
        type: string
        x: number
        y: number
        depth: number
      }>
      lastInput: () => Record<string, unknown>
    }
  }
}
