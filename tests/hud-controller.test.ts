// @vitest-environment jsdom

import { EventEmitter } from 'node:events'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('phaser', () => ({
  default: {
    Events: {
      EventEmitter,
    },
  },
}))

import Phaser from 'phaser'
import { HudController } from '../src/game/ui'
import type { HudViewModel } from '../src/game/types'

function buildMobileView(overrides: Partial<HudViewModel> = {}): HudViewModel {
  return {
    locale: 'en',
    phase: 'active',
    mode: 'idle',
    layoutMode: 'mobile-portrait',
    viewportProfile: {
      layoutMode: 'mobile-portrait',
      width: 390,
      height: 844,
      coarsePointer: true,
      orientation: 'portrait',
      safeArea: {
        top: 0,
        right: 0,
        bottom: 0,
        left: 0,
      },
    },
    accessibilityState: {
      textScale: 100,
      highContrast: false,
      reducedMotion: false,
    },
    mobilePresentation: {
      panelState: 'collapsed',
      actionDockVisible: false,
      initiativeMode: 'compact',
      commandDensity: 'compact-2row',
      overflowOpen: false,
      objectiveExpanded: false,
      targetDetailMode: 'summary',
    },
    initiativeRail: {
      label: 'Initiative Timeline',
      currentTurnLabel: 'Now',
      entries: [
        {
          id: 'unit-1',
          name: 'Elira',
          className: 'Ranger',
          combatRole: 'damage',
          combatRoleLabel: 'Ranger',
          team: 'allies',
          initials: 'EL',
          unitIconId: 'bow',
          active: true,
          selected: true,
          emphasis: 'active',
          orderLabel: 'NOW',
        },
      ],
    },
    targetMarkers: [],
    viewControls: {
      label: 'Camera Controls',
      buttons: [
        {
          id: 'view-rotate-left',
          label: 'Rotate Left',
          icon: 'rotate_left',
          disabled: false,
          active: false,
        },
        {
          id: 'view-rotate-right',
          label: 'Rotate Right',
          icon: 'rotate_right',
          disabled: false,
          active: false,
        },
        {
          id: 'view-recenter',
          label: 'Recenter',
          icon: 'my_location',
          disabled: false,
          active: false,
        },
      ],
    },
    statusLine: {
      objectivePhaseLabel: 'Battle Phase 1/2',
      objectiveLabel: 'Break the crossing guard at Glenmoor Ford.',
      modeLabel: 'Choose a reachable tile for repositioning.',
      logLabel: 'Elira takes the initiative.',
      phaseLabel: 'Current Turn: Allies',
    },
    accessiblePanel: {
      label: 'Accessible Controls',
      summaryHeading: 'Summary',
      summary: 'Allied turn.',
      commandsHeading: 'Commands',
      commandButtons: [],
      optionsHeading: 'Options',
      options: [],
      liveMessage: 'Allied turn.',
    },
    ...overrides,
  }
}

describe('HudController mobile objective toggle', () => {
  let root: HTMLDivElement
  let bus: Phaser.Events.EventEmitter
  let controller: HudController

  beforeEach(() => {
    document.body.innerHTML = ''
    root = document.createElement('div')
    document.body.append(root)
    bus = new Phaser.Events.EventEmitter()
    controller = new HudController(root, bus)
  })

  it('keeps the objective disclosure open across ordinary mobile hud updates', () => {
    const view = buildMobileView()
    bus.emit('hud:update', view)

    const toggle = root.querySelector<HTMLButtonElement>('[data-ui-toggle="mobile-objective"]')
    expect(toggle).not.toBeNull()

    toggle?.dispatchEvent(new MouseEvent('click', { bubbles: true }))

    expect(controller.getUiState().mobileObjectiveExpanded).toBe(true)
    expect(root.querySelector('.hud-mobile-objective')).not.toBeNull()

    bus.emit('hud:update', view)

    expect(controller.getUiState().mobileObjectiveExpanded).toBe(true)
    expect(root.querySelector('.hud-mobile-objective')).not.toBeNull()
  })

  it('closes the objective disclosure when the action dock opens', () => {
    const view = buildMobileView()
    bus.emit('hud:update', view)

    root
      .querySelector<HTMLButtonElement>('[data-ui-toggle="mobile-objective"]')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }))

    expect(controller.getUiState().mobileObjectiveExpanded).toBe(true)

    bus.emit(
      'hud:update',
      buildMobileView({
        mobilePresentation: {
          ...view.mobilePresentation!,
          actionDockVisible: true,
        },
      }),
    )

    expect(controller.getUiState().mobileObjectiveExpanded).toBe(false)
    expect(root.querySelector('.hud-mobile-objective')).toBeNull()
  })
})
