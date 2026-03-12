import { describe, expect, it } from 'vitest'
import {
  buildCommandButtons,
  buildInitiativeEntries,
  buildRangeTiles,
  buildTargetPreviewStrings,
  buildTurnStateSummary,
  buildUnitInitials,
  resolveActiveTurnMode,
  resolveIdleUnitSelection,
} from '../src/game/battle-ui-model'

describe('battle UI model', () => {
  it('enters move mode only when the active ally is clicked from idle', () => {
    expect(
      resolveIdleUnitSelection({
        phase: 'active',
        mode: 'idle',
        activeTeam: 'allies',
        activeUnitId: 'sable',
        clickedUnitId: 'sable',
        activeHasMoved: false,
        activeHasActed: false,
      }),
    ).toBe('enter-move')
  })

  it('keeps non-active ally clicks informational only', () => {
    expect(
      resolveIdleUnitSelection({
        phase: 'active',
        mode: 'idle',
        activeTeam: 'allies',
        activeUnitId: 'sable',
        clickedUnitId: 'rowan',
        activeHasMoved: false,
        activeHasActed: false,
      }),
    ).toBe('select-only')
  })

  it('ignores unit clicks outside the actionable idle player state', () => {
    expect(
      resolveIdleUnitSelection({
        phase: 'active',
        mode: 'move',
        activeTeam: 'allies',
        activeUnitId: 'sable',
        clickedUnitId: 'sable',
        activeHasMoved: false,
        activeHasActed: false,
      }),
    ).toBe('ignore')

    expect(
      resolveIdleUnitSelection({
        phase: 'active',
        mode: 'idle',
        activeTeam: 'enemies',
        activeUnitId: 'brigandCaptain',
        clickedUnitId: 'rowan',
        activeHasMoved: false,
        activeHasActed: false,
      }),
    ).toBe('ignore')

    expect(
      resolveIdleUnitSelection({
        phase: 'active',
        mode: 'idle',
        activeTeam: 'allies',
        activeUnitId: 'sable',
        clickedUnitId: 'sable',
        activeHasMoved: true,
        activeHasActed: false,
      }),
    ).toBe('select-only')
  })

  it('builds initiative entries with a localized Now label and stable selection flags', () => {
    expect(
      buildInitiativeEntries(
        [
          {
            id: 'sable',
            name: 'Sable',
            className: 'Skirmisher',
            team: 'allies',
            active: true,
            selected: true,
          },
          {
            id: 'rowan',
            name: 'Rowan',
            className: 'Vanguard',
            team: 'allies',
            active: false,
            selected: false,
          },
          {
            id: 'cutpurse',
            name: 'Cutpurse',
            className: 'Skirmisher',
            team: 'enemies',
            active: false,
            selected: true,
          },
        ],
        'Now',
      ),
    ).toEqual([
      {
        id: 'sable',
        name: 'Sable',
        className: 'Skirmisher',
        team: 'allies',
        initials: 'SA',
        active: true,
        selected: true,
        emphasis: 'active',
        orderLabel: 'Now',
      },
      {
        id: 'rowan',
        name: 'Rowan',
        className: 'Vanguard',
        team: 'allies',
        initials: 'RO',
        active: false,
        selected: false,
        emphasis: 'normal',
        orderLabel: '2',
      },
      {
        id: 'cutpurse',
        name: 'Cutpurse',
        className: 'Skirmisher',
        team: 'enemies',
        initials: 'CU',
        active: false,
        selected: true,
        emphasis: 'selected',
        orderLabel: '3',
      },
    ])
  })

  it('auto-opens move only for a fresh allied active turn', () => {
    expect(
      resolveActiveTurnMode({
        phase: 'active',
        activeTeam: 'allies',
        activeHasMoved: false,
        activeHasActed: false,
      }),
    ).toBe('move')

    expect(
      resolveActiveTurnMode({
        phase: 'active',
        activeTeam: 'enemies',
        activeHasMoved: false,
        activeHasActed: false,
      }),
    ).toBe('idle')

    expect(
      resolveActiveTurnMode({
        phase: 'active',
        activeTeam: 'allies',
        activeHasMoved: true,
        activeHasActed: false,
      }),
    ).toBe('idle')
  })

  it('builds current turn state labels for the active card', () => {
    expect(
      buildTurnStateSummary({
        hasMoved: false,
        hasActed: true,
        move: { ready: 'Move Ready', spent: 'Moved', committed: 'Committed' },
        action: { ready: 'Action Ready', spent: 'Acted', committed: 'Committed' },
        overall: { ready: 'Turn Ready', spent: 'Committed', committed: 'Committed' },
      }),
    ).toEqual({
      moveStateLabel: 'Move Ready',
      actionStateLabel: 'Acted',
      turnStateLabel: 'Turn Ready',
    })
  })

  it('builds floating command buttons with the expected active and disabled states', () => {
    expect(
      buildCommandButtons({
        interactive: true,
        mode: 'skill',
        canMove: true,
        canAttack: false,
        canSkill: true,
        labels: {
          move: 'Move',
          attack: 'Attack',
          skill: 'Skill',
          wait: 'Wait',
          cancel: 'Cancel',
        },
      }),
    ).toEqual([
      { id: 'move', label: 'Move', disabled: false, active: false },
      { id: 'attack', label: 'Attack', disabled: true, active: false },
      { id: 'skill', label: 'Skill', disabled: false, active: true },
      { id: 'wait', label: 'Wait', disabled: false, active: false },
      { id: 'cancel', label: 'Cancel', disabled: false, active: false },
    ])
  })

  it('builds target preview strings for damage forecasts', () => {
    const preview = buildTargetPreviewStrings(
      {
        action: { actorId: 'rowan', kind: 'attack', targetId: 'cutpurse' },
        actorAfterMove: { x: 4, y: 4 },
        primary: {
          sourceId: 'rowan',
          targetId: 'cutpurse',
          labelKey: 'attack.strike',
          amount: 12,
          kind: 'damage',
          flavor: 'power',
          relation: 'side',
          heightDelta: 1,
          terrainBonus: 0,
          appliedStatuses: [{ statusId: 'guardBreak', stacks: 1, duration: 2 }],
          targetDefeated: false,
        },
        counter: {
          sourceId: 'cutpurse',
          targetId: 'rowan',
          labelKey: 'attack.slash',
          amount: 5,
          kind: 'damage',
          flavor: 'power',
          relation: 'front',
          heightDelta: 0,
          terrainBonus: 0,
          appliedStatuses: [],
          targetDefeated: false,
        },
        startTurnMessages: [],
        messages: [],
        state: {} as never,
      },
      {
        t: (key) =>
          ({
            'attack.strike': 'Strike',
            'hud.damage': 'Damage',
            'hud.heal': 'Heal',
            'hud.counter': 'Counter',
            'hud.forecast.counterRisk': 'Counter Risk',
            'hud.forecast.effects': 'Effects',
            'hud.forecast.lethal': 'Lethal',
            'status.guardBreak': 'Guard Break',
            'duel.noCounter': 'No counter',
            'hud.none': 'None',
            'effect.push': 'Push 1',
            'effect.pushBlocked': 'Push blocked',
          })[key] ?? key,
      },
    )

    expect(preview).toMatchObject({
      title: 'Strike',
      subtitle: 'SIDE / H+1',
      amountLabel: 'Damage: -12',
      counterLabel: 'Counter Risk: 5',
      effectLabel: 'Effects: Guard Break x1',
      verdictChips: [
        { id: 'verdict-counter', label: 'Counter 5', tone: 'enemy' },
        { id: 'verdict-status-guardBreak', label: 'Guard Break', tone: 'ally' },
      ],
      markerLabel: '-12',
      markerKind: 'effect',
      markerTone: 'counter',
      telegraphSummary: {
        lethal: false,
        counterRisk: 5,
        predictedStatusIds: ['guardBreak'],
        pushOutcome: 'none',
        markerTone: 'counter',
      },
    })
    expect(preview.telegraphSummary.predictedStatusIds).toContain('guardBreak')
  })

  it('builds Manhattan range tiles for red action overlays', () => {
    expect(
      buildRangeTiles(
        { x: 2, y: 2 },
        1,
        2,
        { width: 5, height: 5 },
      ),
    ).toEqual([
      { x: 2, y: 0 },
      { x: 1, y: 1 },
      { x: 2, y: 1 },
      { x: 3, y: 1 },
      { x: 0, y: 2 },
      { x: 1, y: 2 },
      { x: 3, y: 2 },
      { x: 4, y: 2 },
      { x: 1, y: 3 },
      { x: 2, y: 3 },
      { x: 3, y: 3 },
      { x: 2, y: 4 },
    ])
  })

  it('builds initials for single-word and multi-word unit names', () => {
    expect(buildUnitInitials('Mire Huntmaster')).toBe('MH')
    expect(buildUnitInitials('Elira')).toBe('EL')
  })
})
