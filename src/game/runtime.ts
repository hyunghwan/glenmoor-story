import {
  attackPresentationDefinitions,
  aiProfiles,
  battleDefinition,
  classDefinitions,
  skillDefinitions,
  statusDefinitions,
  terrainDefinitions,
  terrainReactionDefinitions,
} from './content'
import type {
  ActionTarget,
  AiScoredAction,
  AppliedStatusResult,
  AttackFlavor,
  BattleFeedEntry,
  BattleAction,
  BattleDefinition,
  BattleEventEffect,
  BattleEventTrigger,
  BattleMapData,
  BattleObjectiveCondition,
  BattleObjectivePhaseDefinition,
  BattleScriptedEvent,
  BattleState,
  ClassDefinition,
  CombatImpulseProfile,
  CombatPresentation,
  CombatPresentationStep,
  CombatPresentationUnitSnapshot,
  CombatResolution,
  Direction,
  ExchangeOutcome,
  FacingRelation,
  GridPoint,
  MapTile,
  PushResult,
  ReachableTile,
  SkillDefinition,
  StatusInstance,
  Team,
  TerrainReactionResult,
  TiledMapData,
  UnitBlueprint,
  UnitState,
} from './types'
import { parseTiledMap } from './map'

interface SimulateOptions {
  mutate: boolean
}

interface UnitStateSnapshot {
  hp: number
  statuses: StatusInstance[]
  position: GridPoint
}

interface EventTriggerContext {
  type: BattleEventTrigger['type']
  unitId?: string
  team?: Team
}

const directions: GridPoint[] = [
  { x: 1, y: 0 },
  { x: -1, y: 0 },
  { x: 0, y: 1 },
  { x: 0, y: -1 },
]

function pointKey(point: GridPoint): string {
  return `${point.x},${point.y}`
}

function clonePoint(point: GridPoint): GridPoint {
  return { x: point.x, y: point.y }
}

function cloneStatuses(statuses: StatusInstance[]): StatusInstance[] {
  return statuses.map((status) => ({ ...status }))
}

function samePoint(a: GridPoint, b: GridPoint): boolean {
  return a.x === b.x && a.y === b.y
}

function manhattan(a: GridPoint, b: GridPoint): number {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y)
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

function sortTurnUnits(a: UnitState, b: UnitState): number {
  if (a.nextActAt !== b.nextActAt) {
    return a.nextActAt - b.nextActAt
  }

  const speedDelta = getEffectiveSpeed(b) - getEffectiveSpeed(a)

  if (speedDelta !== 0) {
    return speedDelta
  }

  return a.id.localeCompare(b.id)
}

function getClassDefinition(unit: UnitState): ClassDefinition {
  return classDefinitions[unit.classId]
}

function getSkillDefinition(unit: UnitState): SkillDefinition {
  return skillDefinitions[getClassDefinition(unit).signatureSkillId]
}

function getStatusStacks(unit: UnitState, statusId: keyof typeof statusDefinitions): number {
  return unit.statuses.find((status) => status.id === statusId)?.stacks ?? 0
}

function hasStatus(unit: Pick<UnitStateSnapshot, 'statuses'> | Pick<UnitState, 'statuses'>, statusId: StatusInstance['id']): boolean {
  return unit.statuses.some((status) => status.id === statusId)
}

function getEffectiveSpeed(unit: UnitState): number {
  const base = getClassDefinition(unit).stats.speed
  return Math.max(1, base - getStatusStacks(unit, 'slow'))
}

function getActionDelay(unit: UnitState): number {
  return Math.max(40, 120 - getEffectiveSpeed(unit) * 7)
}

function getTerrain(map: BattleMapData, point: GridPoint): MapTile | undefined {
  return map.tiles[point.y]?.[point.x]
}

function inBounds(map: BattleMapData, point: GridPoint): boolean {
  return point.x >= 0 && point.y >= 0 && point.x < map.width && point.y < map.height
}

function getOccupantId(state: BattleState, point: GridPoint, ignoreUnitId?: string): string | undefined {
  return Object.values(state.units).find(
    (unit) => !unit.defeated && unit.id !== ignoreUnitId && samePoint(unit.position, point),
  )?.id
}

function directionFromTo(from: GridPoint, to: GridPoint): Direction {
  const dx = to.x - from.x
  const dy = to.y - from.y

  if (Math.abs(dx) > Math.abs(dy)) {
    return dx >= 0 ? 'east' : 'west'
  }

  return dy >= 0 ? 'south' : 'north'
}

