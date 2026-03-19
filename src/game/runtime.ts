import { battleDefinition } from './content'
import { chooseBestAction as chooseBestActionForRuntime } from './runtime-ai'
import {
  addMessage,
  clonePoint,
  directionFromTo,
  getClassDefinition,
  manhattan,
  processScriptedEvents,
  samePoint,
  sortTurnUnits,
} from './runtime-effects'
import {
  createBattleState,
  getSkillForAction,
  getReachableTilesForState,
  processTurnStart,
  simulateAction,
} from './runtime-sim'
import type {
  ActionTarget,
  AiScoredAction,
  BattleAction,
  BattleDefinition,
  BattleFeedEntry,
  CombatResolution,
  GridPoint,
  ReachableTile,
  Team,
  TiledMapData,
  UnitBlueprint,
  UnitState,
} from './types'

export class BattleRuntime {
  state: ReturnType<typeof createBattleState>
  readonly definition: BattleDefinition

  constructor(mapData: TiledMapData, definition: BattleDefinition = battleDefinition) {
    this.definition = definition
    this.state = createBattleState(this.definition, mapData)
  }

  reset(mapData: TiledMapData): void {
    this.state = createBattleState(this.definition, mapData)
  }

  startBattle(): BattleFeedEntry[] {
    this.state.phase = 'active'
    processScriptedEvents(this.state, this.definition, { type: 'battle-start' })
    const messages = this.state.phase === 'active' ? processTurnStart(this.state, this.definition) : []

    for (const message of messages) {
      addMessage(this.state, message)
    }

    return messages
  }

  getActiveUnit(): UnitState {
    return this.state.units[this.state.activeUnitId]
  }

  getAliveUnits(team: Team): UnitState[] {
    return Object.values(this.state.units).filter((unit) => unit.team === team && !unit.defeated)
  }

  getUnit(unitId: string): UnitState | undefined {
    return this.state.units[unitId]
  }

  getReachableTiles(unitId = this.state.activeUnitId): ReachableTile[] {
    return getReachableTilesForState(this.state, unitId)
  }

  repositionActiveUnit(destination: GridPoint, allowedDestinations?: GridPoint[]): boolean {
    const actor = this.getActiveUnit()

    if (!actor || actor.defeated || actor.hasActedThisTurn) {
      return false
    }

    const reachable = allowedDestinations
      ? allowedDestinations.find((point) => samePoint(point, destination))
      : this.getReachableTiles(actor.id).find((tile) => samePoint(tile.point, destination))?.point

    if (!reachable) {
      return false
    }

    if (!samePoint(actor.position, destination)) {
      const previous = clonePoint(actor.position)
      actor.position = clonePoint(destination)
      actor.facing = directionFromTo(previous, destination)
    }

    return true
  }

  getTargetsForAction(action: BattleAction): ActionTarget[] {
    const actor = this.state.units[action.actorId]

    if (!actor || actor.defeated) {
      return []
    }

    const position = action.destination ?? actor.position
    const previewAtTarget = (targetId: string): CombatResolution => this.previewAction({ ...action, targetId })
    const resolvedSkill = action.kind === 'skill' ? getSkillForAction(actor, action) : undefined
    const rangeMin =
      action.kind === 'attack' ? getClassDefinition(actor).basicAttackRangeMin : resolvedSkill?.rangeMin ?? 0
    const rangeMax =
      action.kind === 'attack' ? getClassDefinition(actor).basicAttackRangeMax : resolvedSkill?.rangeMax ?? 0
    const targetType = action.kind === 'attack' ? 'enemy' : resolvedSkill?.targetType

    return Object.values(this.state.units)
      .filter((unit) => {
        if (unit.defeated) {
          return false
        }

        if (targetType === 'enemy' && unit.team === actor.team) {
          return false
        }

        if (targetType === 'ally' && unit.team !== actor.team) {
          return false
        }

        if (targetType === 'self' && unit.id !== actor.id) {
          return false
        }

        const distance = manhattan(position, unit.position)
        return distance >= rangeMin && distance <= rangeMax
      })
      .map((unit) => ({
        unitId: unit.id,
        point: clonePoint(unit.position),
        forecast: previewAtTarget(unit.id),
      }))
  }

  previewAction(action: BattleAction): CombatResolution {
    return simulateAction(this.state, this.definition, action, { mutate: false })
  }

  commitAction(action: BattleAction): CombatResolution {
    const resolution = simulateAction(this.state, this.definition, action, { mutate: true })
    this.state = resolution.state

    for (const message of [...resolution.messages, ...resolution.startTurnMessages].reverse()) {
      addMessage(this.state, message)
    }

    return resolution
  }

  getInitiativeOrder(limit = 8): UnitState[] {
    return Object.values(this.state.units)
      .filter((unit) => !unit.defeated)
      .sort(sortTurnUnits)
      .slice(0, limit)
  }

  chooseBestAction(unitId = this.state.activeUnitId): AiScoredAction {
    return chooseBestActionForRuntime(
      {
        state: this.state,
        definition: this.definition,
        getTargetsForAction: (action) => this.getTargetsForAction(action),
        previewAction: (action) => this.previewAction(action),
        getBlueprint: (candidateUnitId) => this.getBlueprint(candidateUnitId),
      },
      unitId,
    )
  }

  private getBlueprint(unitId: string): UnitBlueprint {
    return [...this.definition.allies, ...this.definition.enemies].find((unit) => unit.id === unitId)!
  }
}
