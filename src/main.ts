import Phaser from 'phaser'
import './style.css'
import { I18n } from './game/i18n'
import { BootScene } from './game/scenes/BootScene'
import { DuelScene } from './game/scenes/DuelScene'
import { BattleScene } from './game/scenes/BattleScene'
import { HudController } from './game/ui'
import {
  loadAccessibilityPreferences,
  resolveBattlefieldHeight,
  resolveDefaultAccessibilityPreferences,
  resolveViewportProfile,
  saveAccessibilityPreferences,
} from './game/responsive'
import type { AccessibilityPreferences, BattlefieldRect, ViewportProfile } from './game/types'

const app = document.querySelector<HTMLDivElement>('#app')

if (!app) {
  throw new Error('Missing #app root')
}

app.innerHTML = `
  <main class="app-shell" data-layout="desktop" data-high-contrast="false" data-reduced-motion="false">
    <div class="app-backdrop"></div>
    <section class="experience-frame">
      <div id="game-frame" class="game-frame">
        <div id="game-root" class="game-root" aria-label="Battlefield"></div>
      </div>
      <div id="hud-root" class="hud-root"></div>
    </section>
  </main>
`

const appShellNode = document.querySelector<HTMLElement>('.app-shell')
const gameFrameNode = document.querySelector<HTMLDivElement>('#game-frame')
const hudRootNode = document.querySelector<HTMLDivElement>('#hud-root')

if (!appShellNode || !gameFrameNode || !hudRootNode) {
  throw new Error('Missing application shell')
}

const appShell = appShellNode
const gameFrame = gameFrameNode
const hudRoot = hudRootNode

const i18n = new I18n('en')
const uiBus = new Phaser.Events.EventEmitter()
const hud = new HudController(hudRoot, uiBus)

function parsePx(value: string): number {
  const parsed = Number.parseFloat(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function readSafeAreaInsets(): ViewportProfile['safeArea'] {
  const styles = window.getComputedStyle(appShell)

  return {
    top: parsePx(styles.getPropertyValue('--safe-top')),
    right: parsePx(styles.getPropertyValue('--safe-right')),
    bottom: parsePx(styles.getPropertyValue('--safe-bottom')),
    left: parsePx(styles.getPropertyValue('--safe-left')),
  }
}

let accessibilityPreferences: AccessibilityPreferences = loadAccessibilityPreferences(
  resolveDefaultAccessibilityPreferences(),
)
let viewportProfile: ViewportProfile = resolveViewportProfile({
  width: window.innerWidth,
  height: window.innerHeight,
  coarsePointer: false,
  safeArea: readSafeAreaInsets(),
})

function readBattlefieldRect(): BattlefieldRect {
  const rect = gameFrame.getBoundingClientRect()

  return {
    left: Math.round(rect.left),
    top: Math.round(rect.top),
    width: Math.round(rect.width),
    height: Math.round(rect.height),
  }
}

function resizeGameToFrame(game: Phaser.Game): void {
  game.scale.resize(
    Math.max(1, Math.round(gameFrame.clientWidth || window.innerWidth)),
    Math.max(1, Math.round(gameFrame.clientHeight || window.innerHeight)),
  )
}

function applyPresentationEnvironment(game?: Phaser.Game): void {
  viewportProfile = resolveViewportProfile({
    width: window.innerWidth,
    height: window.innerHeight,
    coarsePointer:
      typeof window.matchMedia === 'function' ? window.matchMedia('(pointer: coarse)').matches : false,
    safeArea: readSafeAreaInsets(),
  })

  appShell.dataset.layout = viewportProfile.layoutMode
  appShell.dataset.highContrast = String(accessibilityPreferences.highContrast)
  appShell.dataset.reducedMotion = String(accessibilityPreferences.reducedMotion)
  appShell.style.setProperty('--battlefield-height', `${resolveBattlefieldHeight(viewportProfile)}px`)
  appShell.style.setProperty('--text-scale', String(accessibilityPreferences.textScale / 100))
  document.documentElement.lang = i18n.getLocale()

  uiBus.emit('presentation:viewport', viewportProfile)
  uiBus.emit('presentation:accessibility', accessibilityPreferences)

  if (game) {
    resizeGameToFrame(game)
  }
}

applyPresentationEnvironment()

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  parent: 'game-root',
  width: Math.max(1, Math.round(gameFrame.clientWidth || window.innerWidth)),
  height: Math.max(1, Math.round(gameFrame.clientHeight || window.innerHeight)),
  backgroundColor: '#11181f',
  scene: [
    new BootScene(),
    new BattleScene(uiBus, i18n, () => viewportProfile, () => accessibilityPreferences),
    new DuelScene(uiBus, i18n, () => viewportProfile, () => accessibilityPreferences),
  ],
  physics: {
    default: 'matter',
    matter: {
      gravity: { x: 0, y: 0 },
      enableSleeping: false,
      debug: false,
    },
  },
  scale: {
    mode: Phaser.Scale.RESIZE,
    autoCenter: Phaser.Scale.NO_CENTER,
    width: Math.max(1, Math.round(gameFrame.clientWidth || window.innerWidth)),
    height: Math.max(1, Math.round(gameFrame.clientHeight || window.innerHeight)),
  },
}

const game = new Phaser.Game(config)
const resizeObserver = new ResizeObserver(() => {
  resizeGameToFrame(game)
})

resizeObserver.observe(gameFrame)

window.addEventListener('resize', () => {
  applyPresentationEnvironment(game)
})

uiBus.on('hud:locale', (locale: 'en' | 'ko') => {
  document.documentElement.lang = locale
})

uiBus.on('hud:command', (command: string) => {
  if (command.startsWith('accessibility:text-scale:')) {
    const value = Number(command.split(':').at(-1))

    if (value === 100 || value === 115 || value === 130) {
      accessibilityPreferences = { ...accessibilityPreferences, textScale: value }
    } else {
      return
    }
  } else if (command === 'accessibility:toggle-high-contrast') {
    accessibilityPreferences = {
      ...accessibilityPreferences,
      highContrast: !accessibilityPreferences.highContrast,
    }
  } else if (command === 'accessibility:toggle-reduced-motion') {
    accessibilityPreferences = {
      ...accessibilityPreferences,
      reducedMotion: !accessibilityPreferences.reducedMotion,
    }
  } else {
    return
  }

  saveAccessibilityPreferences(accessibilityPreferences)
  applyPresentationEnvironment(game)
})

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
      uiState: hud.getUiState(),
      telemetry: {
        ...lastTelemetry,
        battlefieldRect: readBattlefieldRect(),
        viewportProfile,
        accessibilityState: accessibilityPreferences,
      },
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
