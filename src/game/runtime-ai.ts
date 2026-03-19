import { aiProfiles, terrainDefinitions } from './content'
import type {
  ActionTarget,
  AiScoredAction,
  BattleAction,
  BattleDefinition,
  BattleState,
  CombatResolution,
  GridPoint,
  SkillDefinition,
  Team,
  UnitBlueprint,
  UnitState,
} from './types'
import {
  getBridgeDropDestinationPoint,
  getClassDefinition,
  getSkillDefinition,
  getTerrain,
  manhattan,
  pointKey,
  relationBonus,
} from './runtime-effects'
import { getReachableTilesForState } from './runtime-sim'

interface RuntimeAiContext {
  state: BattleState
  definition: BattleDefinition
  getTargetsForAction: (action: BattleAction) => ActionTarget[]
  previewAction: (action: BattleAction) => CombatResolution
  getBlueprint: (unitId: string) => UnitBlueprint
}

function getPushSkill(unit: UnitState): SkillDefinition | undefined {
  const skill = getSkillDefinition(unit)

  if (skill.targetType !== 'enemy' || !skill.effects.some((effect) => effect.type === 'push')) {
    return undefined
  }

  return skill
}

function getBridgeDropThreatTiles(context: RuntimeAiContext, actorTeam: Team): Set<string> {
  const threatened = new Set<string>()
  const opposingPushers = Object.values(context.state.units).filter(
    (unit) => unit.team !== actorTeam && !unit.defeated && getPushSkill(unit),
  )

  if (opposingPushers.length === 0) {
    return threatened
  }

  for (const row of context.state.map.tiles) {
    for (const tile of row) {
      if (tile.terrainId !== 'bridge') {
        continue
      }

      const threatenedByPusher = opposingPushers.some((unit) => {
        const skill = getPushSkill(unit)

        if (!skill) {
          return false
        }

        return getReachableTilesForState(context.state, unit.id).some((reachable) => {
          const distance = manhattan(reachable.point, tile.point)

          if (distance < skill.rangeMin || distance > skill.rangeMax) {
            return false
          }

          return Boolean(getBridgeDropDestinationPoint(context.state.map, reachable.point, tile.point))
        })
      })

      if (threatenedByPusher) {
        threatened.add(pointKey(tile.point))
      }
    }
  }

  return threatened
}

