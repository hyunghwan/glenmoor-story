import { describe, expect, it } from 'vitest'
import {
  buildInitiativeEntries,
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
        active: true,
        selected: true,
        order: 'Now',
      },
      {
        id: 'rowan',
        name: 'Rowan',
        className: 'Vanguard',
        team: 'allies',
        active: false,
        selected: false,
        order: '2',
      },
      {
        id: 'cutpurse',
        name: 'Cutpurse',
        className: 'Skirmisher',
        team: 'enemies',
        active: false,
        selected: true,
        order: '3',
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
})
