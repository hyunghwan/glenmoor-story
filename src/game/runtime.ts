import {
  aiProfiles,
  battleDefinition,
  classDefinitions,
  skillDefinitions,
  statusDefinitions,
  terrainDefinitions,
} from './content'
import type {
  ActionTarget,
  AiScoredAction,
  AppliedStatusResult,
  AttackFlavor,
  BattleAction,
  BattleDefinition,
  BattleMapData,
  BattleState,
  ClassDefinition,
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
  TiledMapData,
  UnitBlueprint,
  UnitState,
} from './types'
import { parseTiledMap } from './map'

interface SimulateOptions {
  mutate: boolean
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

  return {
    id: blueprint.id,
    nameKey: blueprint.nameKey,
    classId: blueprint.classId,
    team: blueprint.team,
    position: clonePoint(blueprint.position),
    facing: blueprint.team === 'allies' ? 'north' : 'south',
    hp: unitClass.stats.maxHp,
    statuses: [],
    nextActAt: initiative,
    hasMovedThisTurn: false,
    hasActedThisTurn: false,
    defeated: false,
  }
}

function addMessage(state: BattleState, message: string): void {
  state.messages = [message, ...state.messages].slice(0, 8)
}

function updateBattleOutcome(state: BattleState): void {
  const alliesAlive = Object.values(state.units).some((unit) => unit.team === 'allies' && !unit.defeated)
  const enemiesAlive = Object.values(state.units).some((unit) => unit.team === 'enemies' && !unit.defeated)

  if (!alliesAlive) {
    state.phase = 'defeat'
  } else if (!enemiesAlive) {
    state.phase = 'victory'
  }
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

function tickStatuses(unit: UnitState): void {
  unit.statuses = unit.statuses
    .map((status) => ({ ...status, duration: status.duration - 1 }))
    .filter((status) => status.duration > 0)
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

  return {
    definitionId: definition.id,
    map,
    units,
    activeUnitId,
    turnIndex: 1,
    phase: 'briefing',
    messages: [],
  }
}

function consumeTurn(actor: UnitState): void {
  actor.hasMovedThisTurn = false
  actor.hasActedThisTurn = false
  actor.nextActAt += getActionDelay(actor)
  tickStatuses(actor)
}

function setNextActiveUnit(state: BattleState): void {
  const next = Object.values(state.units)
    .filter((unit) => !unit.defeated)
    .sort(sortTurnUnits)[0]

  if (!next) {
    updateBattleOutcome(state)
    return
  }

  state.activeUnitId = next.id
  state.turnIndex += 1

  for (const unit of Object.values(state.units)) {
    unit.hasMovedThisTurn = false
    unit.hasActedThisTurn = false
  }
}

function processTurnStart(state: BattleState): string[] {
  const messages: string[] = []
  const actor = state.units[state.activeUnitId]

  if (!actor || actor.defeated) {
    return messages
  }

  const burningStacks = getStatusStacks(actor, 'burning')

  if (burningStacks > 0) {
    const burnDamage = burningStacks * 2
    actor.hp = Math.max(0, actor.hp - burnDamage)
    messages.push(`burn:${actor.id}:${burnDamage}`)

    if (actor.hp === 0) {
      actor.defeated = true
      messages.push(`fell:${actor.id}`)
      consumeTurn(actor)
      updateBattleOutcome(state)

      if (state.phase === 'active') {
        setNextActiveUnit(state)
        return [...messages, ...processTurnStart(state)]
      }
    }
  }

  messages.unshift(`turn:${actor.id}`)
  return messages
}

function simulateAction(baseState: BattleState, action: BattleAction, options: SimulateOptions): CombatResolution {
  const state = options.mutate ? baseState : structuredClone(baseState)
  const actor = state.units[action.actorId]
  const startTurnMessages: string[] = []

  if (!actor || actor.defeated) {
    return { action, actorAfterMove: { x: 0, y: 0 }, startTurnMessages, messages: [], state }
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
    startTurnMessages,
    messages: [],
    state,
  }

  if (action.kind === 'wait') {
    result.messages.push(`wait:${actor.id}`)
    consumeTurn(actor)
    updateBattleOutcome(state)

    if (state.phase === 'active') {
      setNextActiveUnit(state)
      result.startTurnMessages.push(...processTurnStart(state))
    }

    return result
  }

  const target = action.targetId ? state.units[action.targetId] : undefined

  if (!target || target.defeated) {
    return result
  }

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
    result.messages.push(`damage:${actor.id}:${target.id}:${damage.amount}`)
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
        result.messages.push(`damage:${actor.id}:${target.id}:${damage.amount}`)
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
        result.messages.push(`heal:${actor.id}:${target.id}:${healing}`)
      }

      if (effect.type === 'status') {
        appliedStatuses.push(applyStatus(target, effect.statusId, effect.stacks, effect.duration))
        result.messages.push(`status:${target.id}:${effect.statusId}`)
      }

      if (effect.type === 'push' && !target.defeated) {
        const evaluatedPush = evaluatePush(state, actor, target, effect.distance)
        pushResult = evaluatedPush

        if (evaluatedPush.succeeded && evaluatedPush.destination) {
          target.position = clonePoint(evaluatedPush.destination)
        }

        result.messages.push(
          evaluatedPush.succeeded
            ? `push:${target.id}`
            : `pushBlocked:${target.id}:${evaluatedPush.blockedReason ?? 'edge'}`,
        )
      }
    }
  }

  if (result.primary) {
    result.primary.appliedStatuses = appliedStatuses
    result.primary.push = pushResult
  }

  if (target.defeated) {
    result.messages.push(`fell:${target.id}`)
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
    result.messages.push(`counter:${target.id}:${actor.id}:${counter.amount}`)

    if (actor.defeated) {
      result.messages.push(`fell:${actor.id}`)
    }
  }

  actor.hasActedThisTurn = true
  consumeTurn(actor)
  updateBattleOutcome(state)

  if (state.phase === 'active') {
    setNextActiveUnit(state)
    result.startTurnMessages.push(...processTurnStart(state))
  }

  return result
}