function getOffensiveReach(actor: UnitState): { min: number; max: number } {
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

function scoreEngagementPosition(
  context: RuntimeAiContext,
  actor: UnitState,
  destination: GridPoint,
  profile: typeof aiProfiles[string],
): number {
  const nearestEnemy = Object.values(context.state.units)
    .filter((unit) => unit.team !== actor.team && !unit.defeated)
    .sort((left, right) => manhattan(destination, left.position) - manhattan(destination, right.position))[0]

  if (!nearestEnemy) {
    return 0
  }

  const distance = manhattan(destination, nearestEnemy.position)
  const reach = getOffensiveReach(actor)
  const enemyReach = getOffensiveReach(nearestEnemy)

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

function scoreSupportPosition(
  context: RuntimeAiContext,
  actor: UnitState,
  destination: GridPoint,
  profile: typeof aiProfiles[string],
): number {
  const skill = getSkillDefinition(actor)

  if (skill.targetType === 'enemy') {
    return 0
  }

  const priorityAlly = Object.values(context.state.units)
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

function scorePosition(
  context: RuntimeAiContext,
  actor: UnitState,
  destination: GridPoint,
  profile: typeof aiProfiles[string],
  threatenedBridgeTiles?: Set<string>,
): number {
  const tile = getTerrain(context.state.map, destination)

  if (!tile) {
    return 0
  }

  const terrain = terrainDefinitions[tile.terrainId]
  const terrainScore = (terrain.defenseBonus + terrain.resistanceBonus + tile.height) * 8 * profile.terrainBias
  const engagementScore = scoreEngagementPosition(context, actor, destination, profile)
  const supportScore = scoreSupportPosition(context, actor, destination, profile)
  const bridgeDropRisk = actor.team === 'enemies' && threatenedBridgeTiles?.has(pointKey(destination)) ? 16 : 0

  return terrainScore + engagementScore + supportScore - bridgeDropRisk
}

function buildOffensiveCandidates(
  context: RuntimeAiContext,
  actor: UnitState,
  destination: GridPoint,
  profile: typeof aiProfiles[string],
  threatenedBridgeTiles?: Set<string>,
): AiScoredAction[] {
  const attackTargets = context.getTargetsForAction({
    actorId: actor.id,
    kind: 'attack',
    destination,
  })
  const skill = getSkillDefinition(actor)
  const skillTargets =
    skill.targetType === 'enemy'
      ? context.getTargetsForAction({
          actorId: actor.id,
          kind: 'skill',
          skillId: skill.id,
          destination,
        })
      : []

  const terrainScore = scorePosition(context, actor, destination, profile, threatenedBridgeTiles)
  const attackCandidates = attackTargets.map((target) => {
    const primary = target.forecast.primary
    const targetUnit = context.state.units[target.unitId]
    const terrainDamage = target.forecast.terrainReactions.reduce(
      (total, reaction) => total + (reaction.valueKind === 'damage' ? reaction.amount ?? 0 : 0),
      0,
    )
    const terrainReactionBonus =
      (target.forecast.terrainReactions.some((reaction) => reaction.id === 'forest-kindling') ? 12 : 0) +
      (target.forecast.terrainReactions.some((reaction) => reaction.id === 'ruins-echo') ? 12 : 0)
    const damageScore =
      (primary?.kind === 'damage' ? primary.amount + terrainDamage : terrainDamage) * 6 * profile.aggression
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
    const forecast = context.previewAction({
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
    const damageScore =
      (primary?.kind === 'damage' ? primary.amount + terrainDamage : terrainDamage) * 6 * profile.aggression
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

function buildSupportCandidates(
  context: RuntimeAiContext,
  actor: UnitState,
  destination: GridPoint,
  profile: typeof aiProfiles[string],
  threatenedBridgeTiles?: Set<string>,
): AiScoredAction[] {
  const skill = getSkillDefinition(actor)

  if (skill.targetType === 'enemy') {
    return []
  }

  return context
    .getTargetsForAction({
      actorId: actor.id,
      kind: 'skill',
      skillId: skill.id,
      destination,
    })
    .flatMap((target) => {
      const forecast = context.previewAction({
        actorId: actor.id,
        kind: 'skill',
        skillId: skill.id,
        destination,
        targetId: target.unitId,
      })
      const primary = forecast.primary
      const targetUnit = context.state.units[target.unitId]
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
      const terrainScore = scorePosition(context, actor, destination, profile, threatenedBridgeTiles)
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

export function chooseBestAction(context: RuntimeAiContext, unitId: string): AiScoredAction {
  const actor = context.state.units[unitId]

  if (!actor || actor.defeated) {
    return {
      action: { actorId: unitId, kind: 'wait' },
      breakdown: { total: 0, damage: 0, healing: 0, lethal: 0, counterRisk: 0, terrain: 0, control: 0, facing: 0 },
    }
  }

  const profile = aiProfiles[context.getBlueprint(actor.id).aiProfileId]
  const threatenedBridgeTiles = actor.team === 'enemies' ? getBridgeDropThreatTiles(context, actor.team) : undefined
  const reachable = getReachableTilesForState(context.state, actor.id)
  const candidateActions: AiScoredAction[] = []

  for (const tile of reachable) {
    candidateActions.push(...buildOffensiveCandidates(context, actor, tile.point, profile, threatenedBridgeTiles))
    candidateActions.push(...buildSupportCandidates(context, actor, tile.point, profile, threatenedBridgeTiles))
  }

  if (candidateActions.length === 0) {
    const idleDestination = reachable
      .slice()
      .sort(
        (left, right) =>
          scorePosition(context, actor, right.point, profile, threatenedBridgeTiles) -
          scorePosition(context, actor, left.point, profile, threatenedBridgeTiles),
      )[0]?.point

    return {
      action: { actorId: actor.id, kind: 'wait', destination: idleDestination },
      breakdown: {
        total: idleDestination ? scorePosition(context, actor, idleDestination, profile, threatenedBridgeTiles) : 0,
        damage: 0,
        healing: 0,
        lethal: 0,
        counterRisk: 0,
        terrain: idleDestination ? scorePosition(context, actor, idleDestination, profile, threatenedBridgeTiles) : 0,
        control: 0,
        facing: 0,
      },
    }
  }

  candidateActions.sort((left, right) => right.breakdown.total - left.breakdown.total)
  return candidateActions[0]
}
