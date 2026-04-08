import Phaser from 'phaser'
import { I18n } from './i18n'
import { BootScene } from './scenes/BootScene'
import { DuelScene } from './scenes/DuelScene'
import { BattleScene } from './scenes/BattleScene'
import { HudController } from './ui'
import {
  loadAccessibilityPreferences,
  resolveBattlefieldHeight,
  resolveDefaultAccessibilityPreferences,
  resolveViewportProfile,
  saveAccessibilityPreferences,
} from './responsive'
import type { AccessibilityPreferences, BattlefieldRect, Locale, ViewportProfile } from './types'
import type { BattleSession } from './battle-session'

export interface MountedBattleExperience {
  destroy: () => void
  game: Phaser.Game
}

export interface MountBattleExperienceArgs {
  root: HTMLElement
  session: BattleSession
  initialLocale?: Locale
  enableDebugGlobals?: boolean
  targetWindow?: Window & typeof globalThis
}

function parsePx(value: string): number {
  const parsed = Number.parseFloat(value)
  return Number.isFinite(parsed) ? parsed : 0
}

export function mountBattleExperience(args: MountBattleExperienceArgs): MountedBattleExperience {
  const {
    root,
    session,
    initialLocale = 'en',
    enableDebugGlobals = true,
    targetWindow = window,
  } = args

  root.innerHTML = `
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

  const appShellNode = root.querySelector<HTMLElement>('.app-shell')
  const gameFrameNode = root.querySelector<HTMLDivElement>('#game-frame')
  const hudRootNode = root.querySelector<HTMLDivElement>('#hud-root')

  if (!appShellNode || !gameFrameNode || !hudRootNode) {
    throw new Error('Missing battle experience shell')
  }

  const appShell = appShellNode
  const gameFrame = gameFrameNode
  const hudRoot = hudRootNode
  const i18n = new I18n(initialLocale, session.localeOverlay)
  const uiBus = new Phaser.Events.EventEmitter()
  const hud = new HudController(hudRoot, uiBus)

  function readSafeAreaInsets(): ViewportProfile['safeArea'] {
    const styles = targetWindow.getComputedStyle(appShell)

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
    width: targetWindow.innerWidth,
    height: targetWindow.innerHeight,
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
      Math.max(1, Math.round(gameFrame.clientWidth || targetWindow.innerWidth)),
      Math.max(1, Math.round(gameFrame.clientHeight || targetWindow.innerHeight)),
    )
  }

  function applyPresentationEnvironment(game?: Phaser.Game): void {
    viewportProfile = resolveViewportProfile({
      width: targetWindow.innerWidth,
      height: targetWindow.innerHeight,
      coarsePointer:
        typeof targetWindow.matchMedia === 'function'
          ? targetWindow.matchMedia('(pointer: coarse)').matches
          : false,
      safeArea: readSafeAreaInsets(),
    })

    appShell.dataset.layout = viewportProfile.layoutMode
    appShell.dataset.highContrast = String(accessibilityPreferences.highContrast)
    appShell.dataset.reducedMotion = String(accessibilityPreferences.reducedMotion)
    appShell.style.setProperty('--battlefield-height', `${resolveBattlefieldHeight(viewportProfile)}px`)
    appShell.style.setProperty('--text-scale', String(accessibilityPreferences.textScale / 100))
    targetWindow.document.documentElement.lang = i18n.getLocale()

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
    width: Math.max(1, Math.round(gameFrame.clientWidth || targetWindow.innerWidth)),
    height: Math.max(1, Math.round(gameFrame.clientHeight || targetWindow.innerHeight)),
    backgroundColor: '#11181f',
    scene: [
      new BootScene(),
      new BattleScene(uiBus, i18n, session, () => viewportProfile, () => accessibilityPreferences),
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
      width: Math.max(1, Math.round(gameFrame.clientWidth || targetWindow.innerWidth)),
      height: Math.max(1, Math.round(gameFrame.clientHeight || targetWindow.innerHeight)),
    },
  }

  const game = new Phaser.Game(config)
  const resizeObserver = new ResizeObserver(() => {
    resizeGameToFrame(game)
  })
  resizeObserver.observe(gameFrame)

  const handleResize = () => {
    applyPresentationEnvironment(game)
  }
  targetWindow.addEventListener('resize', handleResize)

  uiBus.on('hud:locale', (locale: Locale) => {
    targetWindow.document.documentElement.lang = locale
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

  if (enableDebugGlobals) {
    targetWindow.render_game_to_text = () =>
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

    targetWindow.advanceTime = (ms: number) => {
      uiBus.emit('debug:advance', ms)
    }

    targetWindow.__glenmoorDebug = {
      command(command: string) {
        uiBus.emit('hud:command', command)
      },
      locale(locale: Locale) {
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
  }

  return {
    game,
    destroy: () => {
      resizeObserver.disconnect()
      targetWindow.removeEventListener('resize', handleResize)
      game.destroy(true)
      root.innerHTML = ''

      if (enableDebugGlobals) {
        delete targetWindow.render_game_to_text
        delete targetWindow.advanceTime
        delete targetWindow.__glenmoorDebug
      }
    },
  }
}
