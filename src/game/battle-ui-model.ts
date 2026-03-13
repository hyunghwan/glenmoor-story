import type {
  BattleState,
  CombatRole,
  CombatTelegraphSummary,
  CombatResolution,
  GridPoint,
  HudActionButton,
  HudStatusChipViewModel,
  HudViewModel,
  InitiativeRailEntryViewModel,
  Team,
  UnitIconId,
} from './types'

export interface InitiativeSourceEntry {
  id: string
  name: string
  className: string
  combatRole: CombatRole
  combatRoleLabel: string
  team: Team
  unitIconId: UnitIconId
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

export interface TurnStateLabelSet {
  ready: string
  spent: string
  committed: string
}

export interface TurnStateSummaryContext {
  hasMoved: boolean
  hasActed: boolean
  move: TurnStateLabelSet
  action: TurnStateLabelSet
  overall: TurnStateLabelSet
}

export interface CommandButtonLabels {
  move: string
  attack: string
  skill: string
  wait: string
  cancel: string
}

export interface CommandButtonContext {
  interactive: boolean
  mode: HudViewModel['mode']
  canMove: boolean
  canAttack: boolean
  canSkill: boolean
  labels: CommandButtonLabels
}

interface PreviewTextContext {
  t: (key: string, params?: Record<string, string | number>) => string
}

function terrainReactionLabelKey(id: CombatTelegraphSummary['terrainReactions'][number]): string {
  switch (id) {
    case 'forest-kindling':
      return 'terrainReaction.forestKindling'
    case 'ruins-echo':
      return 'terrainReaction.ruinsEcho'
    case 'bridge-drop':
      return 'terrainReaction.bridgeDrop'
  }
}

function terrainReactionChipTone(
  id: CombatTelegraphSummary['terrainReactions'][number],
): HudStatusChipViewModel['tone'] {
  switch (id) {
    case 'forest-kindling':
      return 'accent'
    case 'ruins-echo':
      return 'ally'
    case 'bridge-drop':
      return 'enemy'
  }
}

export interface TargetPreviewStrings {
  title: string
  subtitle: string
  amountLabel: string
  counterLabel: string
  effectLabel: string
  verdictChips: HudStatusChipViewModel[]
  markerLabel: string
  markerKind: 'damage' | 'heal' | 'effect'
  markerTone: CombatTelegraphSummary['markerTone']
  telegraphSummary: CombatTelegraphSummary
}

export function buildUnitInitials(name: string): string {
  const words = name
    .trim()
    .split(/\s+/)
    .filter(Boolean)

  if (words.length >= 2) {
    return `${words[0][0] ?? ''}${words[1][0] ?? ''}`.toUpperCase()
  }

  return Array.from(name.trim()).slice(0, 2).join('').toUpperCase()
}

export function buildInitiativeEntries(
  entries: InitiativeSourceEntry[],
  nowLabel: string,
): InitiativeRailEntryViewModel[] {
  return entries.map((entry, index) => ({
    id: entry.id,
    name: entry.name,
    className: entry.className,
    combatRole: entry.combatRole,
    combatRoleLabel: entry.combatRoleLabel,
    team: entry.team,
    initials: buildUnitInitials(entry.name),
    unitIconId: entry.unitIconId,
    active: entry.active,
    selected: entry.selected,
    emphasis: entry.active ? 'active' : entry.selected ? 'selected' : 'normal',
    orderLabel: index === 0 ? nowLabel : String(index + 1),
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

export function buildTurnStateSummary(context: TurnStateSummaryContext): {
  moveStateLabel: string
  actionStateLabel: string
  turnStateLabel: string
} {
  const moveStateLabel = context.hasMoved ? context.move.spent : context.move.ready
  const actionStateLabel = context.hasActed ? context.action.spent : context.action.ready
  const turnStateLabel =
    context.hasMoved && context.hasActed ? context.overall.committed : context.overall.ready

  return {
    moveStateLabel,
    actionStateLabel,
    turnStateLabel,
  }
}

export function buildCommandButtons(context: CommandButtonContext): HudActionButton[] {
  return [
    {
      id: 'move',
      label: context.labels.move,
      disabled: !context.interactive || !context.canMove,
      active: context.mode === 'move',
    },
    {
      id: 'attack',
      label: context.labels.attack,
      disabled: !context.interactive || !context.canAttack,
      active: context.mode === 'attack',
    },
    {
      id: 'skill',
      label: context.labels.skill,
      disabled: !context.interactive || !context.canSkill,
      active: context.mode === 'skill',
    },
    {
      id: 'wait',
      label: context.labels.wait,
      disabled: !context.interactive,
      active: false,
    },
    {
      id: 'cancel',
      label: context.labels.cancel,
      disabled: !context.interactive || context.mode === 'idle',
      active: false,
    },
  ]
}

function formatEffectSummary(resolution: CombatResolution, context: PreviewTextContext): string {
  const primary = resolution.primary

  if (!primary) {
    return context.t('hud.none')
  }

  const effects: string[] = []
  const mergedStatuses = new Map<string, (typeof primary.appliedStatuses)[number]>()

  for (const status of primary.appliedStatuses) {
    mergedStatuses.set(status.statusId, status)
  }

  for (const reaction of resolution.terrainReactions) {
    for (const status of reaction.statusChanges) {
      mergedStatuses.set(status.statusId, status)
    }
  }

  for (const status of mergedStatuses.values()) {
    effects.push(`${context.t(`status.${status.statusId}`)} x${status.stacks}`)
  }

  if (primary.push?.attempted) {
    effects.push(primary.push.succeeded ? context.t('effect.push') : context.t('effect.pushBlocked'))
  }

  for (const reaction of resolution.terrainReactions) {
    effects.push(context.t(terrainReactionLabelKey(reaction.id)))
  }

  return effects.length > 0 ? effects.join(', ') : context.t('hud.none')
}

export function buildTargetPreviewSummary(resolution: CombatResolution): CombatTelegraphSummary {
  const primary = resolution.primary

  if (!primary) {
    return {
      lethal: false,
      counterRisk: 0,
      predictedStatusIds: [],
      terrainReactions: [],
      pushOutcome: 'none',
      markerTone: 'effect',
    }
  }

  const predictedStatusIds = Array.from(
    new Set([
      ...primary.appliedStatuses.map((status) => status.statusId),
      ...resolution.terrainReactions.flatMap((reaction) =>
        reaction.statusChanges.map((status) => status.statusId),
      ),
    ]),
  )
  const counterRisk = resolution.counter?.amount ?? 0
  const terrainReactions = resolution.terrainReactions.map((reaction) => reaction.id)
  const pushOutcome = !primary.push?.attempted ? 'none' : primary.push.succeeded ? 'push' : 'blocked'
  const lethal = primary.kind === 'damage' && primary.targetDefeated

  let markerTone: CombatTelegraphSummary['markerTone'] =
    primary.kind === 'heal' ? 'heal' : 'damage'

  if (lethal) {
    markerTone = 'lethal'
  } else if (counterRisk > 0) {
    markerTone = 'counter'
  } else if (predictedStatusIds.length > 0) {
    markerTone = 'status'
  } else if (primary.kind !== 'heal' && (pushOutcome !== 'none' || terrainReactions.length > 0)) {
    markerTone = 'effect'
  }

  return {
    lethal,
    counterRisk,
    predictedStatusIds,
    terrainReactions,
    pushOutcome,
    markerTone,
  }
}

export function buildTargetPreviewStrings(
  resolution: CombatResolution,
  context: PreviewTextContext,
): TargetPreviewStrings {
  const primary = resolution.primary
  const telegraphSummary = buildTargetPreviewSummary(resolution)

  if (!primary) {
    return {
      title: context.t('hud.none'),
      subtitle: context.t('hud.none'),
      amountLabel: context.t('hud.none'),
      counterLabel: `${context.t('hud.forecast.counterRisk')}: ${context.t('duel.noCounter')}`,
      effectLabel: `${context.t('hud.forecast.effects')}: ${context.t('hud.none')}`,
      verdictChips: [],
      markerLabel: 'FX',
      markerKind: 'effect',
      markerTone: telegraphSummary.markerTone,
      telegraphSummary,
    }
  }

  const terrainAmountDelta = resolution.terrainReactions.reduce(
    (total, reaction) => total + (reaction.valueKind === primary.kind ? reaction.amount ?? 0 : 0),
    0,
  )
  const amountLabel = `${
    primary.kind === 'heal' ? '+' : '-'
  }${primary.amount + terrainAmountDelta}`
  const verdictChips: HudStatusChipViewModel[] = []

  if (telegraphSummary.lethal) {
    verdictChips.push({
      id: 'verdict-lethal',
      label: context.t('hud.forecast.lethal'),
      tone: 'accent',
    })
  }

  if (telegraphSummary.counterRisk > 0) {
    verdictChips.push({
      id: 'verdict-counter',
      label: `${context.t('hud.counter')} ${telegraphSummary.counterRisk}`,
      tone: 'enemy',
    })
  }

  if (telegraphSummary.pushOutcome === 'push') {
    verdictChips.push({
      id: 'verdict-push',
      label: context.t('effect.push'),
      tone: 'accent',
    })
  } else if (telegraphSummary.pushOutcome === 'blocked') {
    verdictChips.push({
      id: 'verdict-push-blocked',
      label: context.t('effect.pushBlocked'),
      tone: 'neutral',
    })
  }

  for (const statusId of telegraphSummary.predictedStatusIds) {
    verdictChips.push({
      id: `verdict-status-${statusId}`,
      label: context.t(`status.${statusId}`),
      tone: 'ally',
    })
  }

  for (const reactionId of telegraphSummary.terrainReactions) {
    verdictChips.push({
      id: `verdict-terrain-${reactionId}`,
      label: context.t(terrainReactionLabelKey(reactionId)),
      tone: terrainReactionChipTone(reactionId),
    })
  }

  return {
    title: context.t(primary.labelKey),
    subtitle: `${primary.relation.toUpperCase()} / H${
      primary.heightDelta >= 0 ? '+' : ''
    }${primary.heightDelta}`,
    amountLabel: `${context.t(primary.kind === 'heal' ? 'hud.heal' : 'hud.damage')}: ${amountLabel}`,
    counterLabel: `${context.t('hud.forecast.counterRisk')}: ${
      resolution.counter ? resolution.counter.amount : context.t('duel.noCounter')
    }`,
    effectLabel: `${context.t('hud.forecast.effects')}: ${formatEffectSummary(resolution, context)}`,
    verdictChips,
    markerLabel: amountLabel,
    markerKind:
      telegraphSummary.markerTone === 'damage' || telegraphSummary.markerTone === 'lethal'
        ? 'damage'
        : telegraphSummary.markerTone === 'heal'
          ? 'heal'
          : 'effect',
    markerTone: telegraphSummary.markerTone,
    telegraphSummary,
  }
}

export function buildRangeTiles(
  origin: GridPoint,
  rangeMin: number,
  rangeMax: number,
  bounds: { width: number; height: number },
): GridPoint[] {
  const tiles: GridPoint[] = []

  for (let y = 0; y < bounds.height; y += 1) {
    for (let x = 0; x < bounds.width; x += 1) {
      const distance = Math.abs(origin.x - x) + Math.abs(origin.y - y)

      if (distance >= rangeMin && distance <= rangeMax) {
        tiles.push({ x, y })
      }
    }
  }

  return tiles
}
