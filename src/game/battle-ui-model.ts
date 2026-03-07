import type { BattleState, HudViewModel, InitiativeEntryViewModel, Team } from './types'

export interface InitiativeSourceEntry {
  id: string
  name: string
  className: string
  team: Team
  active: boolean
  selected: boolean
}

export interface IdleUnitSelectionContext {
  phase: BattleState['phase']
  mode: HudViewModel['mode']
  activeTeam: Team
  activeUnitId: string
  clickedUnitId: string
  activeHasMoved: boolean
  activeHasActed: boolean
}

export type IdleUnitSelectionAction = 'enter-move' | 'select-only' | 'ignore'

export interface ActiveTurnPresentationContext {
  phase: BattleState['phase']
  activeTeam: Team
  activeHasMoved: boolean
  activeHasActed: boolean
}

export function buildInitiativeEntries(
  entries: InitiativeSourceEntry[],
  nowLabel: string,
): InitiativeEntryViewModel[] {
  return entries.map((entry, index) => ({
    ...entry,
    order: index === 0 ? nowLabel : String(index + 1),
  }))
}

export function resolveIdleUnitSelection(context: IdleUnitSelectionContext): IdleUnitSelectionAction {
  if (context.phase !== 'active' || context.activeTeam !== 'allies' || context.mode !== 'idle') {
    return 'ignore'
  }

  if (
    context.clickedUnitId === context.activeUnitId &&
    !context.activeHasMoved &&
    !context.activeHasActed
  ) {
    return 'enter-move'
  }

  return 'select-only'
}

export function resolveActiveTurnMode(
  context: ActiveTurnPresentationContext,
): HudViewModel['mode'] {
  if (
    context.phase === 'active' &&
    context.activeTeam === 'allies' &&
    !context.activeHasMoved &&
    !context.activeHasActed
  ) {
    return 'move'
  }

  return 'idle'
}
