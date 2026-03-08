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
  step: Pick<CombatPresentationStep, 'statusChanges' | 'push'>,
  context: CombatTextContext,
): string {
  const effects: string[] = []

  for (const status of step.statusChanges) {
    effects.push(`${context.t(`status.${status.statusId}`)} x${status.stacks}`)
  }

  const pushText = formatPush(step.push, context)

  if (pushText) {
    effects.push(pushText)
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

  const firstLine = `${context.t(primary.labelKey)} · ${
    primary.kind === 'heal' ? context.t('hud.heal') : context.t('hud.damage')
  }: ${primary.amount}`
  const secondLine = `${primary.relation.toUpperCase()} / H${primary.heightDelta >= 0 ? '+' : ''}${primary.heightDelta} / ${
    context.t('hud.forecast.effects')
  }: ${formatEffectSummary({ statusChanges: primary.appliedStatuses.map((status) => ({ ...status, unitId: primary.targetId })), push: primary.push }, context)}`
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
  const impact = presentation.steps.find((step) => step.kind === 'impact')
  const effects = presentation.steps.find((step) => step.kind === 'effects')
  const counter = presentation.steps.find((step) => step.kind === 'counter')
  const defeat = presentation.steps.find((step) => step.kind === 'defeat')
  const actorName = announce ? context.getUnitName(announce.actorId) : ''
  const targetName = announce?.targetId ? context.getUnitName(announce.targetId) : ''
  const parts = [`${context.t(presentation.actionLabelKey)}: ${actorName}${targetName ? ` -> ${targetName}` : ''}`]

  if (impact?.amount !== undefined && impact.valueKind) {
    parts.push(`${impact.valueKind === 'heal' ? context.t('hud.heal') : context.t('hud.damage')} ${impact.amount}`)
  }

  if (effects) {
    const effectSummary = formatEffectSummary(effects, context)

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
    case 'impact':
    case 'counter':
      return [
        `${step.valueKind === 'heal' ? context.t('hud.heal') : context.t('hud.damage')}: ${step.amount ?? 0}`,
        `${context.getUnitName(step.targetId ?? step.actorId)}`,
      ]
    case 'effects': {
      const effectSummary = formatEffectSummary(step, context)
      return [effectSummary === context.t('hud.none') ? context.t('duel.effects.none') : effectSummary]
    }
    case 'defeat':
      return step.defeat?.unitId
        ? [context.t('log.fell', { name: context.getUnitName(step.defeat.unitId) })]
        : []
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
