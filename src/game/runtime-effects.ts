import {
  attackPresentationDefinitions,
  classDefinitions,
  skillDefinitions,
  statusDefinitions,
} from './content'
import type {
  AppliedStatusResult,
  BattleEventEffect,
  BattleEventTrigger,
  BattleFeedEntry,
  BattleDefinition,
  BattleMapData,
  BattleObjectiveCondition,
  BattleObjectivePhaseDefinition,
  BattleScriptedEvent,
  BattleState,
  ClassDefinition,
  CombatImpulseProfile,
  CombatPresentationStep,
  CombatPresentationUnitSnapshot,
  Direction,
  FacingRelation,
  GridPoint,
  MapTile,
  SkillDefinition,
  StatusInstance,
  Team,
  TerrainReactionResult,
  UnitBlueprint,
  UnitState,
} from './types'

export interface UnitStateSnapshot {
  hp: number
  statuses: StatusInstance[]
  position: GridPoint
}

export interface RuntimeEventTriggerContext {
  type: BattleEventTrigger['type']
  unitId?: string
  team?: Team
}

export const directions: GridPoint[] = [
  { x: 1, y: 0 },
  { x: -1, y: 0 },
  { x: 0, y: 1 },
  { x: 0, y: -1 },
]

export function pointKey(point: GridPoint): string {
  return `${point.x},${point.y}`
}

export function clonePoint(point: GridPoint): GridPoint {
  return { x: point.x, y: point.y }
}

export function cloneStatuses(statuses: StatusInstance[]): StatusInstance[] {
  return statuses.map((status) => ({ ...status }))
}

export function samePoint(a: GridPoint, b: GridPoint): boolean {
  return a.x === b.x && a.y === b.y
}

export function manhattan(a: GridPoint, b: GridPoint): number {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y)
}

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

export function sortTurnUnits(a: UnitState, b: UnitState): number {
  if (a.nextActAt !== b.nextActAt) {
    return a.nextActAt - b.nextActAt
  }

  const speedDelta = getEffectiveSpeed(b) - getEffectiveSpeed(a)

  if (speedDelta !== 0) {
    return speedDelta
  }

  return a.id.localeCompare(b.id)
}

export function getClassDefinition(unit: Pick<UnitState, 'classId'>): ClassDefinition {
  return classDefinitions[unit.classId]
}

export function getSkillDefinition(unit: Pick<UnitState, 'classId'>): SkillDefinition {
  return skillDefinitions[getClassDefinition(unit).signatureSkillId]
}

export function getStatusStacks(unit: Pick<UnitState, 'statuses'>, statusId: keyof typeof statusDefinitions): number {
  return unit.statuses.find((status) => status.id === statusId)?.stacks ?? 0
}

export function hasStatus(
  unit: Pick<UnitStateSnapshot, 'statuses'> | Pick<UnitState, 'statuses'>,
  statusId: StatusInstance['id'],
): boolean {
  return unit.statuses.some((status) => status.id === statusId)
}

export function getEffectiveSpeed(unit: UnitState): number {
  const base = getClassDefinition(unit).stats.speed
  return Math.max(1, base - getStatusStacks(unit, 'slow'))
}

export function getActionDelay(unit: UnitState): number {
  return Math.max(40, 120 - getEffectiveSpeed(unit) * 7)
}

export function getTerrain(map: BattleMapData, point: GridPoint): MapTile | undefined {
  return map.tiles[point.y]?.[point.x]
}

export function inBounds(map: BattleMapData, point: GridPoint): boolean {
  return point.x >= 0 && point.y >= 0 && point.x < map.width && point.y < map.height
}

export function getOccupantId(state: BattleState, point: GridPoint, ignoreUnitId?: string): string | undefined {
  return Object.values(state.units).find(
    (unit) => !unit.defeated && unit.id !== ignoreUnitId && samePoint(unit.position, point),
  )?.id
}

export function directionFromTo(from: GridPoint, to: GridPoint): Direction {
  const dx = to.x - from.x
  const dy = to.y - from.y

  if (Math.abs(dx) > Math.abs(dy)) {
    return dx >= 0 ? 'east' : 'west'
  }

  return dy >= 0 ? 'south' : 'north'
}

export function relationFromFacing(
  defenderFacing: Direction,
  attacker: GridPoint,
  defender: GridPoint,
): FacingRelation {
  const attackerDirection = directionFromTo(defender, attacker)

  if (attackerDirection === defenderFacing) {
    return 'front'
  }

  if (
    (defenderFacing === 'north' && attackerDirection === 'south') ||
    (defenderFacing === 'south' && attackerDirection === 'north') ||
    (defenderFacing === 'east' && attackerDirection === 'west') ||
    (defenderFacing === 'west' && attackerDirection === 'east')
  ) {
    return 'back'
  }

  return 'side'
}

