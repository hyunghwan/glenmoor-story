import { describe, expect, it } from 'vitest'
import {
  buildAccessibleOptionsModel,
  buildActionMenuModel,
  buildObjectivePhaseProgressLabel,
  resolveMobileHudPresentation,
} from '../src/game/scenes/battle/scene-hud'

const t = (key: string, params?: Record<string, string | number>): string => {
  if (key === 'hud.phaseObjective') {
    return `${params?.current}/${params?.total}`
  }

  if (key === 'hud.action.attackShort') {
    return 'Atk'
  }

  if (key === 'hud.action.back') {
    return 'Back'
  }

  return key
}

describe('battle scene HUD helpers', () => {
  it('builds anchored desktop action menus and preserves command states', () => {
    const menu = buildActionMenuModel({
      t,
      layoutMode: 'desktop',
      mode: 'skill',
      interactive: true,
      anchor: {
        clientX: 320,
        clientY: 240,
        preferredPlacement: 'above-right',
      },
      canMove: true,
      canAttack: false,
      canSkill: true,
      avoidClientPoints: [{ clientX: 360, clientY: 260 }],
    })

    expect(menu?.presentation).toBe('anchored')
    expect(menu?.anchor?.preferredPlacement).toBe('above-right')
    expect(menu?.buttons.find((button) => button.id === 'attack')?.disabled).toBe(true)
    expect(menu?.buttons.find((button) => button.id === 'skill')?.active).toBe(true)
    expect(menu?.buttons.find((button) => button.id === 'attack')?.shortLabel).toBe('Atk')
    expect(menu?.buttons.find((button) => button.id === 'cancel')?.shortLabel).toBe('Back')
  })

  it('formats objective progress and accessible move options from pure HUD state', () => {
    const objectiveLabel = buildObjectivePhaseProgressLabel({
      t,
      phases: [
        {
          id: 'hold-bridge',
          objectiveKey: 'battle.phase.one',
          victoryConditions: [],
        },
        {
          id: 'defeat-captain',
          objectiveKey: 'battle.phase.two',
          victoryConditions: [],
        },
      ],
      activePhaseId: 'defeat-captain',
    })

    const options = buildAccessibleOptionsModel({
      t,
      mode: 'move',
      reachableTiles: [{ point: { x: 1, y: 1 }, cost: 2 }],
      targetOptions: [],
      mapTiles: [
        [{ terrainId: 'road' }, { terrainId: 'road' }],
        [{ terrainId: 'road' }, { terrainId: 'forest' }],
      ],
      getUnitById: () => undefined,
      combatText: {
        t,
        getUnitName: (unitId) => unitId,
      },
    })

    expect(objectiveLabel).toBe('2/2')
    expect(options).toEqual([
      {
        id: 'tile-1-1',
        label: 'a11y.tile 1, 1',
        detail: 'terrain.forest · a11y.cost 2',
        command: 'accessible:tile:1:1',
        kind: 'tile',
      },
    ])
  })

  it('defaults mobile HUD to collapsed with compact initiative and closed disclosures', () => {
    const presentation = resolveMobileHudPresentation({
      layoutMode: 'mobile-portrait',
      viewportWidth: 390,
      mode: 'move',
      hasActionMenu: true,
      hasTargetDetail: true,
    })

    expect(presentation).toEqual({
      panelState: 'collapsed',
      actionDockVisible: true,
      initiativeMode: 'compact',
      commandDensity: 'compact-2row',
      overflowOpen: false,
      objectiveExpanded: false,
      targetDetailMode: 'detail',
    })
  })

  it('keeps tablet portrait mobile HUD on default command density', () => {
    const presentation = resolveMobileHudPresentation({
      layoutMode: 'mobile-portrait',
      viewportWidth: 768,
      mode: 'move',
      hasActionMenu: true,
      hasTargetDetail: false,
    })

    expect(presentation?.commandDensity).toBe('default')
  })
})