export class BattleRuntime {
  state: BattleState
  readonly definition: BattleDefinition

  constructor(mapData: TiledMapData) {
    this.definition = battleDefinition
    this.state = createBattleState(this.definition, parseTiledMap(this.definition.mapId, mapData))
  }

  reset(mapData: TiledMapData): void {
    this.state = createBattleState(this.definition, parseTiledMap(this.definition.mapId, mapData))
  }

  startBattle(): string[] {
    this.state.phase = 'active'
    const messages = processTurnStart(this.state)

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
    return simulateAction(this.state, action, { mutate: false })
  }

  commitAction(action: BattleAction): CombatResolution {
    const resolution = simulateAction(this.state, action, { mutate: true })
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
    const reachable = getReachableTilesForState(this.state, actor.id)
    const candidateActions: AiScoredAction[] = []

    for (const tile of reachable) {
      candidateActions.push(...this.buildOffensiveCandidates(actor, tile.point, profile))
      candidateActions.push(...this.buildSupportCandidates(actor, tile.point, profile))
    }

    if (candidateActions.length === 0) {
      const idleDestination = reachable
        .slice()
        .sort((left, right) => this.scorePosition(actor, right.point, profile) - this.scorePosition(actor, left.point, profile))[0]?.point

      return {
        action: { actorId: actor.id, kind: 'wait', destination: idleDestination },
        breakdown: {
          total: idleDestination ? this.scorePosition(actor, idleDestination, profile) : 0,
          damage: 0,
          healing: 0,
          lethal: 0,
          counterRisk: 0,
          terrain: idleDestination ? this.scorePosition(actor, idleDestination, profile) : 0,
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

  private buildOffensiveCandidates(actor: UnitState, destination: GridPoint, profile: typeof aiProfiles[string]): AiScoredAction[] {
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

    return [...attackTargets, ...skillTargets].map((target) => {
      const action: BattleAction = {
        actorId: actor.id,
        kind: target.forecast.action.kind,
        skillId: target.forecast.action.skillId,
        targetId: target.unitId,
        destination,
      }
      const forecast =
        action.kind === 'attack'
          ? this.previewAction(action)
          : this.previewAction({ ...action, kind: 'skill', skillId: skill.id })
      const primary = forecast.primary
      const targetUnit = this.state.units[target.unitId]
      const terrainScore = this.scorePosition(actor, destination, profile)
      const damageScore = (primary?.kind === 'damage' ? primary.amount : 0) * 6 * profile.aggression
      const lethalScore = primary?.targetDefeated ? 120 : 0
      const counterRisk = forecast.counter ? forecast.counter.amount * 4 * (1 - profile.riskTolerance) : 0
      const controlScore =
        (primary?.appliedStatuses.length ?? 0) * 12 * profile.controlBias +
        (primary?.push?.succeeded ? 16 * profile.controlBias : 0)
      const facingScore = relationBonus(primary?.relation ?? 'front') * 4
      const total = damageScore + lethalScore + terrainScore + controlScore + facingScore - counterRisk

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
          control: controlScore + (targetUnit.team !== actor.team ? 0 : -10),
          facing: facingScore,
        },
      }
    })
  }

  private buildSupportCandidates(actor: UnitState, destination: GridPoint, profile: typeof aiProfiles[string]): AiScoredAction[] {
    const skill = getSkillDefinition(actor)

    if (skill.targetType === 'enemy') {
      return []
    }

    return this.getTargetsForAction({
      actorId: actor.id,
      kind: 'skill',
      skillId: skill.id,
      destination,
    }).map((target) => {
      const forecast = this.previewAction({
        actorId: actor.id,
        kind: 'skill',
        skillId: skill.id,
        destination,
        targetId: target.unitId,
      })
      const primary = forecast.primary
      const healingScore = (primary?.kind === 'heal' ? primary.amount : 0) * 6 * profile.support
      const controlScore = (primary?.appliedStatuses.length ?? 0) * 10 * profile.support
      const terrainScore = this.scorePosition(actor, destination, profile)
      const total = healingScore + controlScore + terrainScore

      return {
        action: forecast.action,
        forecast,
        breakdown: {
          total,
          damage: 0,
          healing: healingScore,
          lethal: 0,
          counterRisk: 0,
          terrain: terrainScore,
          control: controlScore,
          facing: 0,
        },
      }
    })
  }

  private scorePosition(actor: UnitState, destination: GridPoint, profile: typeof aiProfiles[string]): number {
    const tile = getTerrain(this.state.map, destination)

    if (!tile) {
      return 0
    }

    const terrain = terrainDefinitions[tile.terrainId]
    const nearestEnemy = Object.values(this.state.units)
      .filter((unit) => unit.team !== actor.team && !unit.defeated)
      .sort((left, right) => manhattan(destination, left.position) - manhattan(destination, right.position))[0]
    const distanceScore = nearestEnemy ? Math.max(0, 8 - manhattan(destination, nearestEnemy.position)) * profile.aggression : 0

    return (
      (terrain.defenseBonus + terrain.resistanceBonus + tile.height) * 8 * profile.terrainBias + distanceScore
    )
  }
}