export function relationBonus(relation: FacingRelation): number {
  if (relation === 'back') {
    return 4
  }

  if (relation === 'side') {
    return 2
  }

  return 0
}

export function createUnitState(blueprint: UnitBlueprint, deploymentIndex: number): UnitState {
  const unitClass = classDefinitions[blueprint.classId]
  const initiative = Math.max(10, 130 - unitClass.stats.speed * 7 + deploymentIndex)
  const startingHp = clamp(blueprint.startingHp ?? unitClass.stats.maxHp, 0, unitClass.stats.maxHp)

  return {
    id: blueprint.id,
    nameKey: blueprint.nameKey,
    classId: blueprint.classId,
    team: blueprint.team,
    position: clonePoint(blueprint.position),
    facing: blueprint.team === 'allies' ? 'north' : 'south',
    hp: startingHp,
    statuses: [],
    nextActAt: initiative,
    hasMovedThisTurn: false,
    hasActedThisTurn: false,
    defeated: startingHp === 0,
  }
}

export function addMessage(state: BattleState, message: BattleFeedEntry): void {
  state.messages = [message, ...state.messages].slice(0, 8)
}

export function getObjectivePhases(definition: BattleDefinition): BattleObjectivePhaseDefinition[] {
  if (definition.objectivePhases && definition.objectivePhases.length > 0) {
    return definition.objectivePhases
  }

  return [
    {
      id: 'default-objective',
      objectiveKey: definition.objectiveKey,
      briefingKey: definition.briefingKey,
      victoryKey: definition.victoryKey,
      defeatKey: definition.defeatKey,
      victoryConditions: [{ type: 'eliminate-team', team: 'enemies' }],
    },
  ]
}

export function getObjectivePhase(
  definition: BattleDefinition,
  phaseId: string,
): BattleObjectivePhaseDefinition {
  return getObjectivePhases(definition).find((phase) => phase.id === phaseId) ?? getObjectivePhases(definition)[0]
}

export function applyObjectivePhaseState(
  state: BattleState,
  definition: BattleDefinition,
  phaseId: string,
): void {
  const phase = getObjectivePhase(definition, phaseId)
  state.objectivePhaseId = phase.id
  state.objectiveKey = phase.objectiveKey
  state.briefingKey = phase.briefingKey ?? definition.briefingKey
  state.victoryKey = phase.victoryKey ?? definition.victoryKey
  state.defeatKey = phase.defeatKey ?? definition.defeatKey
}

export function isObjectiveConditionMet(
  state: BattleState,
  condition: BattleObjectiveCondition,
): boolean {
  switch (condition.type) {
    case 'eliminate-team':
      return !Object.values(state.units).some((unit) => unit.team === condition.team && !unit.defeated)
    case 'defeat-unit':
      return state.units[condition.unitId]?.defeated === true
    case 'turn-at-least':
      return state.turnIndex >= condition.turnIndex
  }
}

export function updateBattleOutcome(state: BattleState, definition: BattleDefinition): void {
  const alliesAlive = Object.values(state.units).some((unit) => unit.team === 'allies' && !unit.defeated)

  if (!alliesAlive) {
    state.phase = 'defeat'
    return
  }

  const phase = getObjectivePhase(definition, state.objectivePhaseId)
  const defeatConditions = phase.defeatConditions ?? []

  if (defeatConditions.some((condition) => isObjectiveConditionMet(state, condition))) {
    state.phase = 'defeat'
    return
  }

  if (phase.victoryConditions.every((condition) => isObjectiveConditionMet(state, condition))) {
    state.phase = 'victory'
  }
}

function triggerMatches(
  state: BattleState,
  event: BattleScriptedEvent,
  context: RuntimeEventTriggerContext,
): boolean {
  if (event.trigger.type !== context.type) {
    return false
  }

  if (event.once !== false && state.resolvedEventIds.includes(event.id)) {
    return false
  }

  if (event.trigger.objectivePhaseId && event.trigger.objectivePhaseId !== state.objectivePhaseId) {
    return false
  }

  if (event.trigger.type === 'turn-start') {
    return (
      (event.trigger.turnIndex === undefined || event.trigger.turnIndex === state.turnIndex) &&
      (event.trigger.team === undefined || event.trigger.team === context.team) &&
      (event.trigger.unitId === undefined || event.trigger.unitId === context.unitId)
    )
  }

  if (event.trigger.type === 'unit-defeated') {
    return (
      (event.trigger.team === undefined || event.trigger.team === context.team) &&
      (event.trigger.unitId === undefined || event.trigger.unitId === context.unitId)
    )
  }

  return true
}

