import {
  attackPresentationDefinitions,
  skillDefinitions,
  statusDefinitions,
  terrainDefinitions,
  terrainReactionDefinitions,
} from './content'
import type {
  AppliedStatusResult,
  AttackFlavor,
  BattleAction,
  BattleDefinition,
  BattleFeedEntry,
  BattleMapData,
  BattleState,
  CombatPresentation,
  CombatResolution,
  ExchangeOutcome,
  FacingRelation,
  GridPoint,
  PushResult,
  ReachableTile,
  SkillDefinition,
  TiledMapData,
  UnitState,
} from './types'
import { parseTiledMap } from './map'
import {
  applyStatus,
  buildImpulseProfile,
  buildPresentationSnapshot,
  captureUnitState,
  clamp,
  clonePoint,
  createStep,
  createUnitState,
  directionFromTo,
  directions,
  evaluateBridgeDropReaction,
  evaluateForestKindlingReaction,
  evaluateRuinsEchoReaction,
  getActionDelay,
  getActionPresentationProfile,
  getClassDefinition,
  getObjectivePhases,
  getOccupantId,
  getSkillDefinition,
  getStatusStacks,
  getTerrain,
  inBounds,
  manhattan,
  pointKey,
  processScriptedEvents,
  relationBonus,
  relationFromFacing,
  samePoint,
  shouldCreateProjectileStep,
  sortTurnUnits,
  tickStatuses,
  type UnitStateSnapshot,
  updateBattleOutcome,
} from './runtime-effects'

export interface SimulateOptions {
  mutate: boolean
}

export function calculateDamage(
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
  const terrainBonus =
    flavor === 'power'
      ? defenderTile?.terrainId
        ? terrainDefinitions[defenderTile.terrainId].defenseBonus
        : 0
      : defenderTile?.terrainId
        ? terrainDefinitions[defenderTile.terrainId].resistanceBonus
        : 0
  const heightDelta = clamp((attackerTile?.height ?? 0) - (defenderTile?.height ?? 0), -2, 3)
  const defenseStat = Math.max(0, defenseBase + terrainBonus - guardBreakPenalty)
  const flankBonus = relationBonus(relation)
  const heightBonus = Math.max(0, heightDelta)
  const shadowBonus = skillId === 'shadowLunge' ? flankBonus : 0
  const amount = Math.max(
    1,
    power + offenseStat + flankBonus + heightBonus + shadowBonus - defenseStat - wardedReduction,
  )

  return {
    amount,
    terrainBonus,
    heightDelta,
  }
}

export function calculateHealing(attacker: UnitState, target: UnitState, amount: number): number {
  const actorMagic = getClassDefinition(attacker).stats.magic
  const targetMaxHp = getClassDefinition(target).stats.maxHp

  return Math.min(amount + Math.floor(actorMagic / 2), targetMaxHp - target.hp)
}

export function buildExchange(
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

export function getSkillForAction(actor: UnitState, action: BattleAction): SkillDefinition | undefined {
  if (action.kind !== 'skill') {
    return undefined
  }

  const skillId = action.skillId ?? getSkillDefinition(actor).id
  return skillDefinitions[skillId]
}

export function canCounter(actor: UnitState, target: UnitState): boolean {
  const actorClass = getClassDefinition(actor)
  const distance = manhattan(actor.position, target.position)

  return distance >= actorClass.basicAttackRangeMin && distance <= actorClass.basicAttackRangeMax
}

export function buildCombatPresentation(
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

  const steps = [
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
  ]

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

export function evaluatePush(
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

export function getReachableTilesForState(state: BattleState, unitId: string): ReachableTile[] {
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

export function createBattleState(definition: BattleDefinition, mapData: TiledMapData): BattleState {
  const map = parseTiledMap(definition.mapId, mapData)
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

export function consumeTurn(actor: UnitState): void {
  actor.hasMovedThisTurn = false
  actor.hasActedThisTurn = false
  actor.nextActAt += getActionDelay(actor)
  tickStatuses(actor)
}

export function setNextActiveUnit(state: BattleState, definition: BattleDefinition): void {
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

export function processTurnStart(state: BattleState, definition: BattleDefinition): BattleFeedEntry[] {
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

export function simulateAction(
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
  const primaryLabelKey = skill?.nameKey ?? getClassDefinition(actor).basicAttackNameKey

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
