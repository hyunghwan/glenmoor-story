import type {
  BattleFeedEntry,
  CombatPresentation,
  CombatPresentationStep,
  CombatResolution,
  PushResult,
} from './types'

interface CombatTextContext {
  t: (key: string, params?: Record<string, string | number>) => string
  getUnitName: (unitId: string) => string
}

function terrainReactionLabelKey(id: string): string {
  switch (id) {
    case 'forest-kindling':
      return 'terrainReaction.forestKindling'
    case 'ruins-echo':
      return 'terrainReaction.ruinsEcho'
    case 'bridge-drop':
      return 'terrainReaction.bridgeDrop'
    default:
      return id
  }
}

function formatPush(push: PushResult | undefined, context: CombatTextContext): string | undefined {
  if (!push?.attempted) {
    return undefined
  }

  if (push.succeeded) {
    return context.t('effect.push')
  }

  return context.t('effect.pushBlocked')
}

function formatEffectSummary(
  step: Pick<CombatPresentationStep, 'statusChanges' | 'push' | 'terrainReaction'>,
  context: CombatTextContext,
): string {
  const effects: string[] = []
  const mergedStatuses = new Map<string, CombatPresentationStep['statusChanges'][number]>()

  for (const status of step.statusChanges) {
    mergedStatuses.set(status.statusId, status)
  }

  for (const status of mergedStatuses.values()) {
    effects.push(`${context.t(`status.${status.statusId}`)} x${status.stacks}`)
  }

  const pushText = formatPush(step.push, context)

  if (pushText) {
    effects.push(pushText)
  }

  if (step.terrainReaction) {
    effects.push(context.t(terrainReactionLabelKey(step.terrainReaction)))
  }

  return effects.length > 0 ? effects.join(', ') : context.t('hud.none')
}

export function buildCombatForecastLines(
  resolution: CombatResolution,
  context: CombatTextContext,
): string[] {
  const primary = resolution.primary

  if (!primary) {
    return [context.t('hud.none')]
  }

  const reactionAmount = resolution.terrainReactions.reduce(
    (total, reaction) => total + (reaction.valueKind === primary.kind ? reaction.amount ?? 0 : 0),
    0,
  )

  const firstLine = `${context.t(primary.labelKey)} · ${
    primary.kind === 'heal' ? context.t('hud.heal') : context.t('hud.damage')
  }: ${primary.amount + reactionAmount}`
  const secondLine = `${primary.relation.toUpperCase()} / H${primary.heightDelta >= 0 ? '+' : ''}${primary.heightDelta} / ${
    context.t('hud.forecast.effects')
  }: ${formatEffectSummary({
    statusChanges: [
      ...primary.appliedStatuses.map((status) => ({ ...status, unitId: primary.targetId })),
      ...resolution.terrainReactions.flatMap((reaction) =>
        reaction.statusChanges.map((status) => ({ ...status, unitId: reaction.unitId })),
      ),
    ],
    push: primary.push,
    terrainReaction: resolution.terrainReactions[0]?.id,
  }, context)}`
  const thirdLine = `${context.t('hud.forecast.counterRisk')}: ${
    resolution.counter ? resolution.counter.amount : context.t('duel.noCounter')
  }`

  return [firstLine, secondLine, thirdLine]
}

export function buildCombatFeedLine(
  presentation: CombatPresentation,
  context: CombatTextContext,
): string {
  const announce = presentation.steps.find((step) => step.kind === 'announce')
  const hit = presentation.steps.find((step) => step.kind === 'hit')
  const status = presentation.steps.find((step) => step.kind === 'status')
  const push = presentation.steps.find((step) => step.kind === 'push')
  const terrain = presentation.steps.find((step) => step.kind === 'terrain')
  const counter = presentation.steps.find((step) => step.kind === 'counter')
  const defeat = presentation.steps.find((step) => step.kind === 'defeat')
  const actorName = announce ? context.getUnitName(announce.actorId) : ''
  const targetName = announce?.targetId ? context.getUnitName(announce.targetId) : ''
  const parts = [`${context.t(presentation.actionLabelKey)}: ${actorName}${targetName ? ` -> ${targetName}` : ''}`]

  if (hit?.amount !== undefined && hit.valueKind) {
    parts.push(`${hit.valueKind === 'heal' ? context.t('hud.heal') : context.t('hud.damage')} ${hit.amount}`)
  }

  if (status || push) {
    const effectSummary = formatEffectSummary(
      {
        statusChanges: [
          ...(status?.statusChanges ?? []),
          ...(terrain?.statusChanges ?? []),
        ],
        push: push?.push,
        terrainReaction: terrain?.terrainReaction,
      },
      context,
    )

    if (effectSummary !== context.t('hud.none')) {
      parts.push(effectSummary)
    }
  }

  if (counter?.amount !== undefined) {
    parts.push(`${context.t('duel.counter')} ${counter.amount}`)
  }

  if (defeat?.defeat?.unitId) {
    parts.push(context.t('log.fell', { name: context.getUnitName(defeat.defeat.unitId) }))
  }

  return parts.join(' · ')
}

export function buildCombatStepLines(
  step: CombatPresentationStep,
  context: CombatTextContext,
): string[] {
  switch (step.kind) {
    case 'announce':
      return [
        `${context.getUnitName(step.actorId)}${step.targetId ? ` -> ${context.getUnitName(step.targetId)}` : ''}`,
      ]
    case 'cast':
      return [context.t(step.labelKey)]
    case 'projectile':
      return [context.t(step.labelKey), context.getUnitName(step.targetId ?? step.actorId)]
    case 'hit':
    case 'counter':
      return [
        `${step.valueKind === 'heal' ? context.t('hud.heal') : context.t('hud.damage')}: ${step.amount ?? 0}`,
        `${context.getUnitName(step.targetId ?? step.actorId)}`,
      ]
    case 'status':
    case 'push': {
      const effectSummary = formatEffectSummary(step, context)
      return [effectSummary === context.t('hud.none') ? context.t('duel.effects.none') : effectSummary]
    }
    case 'terrain': {
      const parts = [context.t(step.labelKey)]
      const effectSummary = formatEffectSummary({ ...step, terrainReaction: undefined }, context)

      if (step.amount !== undefined && step.valueKind) {
        parts.push(`${step.valueKind === 'heal' ? context.t('hud.heal') : context.t('hud.damage')}: ${step.amount}`)
      }

      if (effectSummary !== context.t('hud.none')) {
        parts.push(effectSummary)
      }

      if (step.defeat?.unitId) {
        parts.push(context.t('log.fell', { name: context.getUnitName(step.defeat.unitId) }))
      }

      return parts
    }
    case 'defeat':
      return step.defeat?.unitId
        ? [context.t('log.fell', { name: context.getUnitName(step.defeat.unitId) })]
        : []
    case 'recover':
      return [context.t(step.labelKey)]
  }
}

export function formatBattleFeedEntry(
  entry: BattleFeedEntry,
  context: CombatTextContext,
): string {
  switch (entry.kind) {
    case 'turn':
      return context.t('log.turn', { name: context.getUnitName(entry.unitId) })
    case 'move':
      return context.t('log.move', { name: context.getUnitName(entry.unitId) })
    case 'wait':
      return context.t('log.wait', { name: context.getUnitName(entry.unitId) })
    case 'fell':
      return context.t('log.fell', { name: context.getUnitName(entry.unitId) })
    case 'burn':
      return `${context.t('status.burning')}: ${context.getUnitName(entry.unitId)} -${entry.amount}`
    case 'presentation':
      return buildCombatFeedLine(entry.presentation, context)
  }
}