function applyEventEffect(state: BattleState, definition: BattleDefinition, effect: BattleEventEffect): void {
  if (effect.type === 'set-objective-phase') {
    applyObjectivePhaseState(state, definition, effect.objectivePhaseId)
    return
  }

  const deploymentIndex = Object.keys(state.units).length
  const deployed = createUnitState(effect.unit, deploymentIndex)
  const active = state.units[state.activeUnitId]
  deployed.facing = effect.facing ?? deployed.facing
  deployed.nextActAt = effect.nextActAt ?? (active ? active.nextActAt + getActionDelay(deployed) : deployed.nextActAt)
  state.units[deployed.id] = deployed
}

export function processScriptedEvents(
  state: BattleState,
  definition: BattleDefinition,
  context: RuntimeEventTriggerContext,
): void {
  if (state.phase !== 'active') {
    return
  }

  if (definition.events && definition.events.length > 0) {
    for (const event of definition.events) {
      if (!triggerMatches(state, event, context)) {
        continue
      }

      for (const effect of event.effects) {
        applyEventEffect(state, definition, effect)
      }

      if (event.once !== false) {
        state.resolvedEventIds.push(event.id)
      }
    }
  }

  updateBattleOutcome(state, definition)
}

export function applyStatus(
  unit: UnitState,
  statusId: StatusInstance['id'],
  stacks: number,
  duration: number,
): AppliedStatusResult {
  const definition = statusDefinitions[statusId]
  const existing = unit.statuses.find((status) => status.id === statusId)

  if (existing) {
    existing.stacks = clamp(existing.stacks + stacks, 1, definition.maxStacks)
    existing.duration = Math.max(existing.duration, duration)

    return {
      statusId,
      stacks: existing.stacks,
      duration: existing.duration,
    }
  }

  unit.statuses.push({
    id: statusId,
    stacks: clamp(stacks, 1, definition.maxStacks),
    duration,
  })

  return {
    statusId,
    stacks: clamp(stacks, 1, definition.maxStacks),
    duration,
  }
}

export function captureUnitState(unit: UnitState): UnitStateSnapshot {
  return {
    hp: unit.hp,
    statuses: cloneStatuses(unit.statuses),
    position: clonePoint(unit.position),
  }
}

export function buildPresentationSnapshot(
  unitId: string,
  before: UnitStateSnapshot,
  after: UnitState,
): CombatPresentationUnitSnapshot {
  return {
    unitId,
    hpBefore: before.hp,
    hpAfter: after.hp,
    statusesBefore: cloneStatuses(before.statuses),
    statusesAfter: cloneStatuses(after.statuses),
    positionBefore: clonePoint(before.position),
    positionAfter: clonePoint(after.position),
  }
}

export function getActionPresentationProfile(actor: UnitState, skill?: SkillDefinition) {
  return skill?.presentation ?? attackPresentationDefinitions[getClassDefinition(actor).basicAttackPresentationId]
}

export function buildImpulseProfile(
  matterProfile: string,
  kind: 'damage' | 'heal' | 'status' | 'push' | 'counter' | 'defeat',
): CombatImpulseProfile {
  switch (matterProfile) {
    case 'ember-plume':
      return { intensity: 1.2, spread: 0.7, fragmentCount: 14, speed: 1.35, lifetimeMs: 720 }
    case 'arrow-streak':
      return { intensity: 0.9, spread: 0.32, fragmentCount: 8, speed: 1.7, lifetimeMs: 480 }
    case 'dash-burst':
      return { intensity: 1.1, spread: 0.45, fragmentCount: 12, speed: 1.8, lifetimeMs: 420 }
    case 'light-shards':
      return { intensity: 0.8, spread: 0.52, fragmentCount: 10, speed: 1.15, lifetimeMs: 560 }
    case 'ward-orbit':
      return { intensity: 0.55, spread: 0.6, fragmentCount: 9, speed: 0.85, lifetimeMs: 880 }
    case 'slow-haze':
      return { intensity: 0.5, spread: 0.72, fragmentCount: 7, speed: 0.65, lifetimeMs: 980 }
    case 'guard-fragments':
      return { intensity: 0.75, spread: 0.42, fragmentCount: 9, speed: 1.05, lifetimeMs: 620 }
    case 'magic-bolt':
      return { intensity: 0.95, spread: 0.36, fragmentCount: 8, speed: 1.35, lifetimeMs: 540 }
    default:
      if (kind === 'push') {
        return { intensity: 0.85, spread: 0.28, fragmentCount: 10, speed: 1.25, lifetimeMs: 440 }
      }

      if (kind === 'defeat') {
        return { intensity: 1.15, spread: 0.55, fragmentCount: 16, speed: 1.2, lifetimeMs: 760 }
      }

      return { intensity: 0.82, spread: 0.35, fragmentCount: 10, speed: 1.05, lifetimeMs: 460 }
  }
}