function relationFromFacing(defenderFacing: Direction, attacker: GridPoint, defender: GridPoint): FacingRelation {
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

function relationBonus(relation: FacingRelation): number {
  if (relation === 'back') {
    return 4
  }

  if (relation === 'side') {
    return 2
  }

  return 0
}

function createUnitState(blueprint: UnitBlueprint, deploymentIndex: number): UnitState {
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

function addMessage(state: BattleState, message: BattleFeedEntry): void {
  state.messages = [message, ...state.messages].slice(0, 8)
}

function getObjectivePhases(definition: BattleDefinition): BattleObjectivePhaseDefinition[] {
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

function getObjectivePhase(definition: BattleDefinition, phaseId: string): BattleObjectivePhaseDefinition {
  return getObjectivePhases(definition).find((phase) => phase.id === phaseId) ?? getObjectivePhases(definition)[0]
}

function applyObjectivePhaseState(state: BattleState, definition: BattleDefinition, phaseId: string): void {
  const phase = getObjectivePhase(definition, phaseId)
  state.objectivePhaseId = phase.id
  state.objectiveKey = phase.objectiveKey
  state.briefingKey = phase.briefingKey ?? definition.briefingKey
  state.victoryKey = phase.victoryKey ?? definition.victoryKey
  state.defeatKey = phase.defeatKey ?? definition.defeatKey
}

function isObjectiveConditionMet(state: BattleState, condition: BattleObjectiveCondition): boolean {
  switch (condition.type) {
    case 'eliminate-team':
      return !Object.values(state.units).some((unit) => unit.team === condition.team && !unit.defeated)
    case 'defeat-unit':
      return state.units[condition.unitId]?.defeated === true
    case 'turn-at-least':
      return state.turnIndex >= condition.turnIndex
  }
}

function updateBattleOutcome(state: BattleState, definition: BattleDefinition): void {
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
  context: EventTriggerContext,
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

function processScriptedEvents(
  state: BattleState,
  definition: BattleDefinition,
  context: EventTriggerContext,
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

function applyStatus(unit: UnitState, statusId: StatusInstance['id'], stacks: number, duration: number): AppliedStatusResult {
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

function captureUnitState(unit: UnitState): UnitStateSnapshot {
  return {
    hp: unit.hp,
    statuses: cloneStatuses(unit.statuses),
    position: clonePoint(unit.position),
  }
}

function buildPresentationSnapshot(
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

function getActionPresentationProfile(actor: UnitState, skill?: SkillDefinition) {
  return skill?.presentation ?? attackPresentationDefinitions[getClassDefinition(actor).basicAttackPresentationId]
}

function buildImpulseProfile(
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

function shouldCreateProjectileStep(
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

function createStep(
  step: Omit<CombatPresentationStep, 'statusChanges'> & {
    statusChanges?: CombatPresentationStep['statusChanges']
  },
): CombatPresentationStep {
  return {
    ...step,
    statusChanges: step.statusChanges ?? [],
  }
}

function tickStatuses(unit: UnitState): void {
  unit.statuses = unit.statuses
    .map((status) => ({ ...status, duration: status.duration - 1 }))
    .filter((status) => status.duration > 0)
}

function getBridgeDropDestinationPoint(
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

function evaluateForestKindlingReaction(
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

function evaluateRuinsEchoReaction(
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

function evaluateBridgeDropReaction(
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

function calculateDamage(
  attacker: UnitState,
  defender: UnitState,
  power: number,
  flavor: AttackFlavor,
  relation: FacingRelation,
  map: BattleMapData,
  skillId?: string,
): { amount: number; terrainBonus: number; heightDelta: number } {
  const attackerClass = getClassDefinition(attacker)
  const defenderClass = getClassDefinition(defender)
  const attackerTile = getTerrain(map, attacker.position)
  const defenderTile = getTerrain(map, defender.position)
  const offenseStat = flavor === 'power' ? attackerClass.stats.power : attackerClass.stats.magic
  const defenseBase = flavor === 'power' ? defenderClass.stats.defense : defenderClass.stats.resistance
  const guardBreakPenalty = getStatusStacks(defender, 'guardBreak')
  const wardedReduction = getStatusStacks(defender, 'warded') * 2
  const terrainBonus = flavor === 'power' ? defenderTile?.terrainId ? terrainDefinitions[defenderTile.terrainId].defenseBonus : 0 : defenderTile?.terrainId ? terrainDefinitions[defenderTile.terrainId].resistanceBonus : 0
  const heightDelta = clamp((attackerTile?.height ?? 0) - (defenderTile?.height ?? 0), -2, 3)
  const defenseStat = Math.max(0, defenseBase + terrainBonus - guardBreakPenalty)
  const flankBonus = relationBonus(relation)
  const heightBonus = Math.max(0, heightDelta)
  const shadowBonus = skillId === 'shadowLunge' ? flankBonus : 0
  const amount = Math.max(1, power + offenseStat + flankBonus + heightBonus + shadowBonus - defenseStat - wardedReduction)

  return {
    amount,
    terrainBonus,
    heightDelta,
  }
}

function calculateHealing(attacker: UnitState, target: UnitState, amount: number): number {
  const actorMagic = getClassDefinition(attacker).stats.magic
  const targetMaxHp = getClassDefinition(target).stats.maxHp

  return Math.min(amount + Math.floor(actorMagic / 2), targetMaxHp - target.hp)
}

function buildExchange(
  actor: UnitState,
  target: UnitState,
  labelKey: string,
  kind: 'damage' | 'heal',
  flavor: AttackFlavor | 'support',
  amount: number,
  relation: FacingRelation,
  terrainBonus: number,
  heightDelta: number,
  appliedStatuses: AppliedStatusResult[],
  push?: ExchangeOutcome['push'],
): ExchangeOutcome {
  return {
    sourceId: actor.id,
    targetId: target.id,
    labelKey,
    amount,
    kind,
    flavor,
    relation,
    terrainBonus,
    heightDelta,
    appliedStatuses,
    push,
    targetDefeated: target.defeated,
  }
}

function buildCombatPresentation(
  resolution: CombatResolution,
  actorBefore: UnitStateSnapshot,
  actorAfter: UnitState,
  targetBefore?: UnitStateSnapshot,
  targetAfter?: UnitState,
): CombatPresentation | undefined {
  const actionLabelKey =
    resolution.primary?.labelKey ??
    resolution.counter?.labelKey ??
    (resolution.action.kind === 'wait' ? 'hud.action.wait' : 'hud.none')

  if (!resolution.primary || !targetBefore || !targetAfter) {
    return undefined
  }

  const skill = getSkillForAction(actorAfter, resolution.action)
  const presentation = getActionPresentationProfile(actorAfter, skill)
  const sourcePoint = clonePoint(actorAfter.position)
  const targetPoint = clonePoint(targetBefore.position)

  const steps: CombatPresentationStep[] = [
    createStep({
      kind: 'announce',
      actorId: resolution.action.actorId,
      targetId: resolution.action.targetId,
      labelKey: actionLabelKey,
      fxCueId: presentation.fxCueId,
      sfxCueId: presentation.sfxCueId,
      impactWeight: presentation.impactWeight,
      hitStopMs: 0,
      sourcePoint,
      targetPoint,
      cameraCue: 'none',
      durationMs: 220,
    }),
  ]

  steps.push(
    createStep({
        kind: 'cast',
        actorId: resolution.primary.sourceId,
        targetId: resolution.primary.targetId,
        labelKey: resolution.primary.labelKey,
        fxCueId: presentation.fxCueId,
        sfxCueId: presentation.sfxCueId,
        impactWeight: presentation.impactWeight,
        hitStopMs: 0,
        sourcePoint,
        targetPoint,
        cameraCue: 'none',
        durationMs: presentation.castMs,
    }),
  )

  if (shouldCreateProjectileStep(sourcePoint, targetPoint, presentation.matterProfile)) {
    steps.push(
      createStep({
          kind: 'projectile',
          actorId: resolution.primary.sourceId,
          targetId: resolution.primary.targetId,
          labelKey: resolution.primary.labelKey,
          fxCueId: presentation.fxCueId,
          sfxCueId: presentation.sfxCueId,
          impactWeight: presentation.impactWeight,
          hitStopMs: 0,
          sourcePoint,
          targetPoint,
          cameraCue: 'none',
          impulseProfile: buildImpulseProfile(presentation.matterProfile, 'damage'),
        durationMs: Math.max(150, Math.round(presentation.impactMs * 0.6)),
      }),
    )
  }

  steps.push(
    createStep({
        kind: 'hit',
        actorId: resolution.primary.sourceId,
        targetId: resolution.primary.targetId,
        labelKey: resolution.primary.labelKey,
        fxCueId: presentation.fxCueId,
        sfxCueId: resolution.primary.targetDefeated ? 'kill-confirm' : presentation.sfxCueId,
        impactWeight: resolution.primary.targetDefeated ? 'finisher' : presentation.impactWeight,
        hitStopMs: resolution.primary.targetDefeated
          ? Math.max(presentation.hitStopMs, 56)
          : presentation.hitStopMs,
        sourcePoint,
        targetPoint,
        amount: resolution.primary.amount,
        valueKind: resolution.primary.kind,
      cameraCue: presentation.cameraCue,
      impulseProfile: buildImpulseProfile(
        presentation.matterProfile,
        resolution.primary.kind === 'heal' ? 'heal' : 'damage',
      ),
      durationMs: presentation.impactMs,
    }),
  )

  const effectStatusChanges = resolution.primary.appliedStatuses.map((status) => ({
    ...status,
    unitId: resolution.primary!.targetId,
  }))

  if (effectStatusChanges.length > 0) {
    const statusPresentation = statusDefinitions[effectStatusChanges[0].statusId].presentation

    steps.push(
      createStep({
          kind: 'status',
          actorId: resolution.primary.sourceId,
          targetId: resolution.primary.targetId,
          labelKey: resolution.primary.labelKey,
          fxCueId: statusPresentation.fxCueId,
          sfxCueId: statusPresentation.sfxCueId,
          impactWeight: statusPresentation.impactWeight,
          hitStopMs: statusPresentation.hitStopMs,
          sourcePoint,
          targetPoint,
          statusChanges: effectStatusChanges,
          cameraCue: statusPresentation.cameraCue,
        impulseProfile: buildImpulseProfile(statusPresentation.matterProfile, 'status'),
        durationMs: 320,
      }),
    )
  }

  if (resolution.primary.push?.attempted) {
    steps.push(
      createStep({
        kind: 'push',
        actorId: resolution.primary.sourceId,
        targetId: resolution.primary.targetId,
        labelKey: resolution.primary.labelKey,
        fxCueId: `${presentation.fxCueId}.push`,
        sfxCueId: presentation.sfxCueId,
        impactWeight: presentation.impactWeight,
        hitStopMs: Math.max(8, Math.round(presentation.hitStopMs * 0.6)),
        sourcePoint,
        targetPoint: clonePoint(resolution.primary.push.destination ?? targetPoint),
        push: resolution.primary.push,
        cameraCue: 'impact-light',
        impulseProfile: buildImpulseProfile(presentation.matterProfile, 'push'),
        durationMs: 280,
      }),
    )
  }

  for (const reaction of resolution.terrainReactions) {
    const reactionPresentation = terrainReactionDefinitions[reaction.id]

    steps.push(
      createStep({
        kind: 'terrain',
        actorId: resolution.primary.sourceId,
        targetId: reaction.unitId,
        labelKey: reactionPresentation.labelKey,
        fxCueId: reactionPresentation.fxCueId,
        sfxCueId: reactionPresentation.sfxCueId,
        impactWeight: reactionPresentation.impactWeight,
        hitStopMs: reactionPresentation.hitStopMs,
        sourcePoint,
        targetPoint: clonePoint(targetAfter.position),
        amount: reaction.amount,
        valueKind: reaction.valueKind,
        cameraCue: reactionPresentation.cameraCue,
        impulseProfile: buildImpulseProfile(
          reactionPresentation.matterProfile,
          reaction.defeat
            ? 'defeat'
            : reaction.valueKind === 'heal'
              ? 'heal'
              : reaction.valueKind === 'damage'
                ? 'damage'
                : 'status',
        ),
        statusChanges: reaction.statusChanges.map((statusChange) => ({
          ...statusChange,
          unitId: reaction.unitId,
        })),
        terrainReaction: reaction.id,
        defeat: reaction.defeat,
        durationMs: reactionPresentation.durationMs,
      }),
    )
  }

  if (resolution.counter) {
    const counterActor = targetAfter
    const counterPresentation = attackPresentationDefinitions[getClassDefinition(counterActor).basicAttackPresentationId]

    steps.push(
      createStep({
        kind: 'counter',
        actorId: resolution.counter.sourceId,
        targetId: resolution.counter.targetId,
        labelKey: resolution.counter.labelKey,
        fxCueId: counterPresentation.fxCueId,
        sfxCueId: 'counter',
        impactWeight: counterPresentation.impactWeight,
        hitStopMs: Math.max(counterPresentation.hitStopMs, 18),
        sourcePoint: clonePoint(targetAfter.position),
        targetPoint: clonePoint(actorAfter.position),
        amount: resolution.counter.amount,
        valueKind: resolution.counter.kind,
        cameraCue: 'counter-jolt',
        impulseProfile: buildImpulseProfile(counterPresentation.matterProfile, 'counter'),
        durationMs: counterPresentation.castMs + Math.round(counterPresentation.impactMs * 0.7),
      }),
    )
  }

  if (resolution.primary.targetDefeated) {
    steps.push(
      createStep({
        kind: 'defeat',
        actorId: resolution.primary.sourceId,
        targetId: resolution.primary.targetId,
        labelKey: resolution.primary.labelKey,
        fxCueId: `${presentation.fxCueId}.defeat`,
        sfxCueId: 'kill-confirm',
        impactWeight: 'finisher',
        hitStopMs: Math.max(presentation.hitStopMs, 64),
        sourcePoint,
        targetPoint: clonePoint(targetAfter.position),
        cameraCue: 'defeat-drop',
        impulseProfile: buildImpulseProfile(presentation.matterProfile, 'defeat'),
        defeat: { unitId: resolution.primary.targetId },
        durationMs: Math.max(260, presentation.lingerMs + 120),
      }),
    )
  }

  if (resolution.counter?.targetDefeated) {
    const counterTarget = actorAfter
    const counterPresentation = attackPresentationDefinitions[getClassDefinition(targetAfter).basicAttackPresentationId]

    steps.push(
      createStep({
        kind: 'defeat',
        actorId: resolution.counter.sourceId,
        targetId: resolution.counter.targetId,
        labelKey: resolution.counter.labelKey,
        fxCueId: `${counterPresentation.fxCueId}.defeat`,
        sfxCueId: 'kill-confirm',
        impactWeight: 'finisher',
        hitStopMs: Math.max(counterPresentation.hitStopMs, 64),
        sourcePoint: clonePoint(targetAfter.position),
        targetPoint: clonePoint(counterTarget.position),
        cameraCue: 'defeat-drop',
        impulseProfile: buildImpulseProfile(counterPresentation.matterProfile, 'defeat'),
        defeat: { unitId: resolution.counter.targetId },
        durationMs: Math.max(260, counterPresentation.lingerMs + 120),
      }),
    )
  }

  steps.push(
    createStep({
      kind: 'recover',
      actorId: resolution.primary.sourceId,
      targetId: resolution.primary.targetId,
      labelKey: resolution.primary.labelKey,
      fxCueId: `${presentation.fxCueId}.recover`,
      sfxCueId: presentation.sfxCueId,
      impactWeight: presentation.impactWeight,
      hitStopMs: 0,
      sourcePoint,
      targetPoint: clonePoint(targetAfter.position),
      cameraCue: 'none',
      durationMs: presentation.lingerMs,
    }),
  )

  return {
    actionLabelKey,
    units: [
      buildPresentationSnapshot(actorAfter.id, actorBefore, actorAfter),
      buildPresentationSnapshot(targetAfter.id, targetBefore, targetAfter),
    ],
    steps,
  }
}

function evaluatePush(
  state: BattleState,
  actor: UnitState,
  target: UnitState,
  distance: number,
): PushResult {
  const dx = clamp(target.position.x - actor.position.x, -1, 1)
  const dy = clamp(target.position.y - actor.position.y, -1, 1)

  if (dx === 0 && dy === 0) {
    return { attempted: true, succeeded: false, blockedReason: 'occupied' }
  }

  let current = clonePoint(target.position)

  for (let step = 0; step < distance; step += 1) {
    const next = { x: current.x + dx, y: current.y + dy }

    if (!inBounds(state.map, next)) {
      return { attempted: true, succeeded: step > 0, blockedReason: 'edge', destination: step > 0 ? current : undefined }
    }

    const terrain = getTerrain(state.map, next)

    if (!terrain || !terrainDefinitions[terrain.terrainId].passable) {
      return { attempted: true, succeeded: step > 0, blockedReason: 'edge', destination: step > 0 ? current : undefined }
    }

    if (getOccupantId(state, next, target.id)) {
      return {
        attempted: true,
        succeeded: step > 0,
        blockedReason: 'occupied',
        destination: step > 0 ? current : undefined,
      }
    }

    if (Math.abs((terrain.height ?? 0) - (getTerrain(state.map, current)?.height ?? 0)) > 1) {
      return {
        attempted: true,
        succeeded: step > 0,
        blockedReason: 'height',
        destination: step > 0 ? current : undefined,
      }
    }

    current = next
  }

  return { attempted: true, succeeded: !samePoint(current, target.position), destination: current }
}

function getSkillForAction(actor: UnitState, action: BattleAction): SkillDefinition | undefined {
  if (action.kind !== 'skill') {
    return undefined
  }

  const skillId = action.skillId ?? getSkillDefinition(actor).id
  return skillDefinitions[skillId]
}

function canCounter(actor: UnitState, target: UnitState): boolean {
  const actorClass = getClassDefinition(actor)
  const distance = manhattan(actor.position, target.position)

  return distance >= actorClass.basicAttackRangeMin && distance <= actorClass.basicAttackRangeMax
}

function getReachableTilesForState(state: BattleState, unitId: string): ReachableTile[] {
  const actor = state.units[unitId]

  if (!actor || actor.defeated) {
    return []
  }

  const actorClass = getClassDefinition(actor)
  const origin = actor.position
  const frontier: { point: GridPoint; cost: number; path: GridPoint[] }[] = [{ point: origin, cost: 0, path: [origin] }]
  const bestCosts = new Map<string, number>([[pointKey(origin), 0]])
  const results: ReachableTile[] = [{ point: origin, path: [origin], cost: 0 }]

  while (frontier.length > 0) {
    frontier.sort((left, right) => left.cost - right.cost)
    const current = frontier.shift()

    if (!current) {
      break
    }

    for (const direction of directions) {
      const next = { x: current.point.x + direction.x, y: current.point.y + direction.y }

      if (!inBounds(state.map, next)) {
        continue
      }

      const terrain = getTerrain(state.map, next)

      if (!terrain || !terrainDefinitions[terrain.terrainId].passable) {
        continue
      }

      if (getOccupantId(state, next, actor.id)) {
        continue
      }

      const heightDelta = terrain.height - (getTerrain(state.map, current.point)?.height ?? 0)

      if (heightDelta > actorClass.stats.maxClimb) {
        continue
      }

      const moveCost = terrainDefinitions[terrain.terrainId].moveCost + Math.max(0, heightDelta)
      const nextCost = current.cost + moveCost

      if (nextCost > actorClass.stats.move) {
        continue
      }

      const key = pointKey(next)

      if ((bestCosts.get(key) ?? Number.POSITIVE_INFINITY) <= nextCost) {
        continue
      }

      bestCosts.set(key, nextCost)
      const nextPath = [...current.path, next]
      frontier.push({ point: next, cost: nextCost, path: nextPath })
      results.push({ point: next, cost: nextCost, path: nextPath })
    }
  }

  return results
}

function createBattleState(definition: BattleDefinition, map: BattleMapData): BattleState {
  const units = [...definition.allies, ...definition.enemies]
    .map(createUnitState)
    .reduce<BattleState['units']>((collection, unit) => {
      collection[unit.id] = unit
      return collection
    }, {})

  const activeUnitId = Object.values(units).sort(sortTurnUnits)[0]?.id ?? definition.allies[0].id
  const initialPhase = getObjectivePhases(definition)[0]

  return {
    definitionId: definition.id,
    map,
    units,
    activeUnitId,
    turnIndex: 1,
    phase: 'briefing',
    objectivePhaseId: initialPhase.id,
    objectiveKey: initialPhase.objectiveKey,
    briefingKey: initialPhase.briefingKey ?? definition.briefingKey,
    victoryKey: initialPhase.victoryKey ?? definition.victoryKey,
    defeatKey: initialPhase.defeatKey ?? definition.defeatKey,
    resolvedEventIds: [],
    messages: [],
  }
}

function consumeTurn(actor: UnitState): void {
  actor.hasMovedThisTurn = false
  actor.hasActedThisTurn = false
  actor.nextActAt += getActionDelay(actor)
  tickStatuses(actor)
}

function setNextActiveUnit(state: BattleState, definition: BattleDefinition): void {
  const next = Object.values(state.units)
    .filter((unit) => !unit.defeated)
    .sort(sortTurnUnits)[0]

  if (!next) {
    updateBattleOutcome(state, definition)
    return
  }

  state.activeUnitId = next.id
  state.turnIndex += 1

  for (const unit of Object.values(state.units)) {
    unit.hasMovedThisTurn = false
    unit.hasActedThisTurn = false
  }
}

function processTurnStart(state: BattleState, definition: BattleDefinition): BattleFeedEntry[] {
  const messages: BattleFeedEntry[] = []
  const actor = state.units[state.activeUnitId]

  if (!actor || actor.defeated) {
    return messages
  }

  const burningStacks = getStatusStacks(actor, 'burning')

  if (burningStacks > 0) {
    const burnDamage = burningStacks * 2
    actor.hp = Math.max(0, actor.hp - burnDamage)
    messages.push({ kind: 'burn', unitId: actor.id, amount: burnDamage })

    if (actor.hp === 0) {
      actor.defeated = true
      messages.push({ kind: 'fell', unitId: actor.id })
      consumeTurn(actor)
      processScriptedEvents(state, definition, { type: 'unit-defeated', unitId: actor.id, team: actor.team })

      if (state.phase === 'active') {
        setNextActiveUnit(state, definition)
        return [...messages, ...processTurnStart(state, definition)]
      }
    }
  }

  processScriptedEvents(state, definition, {
    type: 'turn-start',
    unitId: actor.id,
    team: actor.team,
  })

  if (state.phase !== 'active') {
    return messages
  }

  messages.unshift({ kind: 'turn', unitId: actor.id })
  return messages
}

function simulateAction(
  baseState: BattleState,
  definition: BattleDefinition,
  action: BattleAction,
  options: SimulateOptions,
): CombatResolution {
  const state = options.mutate ? baseState : structuredClone(baseState)
  const actor = state.units[action.actorId]
  const startTurnMessages: BattleFeedEntry[] = []

  if (!actor || actor.defeated) {
    return { action, actorAfterMove: { x: 0, y: 0 }, terrainReactions: [], startTurnMessages, messages: [], state }
  }

  const destination = action.destination ? clonePoint(action.destination) : clonePoint(actor.position)

  if (!samePoint(destination, actor.position)) {
    const previous = clonePoint(actor.position)
    actor.position = destination
    actor.facing = directionFromTo(previous, destination)
  }

  const result: CombatResolution = {
    action,
    actorAfterMove: clonePoint(actor.position),
    terrainReactions: [],
    startTurnMessages,
    messages: [],
    state,
  }

  if (action.kind === 'wait') {
    result.messages.push({ kind: 'wait', unitId: actor.id })
    consumeTurn(actor)
    updateBattleOutcome(state, definition)

    if (state.phase === 'active') {
      setNextActiveUnit(state, definition)
      result.startTurnMessages.push(...processTurnStart(state, definition))
    }

    return result
  }

  const target = action.targetId ? state.units[action.targetId] : undefined

  if (!target || target.defeated) {
    return result
  }

  const actorBefore = captureUnitState(actor)
  const targetBefore = captureUnitState(target)
  const relation = relationFromFacing(target.facing, actor.position, target.position)
  const skill = getSkillForAction(actor, action)
  const appliedStatuses: AppliedStatusResult[] = []
  let pushResult: ExchangeOutcome['push']
  let primaryLabelKey = skill?.nameKey ?? getClassDefinition(actor).basicAttackNameKey

  if (action.kind === 'attack') {
    const damage = calculateDamage(
      actor,
      target,
      getClassDefinition(actor).basicAttackPower,
      getClassDefinition(actor).basicAttackFlavor,
      relation,
      state.map,
    )
    target.hp = Math.max(0, target.hp - damage.amount)
    target.facing = directionFromTo(target.position, actor.position)
    target.defeated = target.hp === 0
    result.primary = buildExchange(
      actor,
      target,
      primaryLabelKey,
      'damage',
      getClassDefinition(actor).basicAttackFlavor,
      damage.amount,
      relation,
      damage.terrainBonus,
      damage.heightDelta,
      appliedStatuses,
    )
  } else if (skill) {
    for (const effect of skill.effects) {
      if (effect.type === 'damage') {
        const damage = calculateDamage(actor, target, effect.amount, effect.flavor, relation, state.map, skill.id)
        target.hp = Math.max(0, target.hp - damage.amount)
        target.facing = directionFromTo(target.position, actor.position)
        target.defeated = target.hp === 0
        result.primary = buildExchange(
          actor,
          target,
          skill.nameKey,
          'damage',
          effect.flavor,
          damage.amount,
          relation,
          damage.terrainBonus,
          damage.heightDelta,
          appliedStatuses,
        )
      }

      if (effect.type === 'heal') {
        const healing = calculateHealing(actor, target, effect.amount)
        target.hp += healing
        result.primary = buildExchange(
          actor,
          target,
          skill.nameKey,
          'heal',
          'support',
          healing,
          relation,
          0,
          0,
          appliedStatuses,
        )
      }

      if (effect.type === 'status') {
        appliedStatuses.push(applyStatus(target, effect.statusId, effect.stacks, effect.duration))
      }

      if (effect.type === 'push' && !target.defeated) {
        const bridgeDrop = evaluateBridgeDropReaction(state, actor, target)

        if (bridgeDrop) {
          result.terrainReactions.push(bridgeDrop)
        } else {
          const evaluatedPush = evaluatePush(state, actor, target, effect.distance)
          pushResult = evaluatedPush

          if (evaluatedPush.succeeded && evaluatedPush.destination) {
            target.position = clonePoint(evaluatedPush.destination)
          }
        }
      }
    }
  }

  if (result.primary) {
    const forestKindling = evaluateForestKindlingReaction(state, targetBefore, target, appliedStatuses)

    if (forestKindling) {
      result.terrainReactions.push(forestKindling)
    }

    const ruinsEcho = evaluateRuinsEchoReaction(state, target, skill)

    if (ruinsEcho) {
      result.terrainReactions.push(ruinsEcho)
    }
  }

  if (result.primary) {
    result.primary.appliedStatuses = appliedStatuses
    result.primary.push = pushResult
    result.primary.targetDefeated = target.defeated
  }

  const offensive = action.kind === 'attack' || skill?.targetType === 'enemy'
  const canTargetCounter = offensive && !target.defeated && (action.kind === 'attack' || skill?.counterable)

  if (canTargetCounter && canCounter(target, actor)) {
    const reverseRelation = relationFromFacing(actor.facing, target.position, actor.position)
    const counter = calculateDamage(
      target,
      actor,
      getClassDefinition(target).basicAttackPower,
      getClassDefinition(target).basicAttackFlavor,
      reverseRelation,
      state.map,
    )
    actor.hp = Math.max(0, actor.hp - counter.amount)
    actor.defeated = actor.hp === 0
    result.counter = buildExchange(
      target,
      actor,
      getClassDefinition(target).basicAttackNameKey,
      'damage',
      getClassDefinition(target).basicAttackFlavor,
      counter.amount,
      reverseRelation,
      counter.terrainBonus,
      counter.heightDelta,
      [],
    )
  }

  result.presentation = buildCombatPresentation(result, actorBefore, actor, targetBefore, target)

  if (result.presentation) {
    result.messages.push({ kind: 'presentation', presentation: result.presentation })
  }

  actor.hasActedThisTurn = true
  consumeTurn(actor)

  const defeatedUnits: UnitState[] = []

  if (targetBefore.hp > 0 && target.defeated) {
    defeatedUnits.push(target)
  }

  if (actorBefore.hp > 0 && actor.defeated) {
    defeatedUnits.push(actor)
  }

  for (const defeatedUnit of defeatedUnits) {
    processScriptedEvents(state, definition, {
      type: 'unit-defeated',
      unitId: defeatedUnit.id,
      team: defeatedUnit.team,
    })
  }

  updateBattleOutcome(state, definition)

  if (state.phase === 'active') {
    setNextActiveUnit(state, definition)
    result.startTurnMessages.push(...processTurnStart(state, definition))
  }

  return result
}

export class BattleRuntime {
  state: BattleState
  readonly definition: BattleDefinition

  constructor(mapData: TiledMapData, definition: BattleDefinition = battleDefinition) {
    this.definition = definition
    this.state = createBattleState(this.definition, parseTiledMap(this.definition.mapId, mapData))
  }

  reset(mapData: TiledMapData): void {
    this.state = createBattleState(this.definition, parseTiledMap(this.definition.mapId, mapData))
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
    const skill = getSkillForAction(actor, action)
    const rangeMin = action.kind === 'attack' ? getClassDefinition(actor).basicAttackRangeMin : skill?.rangeMin ?? 0
    const rangeMax = action.kind === 'attack' ? getClassDefinition(actor).basicAttackRangeMax : skill?.rangeMax ?? 0
    const targetType = action.kind === 'attack' ? 'enemy' : skill?.targetType

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
        forecast: this.previewAction({ ...action, targetId: unit.id }),
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
    const actor = this.state.units[unitId]

    if (!actor || actor.defeated) {
      return {
        action: { actorId: unitId, kind: 'wait' },
        breakdown: { total: 0, damage: 0, healing: 0, lethal: 0, counterRisk: 0, terrain: 0, control: 0, facing: 0 },
      }
    }

    const profile = aiProfiles[this.getBlueprint(actor.id).aiProfileId]
    const threatenedBridgeTiles = actor.team === 'enemies' ? this.getBridgeDropThreatTiles(actor.team) : undefined
    const reachable = getReachableTilesForState(this.state, actor.id)
    const candidateActions: AiScoredAction[] = []

    for (const tile of reachable) {
      candidateActions.push(...this.buildOffensiveCandidates(actor, tile.point, profile, threatenedBridgeTiles))
      candidateActions.push(...this.buildSupportCandidates(actor, tile.point, profile, threatenedBridgeTiles))
    }

    if (candidateActions.length === 0) {
      const idleDestination = reachable
        .slice()
        .sort(
          (left, right) =>
            this.scorePosition(actor, right.point, profile, threatenedBridgeTiles) -
            this.scorePosition(actor, left.point, profile, threatenedBridgeTiles),
        )[0]?.point

      return {
        action: { actorId: actor.id, kind: 'wait', destination: idleDestination },
        breakdown: {
          total: idleDestination ? this.scorePosition(actor, idleDestination, profile, threatenedBridgeTiles) : 0,
          damage: 0,
          healing: 0,
          lethal: 0,
          counterRisk: 0,
          terrain: idleDestination ? this.scorePosition(actor, idleDestination, profile, threatenedBridgeTiles) : 0,
          control: 0,
          facing: 0,
        },
      }
    }

    candidateActions.sort((left, right) => right.breakdown.total - left.breakdown.total)
    return candidateActions[0]
  }

  private getBlueprint(unitId: string): UnitBlueprint {
    return [...this.definition.allies, ...this.definition.enemies].find((unit) => unit.id === unitId)!
  }

  private getPushSkill(unit: UnitState): SkillDefinition | undefined {
    const skill = getSkillDefinition(unit)

    if (skill.targetType !== 'enemy' || !skill.effects.some((effect) => effect.type === 'push')) {
      return undefined
    }

    return skill
  }

  private getBridgeDropThreatTiles(actorTeam: Team): Set<string> {
    const threatened = new Set<string>()
    const opposingPushers = Object.values(this.state.units).filter(
      (unit) => unit.team !== actorTeam && !unit.defeated && this.getPushSkill(unit),
    )

    if (opposingPushers.length === 0) {
      return threatened
    }

    for (const row of this.state.map.tiles) {
      for (const tile of row) {
        if (tile.terrainId !== 'bridge') {
          continue
        }

        const threatenedByPusher = opposingPushers.some((unit) => {
          const skill = this.getPushSkill(unit)

          if (!skill) {
            return false
          }

          return getReachableTilesForState(this.state, unit.id).some((reachable) => {
            const distance = manhattan(reachable.point, tile.point)

            if (distance < skill.rangeMin || distance > skill.rangeMax) {
              return false
            }

            return Boolean(getBridgeDropDestinationPoint(this.state.map, reachable.point, tile.point))
          })
        })

        if (threatenedByPusher) {
          threatened.add(pointKey(tile.point))
        }
      }
    }

    return threatened
  }

  private buildOffensiveCandidates(
    actor: UnitState,
    destination: GridPoint,
    profile: typeof aiProfiles[string],
    threatenedBridgeTiles?: Set<string>,
  ): AiScoredAction[] {
    const attackTargets = this.getTargetsForAction({
      actorId: actor.id,
      kind: 'attack',
      destination,
    })
    const skill = getSkillDefinition(actor)
    const skillTargets =
      skill.targetType === 'enemy'
        ? this.getTargetsForAction({
            actorId: actor.id,
            kind: 'skill',
            skillId: skill.id,
            destination,
          })
        : []

    const terrainScore = this.scorePosition(actor, destination, profile, threatenedBridgeTiles)
    const attackCandidates = attackTargets.map((target) => {
      const primary = target.forecast.primary
      const targetUnit = this.state.units[target.unitId]
      const terrainDamage = target.forecast.terrainReactions.reduce(
        (total, reaction) => total + (reaction.valueKind === 'damage' ? reaction.amount ?? 0 : 0),
        0,
      )
      const terrainReactionBonus =
        (target.forecast.terrainReactions.some((reaction) => reaction.id === 'forest-kindling') ? 12 : 0) +
        (target.forecast.terrainReactions.some((reaction) => reaction.id === 'ruins-echo') ? 12 : 0)
      const damageScore = (primary?.kind === 'damage' ? primary.amount + terrainDamage : terrainDamage) * 6 * profile.aggression
      const lethalScore = primary?.targetDefeated ? 120 : 0
      const counterRisk = target.forecast.counter ? target.forecast.counter.amount * 4 * (1 - profile.riskTolerance) : 0
      const controlScore =
        (primary?.appliedStatuses.length ?? 0) * 12 * profile.controlBias +
        (primary?.push?.succeeded ? 16 * profile.controlBias : 0) +
        terrainReactionBonus
      const facingScore = relationBonus(primary?.relation ?? 'front') * 4
      const total = damageScore + lethalScore + terrainScore + controlScore + facingScore - counterRisk

      return {
        action: target.forecast.action,
        forecast: target.forecast,
        breakdown: {
          total,
          damage: damageScore,
          healing: 0,
          lethal: lethalScore,
          counterRisk: -counterRisk,
          terrain: terrainScore,
          control: controlScore + (targetUnit.team !== actor.team ? 0 : -10),
          facing: facingScore,
        },
      }
    })
    const baselineByTarget = new Map(attackCandidates.map((candidate) => [candidate.action.targetId ?? '', candidate]))
    const skillCandidates = skillTargets.map((target) => {
      const forecast = this.previewAction({
        actorId: actor.id,
        kind: 'skill',
        skillId: skill.id,
        destination,
        targetId: target.unitId,
      })
      const primary = forecast.primary
      const terrainDamage = forecast.terrainReactions.reduce(
        (total, reaction) => total + (reaction.valueKind === 'damage' ? reaction.amount ?? 0 : 0),
        0,
      )
      const terrainReactionBonus =
        (forecast.terrainReactions.some((reaction) => reaction.id === 'forest-kindling') ? 12 : 0) +
        (forecast.terrainReactions.some((reaction) => reaction.id === 'ruins-echo') ? 12 : 0)
      const damageScore = (primary?.kind === 'damage' ? primary.amount + terrainDamage : terrainDamage) * 6 * profile.aggression
      const lethalScore = primary?.targetDefeated ? 120 : 0
      const counterRisk = forecast.counter ? forecast.counter.amount * 4 * (1 - profile.riskTolerance) : 0
      const controlScore =
        (primary?.appliedStatuses.length ?? 0) * 12 * profile.controlBias +
        (primary?.push?.succeeded ? 16 * profile.controlBias : 0) +
        terrainReactionBonus
      const facingScore = relationBonus(primary?.relation ?? 'front') * 4
      const baseline = baselineByTarget.get(target.unitId)
      const weakSkillPenalty =
        baseline && controlScore === 0 && lethalScore === 0 && damageScore <= baseline.breakdown.damage + 6 ? 16 : 4
      const total = damageScore + lethalScore + terrainScore + controlScore + facingScore - counterRisk - weakSkillPenalty

      return {
        action: forecast.action,
        forecast,
        breakdown: {
          total,
          damage: damageScore,
          healing: 0,
          lethal: lethalScore,
          counterRisk: -counterRisk,
          terrain: terrainScore,
          control: controlScore,
          facing: facingScore,
        },
      }
    })

    return [...attackCandidates, ...skillCandidates]
  }

  private buildSupportCandidates(
    actor: UnitState,
    destination: GridPoint,
    profile: typeof aiProfiles[string],
    threatenedBridgeTiles?: Set<string>,
  ): AiScoredAction[] {
    const skill = getSkillDefinition(actor)

    if (skill.targetType === 'enemy') {
      return []
    }

    return this.getTargetsForAction({
      actorId: actor.id,
      kind: 'skill',
      skillId: skill.id,
      destination,
    }).flatMap((target) => {
      const forecast = this.previewAction({
        actorId: actor.id,
        kind: 'skill',
        skillId: skill.id,
        destination,
        targetId: target.unitId,
      })
      const primary = forecast.primary
      const targetUnit = this.state.units[target.unitId]
      const existingWardedDuration = targetUnit.statuses.find((status) => status.id === 'warded')?.duration ?? 0
      const addsWarded =
        (primary?.appliedStatuses.some((status) => status.statusId === 'warded') ?? false) ||
        forecast.terrainReactions.some((reaction) =>
          reaction.statusChanges.some((status) => status.statusId === 'warded'),
        )
      const terrainHealing = forecast.terrainReactions.reduce(
        (total, reaction) => total + (reaction.valueKind === 'heal' ? reaction.amount ?? 0 : 0),
        0,
      )
      const totalHealing = (primary?.kind === 'heal' ? primary.amount : 0) + terrainHealing

      if (totalHealing === 0 && addsWarded && existingWardedDuration >= 2) {
        return []
      }

      const terrainReactionBonus = forecast.terrainReactions.some((reaction) => reaction.id === 'ruins-echo') ? 12 : 0
      const healingScore = totalHealing * 6 * profile.support
      const controlScore = (primary?.appliedStatuses.length ?? 0) * 10 * profile.support + terrainReactionBonus
      const terrainScore = this.scorePosition(actor, destination, profile, threatenedBridgeTiles)
      const zeroHealPenalty = totalHealing === 0 ? 16 : 0
      const redundantWardedPenalty = addsWarded && existingWardedDuration >= 2 ? 22 : 0
      const total = healingScore + controlScore + terrainScore - zeroHealPenalty - redundantWardedPenalty

      return [{
        action: forecast.action,
        forecast,
        breakdown: {
          total,
          damage: 0,
          healing: healingScore,
          lethal: 0,
          counterRisk: 0,
          terrain: terrainScore,
          control: controlScore - redundantWardedPenalty,
          facing: 0,
        },
      }]
    })
  }

  private getOffensiveReach(actor: UnitState): { min: number; max: number } {
    const actorClass = getClassDefinition(actor)
    const skill = getSkillDefinition(actor)

    if (skill.targetType !== 'enemy') {
      return {
        min: actorClass.basicAttackRangeMin,
        max: actorClass.basicAttackRangeMax,
      }
    }

    return {
      min: Math.min(actorClass.basicAttackRangeMin, skill.rangeMin),
      max: Math.max(actorClass.basicAttackRangeMax, skill.rangeMax),
    }
  }

  private scoreEngagementPosition(actor: UnitState, destination: GridPoint, profile: typeof aiProfiles[string]): number {
    const nearestEnemy = Object.values(this.state.units)
      .filter((unit) => unit.team !== actor.team && !unit.defeated)
      .sort((left, right) => manhattan(destination, left.position) - manhattan(destination, right.position))[0]

    if (!nearestEnemy) {
      return 0
    }

    const distance = manhattan(destination, nearestEnemy.position)
    const reach = this.getOffensiveReach(actor)
    const enemyReach = this.getOffensiveReach(nearestEnemy)

    if (reach.max === 1) {
      return Math.max(0, 9 - distance) * 5 * profile.aggression
    }

    if (distance < reach.min) {
      return -18
    }

    if (distance <= reach.max && distance > enemyReach.max) {
      return 24 * profile.aggression
    }

    if (distance <= reach.max) {
      return 14 * profile.aggression
    }

    return Math.max(0, 8 - Math.abs(distance - reach.max)) * 3 * profile.aggression
  }

  private scoreSupportPosition(actor: UnitState, destination: GridPoint, profile: typeof aiProfiles[string]): number {
    const skill = getSkillDefinition(actor)

    if (skill.targetType === 'enemy') {
      return 0
    }

    const priorityAlly = Object.values(this.state.units)
      .filter((unit) => unit.team === actor.team && !unit.defeated)
      .sort((left, right) => {
        const leftNeed =
          (getClassDefinition(left).stats.maxHp - left.hp) * 2 +
          ((left.statuses.find((status) => status.id === 'warded')?.duration ?? 0) === 0 ? 2 : 0)
        const rightNeed =
          (getClassDefinition(right).stats.maxHp - right.hp) * 2 +
          ((right.statuses.find((status) => status.id === 'warded')?.duration ?? 0) === 0 ? 2 : 0)

        if (rightNeed !== leftNeed) {
          return rightNeed - leftNeed
        }

        return manhattan(destination, left.position) - manhattan(destination, right.position)
      })[0]

    if (!priorityAlly) {
      return 0
    }

    const distance = manhattan(destination, priorityAlly.position)

    if (distance >= skill.rangeMin && distance <= skill.rangeMax) {
      return 14 * profile.support
    }

    return Math.max(0, 6 - Math.abs(distance - skill.rangeMax)) * 2 * profile.support
  }

  private scorePosition(
    actor: UnitState,
    destination: GridPoint,
    profile: typeof aiProfiles[string],
    threatenedBridgeTiles?: Set<string>,
  ): number {
    const tile = getTerrain(this.state.map, destination)

    if (!tile) {
      return 0
    }

    const terrain = terrainDefinitions[tile.terrainId]
    const terrainScore = (terrain.defenseBonus + terrain.resistanceBonus + tile.height) * 8 * profile.terrainBias
    const engagementScore = this.scoreEngagementPosition(actor, destination, profile)
    const supportScore = this.scoreSupportPosition(actor, destination, profile)
    const bridgeDropRisk =
      actor.team === 'enemies' && threatenedBridgeTiles?.has(pointKey(destination)) ? 16 : 0

    return terrainScore + engagementScore + supportScore - bridgeDropRisk
  }
}