export function shouldCreateProjectileStep(
  source: GridPoint,
  target: GridPoint,
  matterProfile: string,
): boolean {
  const distance = manhattan(source, target)

  return (
    distance > 1 ||
    matterProfile === 'arrow-streak' ||
    matterProfile === 'ember-plume' ||
    matterProfile === 'light-shards' ||
    matterProfile === 'magic-bolt'
  )
}

export function createStep(
  step: Omit<CombatPresentationStep, 'statusChanges'> & {
    statusChanges?: CombatPresentationStep['statusChanges']
  },
): CombatPresentationStep {
  return {
    ...step,
    statusChanges: step.statusChanges ?? [],
  }
}

export function tickStatuses(unit: UnitState): void {
  unit.statuses = unit.statuses
    .map((status) => ({ ...status, duration: status.duration - 1 }))
    .filter((status) => status.duration > 0)
}

export function getBridgeDropDestinationPoint(
  map: BattleMapData,
  actorPoint: GridPoint,
  targetPoint: GridPoint,
): GridPoint | undefined {
  const dx = clamp(targetPoint.x - actorPoint.x, -1, 1)
  const dy = clamp(targetPoint.y - actorPoint.y, -1, 1)

  if (dx === 0 && dy === 0) {
    return undefined
  }

  const targetTile = getTerrain(map, targetPoint)

  if (!targetTile || targetTile.terrainId !== 'bridge') {
    return undefined
  }

  const nextPoint = {
    x: targetPoint.x + dx,
    y: targetPoint.y + dy,
  }
  const nextTile = inBounds(map, nextPoint) ? getTerrain(map, nextPoint) : undefined

  return nextTile?.terrainId === 'water' ? nextPoint : undefined
}

export function evaluateForestKindlingReaction(
  state: BattleState,
  targetBefore: UnitStateSnapshot,
  target: UnitState,
  appliedStatuses: AppliedStatusResult[],
): TerrainReactionResult | undefined {
  const targetTile = getTerrain(state.map, target.position)
  const gainedBurning = appliedStatuses.some((status) => status.statusId === 'burning')

  if (!targetTile || targetTile.terrainId !== 'forest' || target.defeated || (!gainedBurning && !hasStatus(targetBefore, 'burning'))) {
    return undefined
  }

  const burning = applyStatus(target, 'burning', 1, 2)
  const reaction: TerrainReactionResult = {
    id: 'forest-kindling',
    unitId: target.id,
    terrainId: targetTile.terrainId,
    amount: 2,
    valueKind: 'damage',
    statusChanges: [burning],
  }

  target.hp = Math.max(0, target.hp - 2)

  if (target.hp === 0) {
    target.defeated = true
    reaction.defeat = { unitId: target.id }
  }

  return reaction
}

export function evaluateRuinsEchoReaction(
  state: BattleState,
  target: UnitState,
  skill: SkillDefinition | undefined,
): TerrainReactionResult | undefined {
  const targetTile = getTerrain(state.map, target.position)

  if (
    !skill ||
    !targetTile ||
    targetTile.terrainId !== 'ruins' ||
    target.defeated ||
    (skill.targetType !== 'ally' && skill.targetType !== 'self')
  ) {
    return undefined
  }

  const healing = Math.min(2, getClassDefinition(target).stats.maxHp - target.hp)

  if (healing > 0) {
    target.hp += healing
  }

  const warded = applyStatus(target, 'warded', 1, 3)

  return {
    id: 'ruins-echo',
    unitId: target.id,
    terrainId: targetTile.terrainId,
    amount: healing,
    valueKind: 'heal',
    statusChanges: [warded],
  }
}

export function evaluateBridgeDropReaction(
  state: BattleState,
  actor: UnitState,
  target: UnitState,
): TerrainReactionResult | undefined {
  const targetTile = getTerrain(state.map, target.position)
  const bridgeDropDestination = getBridgeDropDestinationPoint(state.map, actor.position, target.position)

  if (!targetTile || targetTile.terrainId !== 'bridge' || !bridgeDropDestination || target.defeated) {
    return undefined
  }

  target.hp = 0
  target.defeated = true

  return {
    id: 'bridge-drop',
    unitId: target.id,
    terrainId: targetTile.terrainId,
    statusChanges: [],
    defeat: {
      unitId: target.id,
    },
  }
}
