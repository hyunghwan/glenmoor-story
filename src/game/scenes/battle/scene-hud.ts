import { MAX_BATTLE_ZOOM, MIN_BATTLE_ZOOM } from '../../battle-camera'
import {
  buildCommandButtons,
  buildTargetPreviewStrings,
  buildTurnStateSummary,
  buildUnitInitials,
} from '../../battle-ui-model'
import {
  classDefinitions,
  statusDefinitions,
  terrainDefinitions,
} from '../../content'
import type {
  AccessibleBattleOptionViewModel,
  ActionTarget,
  ActiveUnitPanelViewModel,
  BattleObjectivePhaseDefinition,
  GridPoint,
  HudAnchor,
  HudClientPoint,
  HudViewModel,
  MobileHudPresentationViewModel,
  UnitIconId,
  UnitState,
  ViewControlButtonViewModel,
  ViewportProfile,
} from '../../types'

export interface SceneCombatTextContext {
  t: (key: string, params?: Record<string, string | number>) => string
  getUnitName: (unitId: string) => string
}

export interface ResolvedUnitPresentation {
  className: string
  combatRole: ActiveUnitPanelViewModel['combatRole']
  combatRoleLabel: string
  roleFlavorLabel: string
  unitIconId: UnitIconId
}

export interface BuildActionMenuModelArgs {
  t: (key: string, params?: Record<string, string | number>) => string
  layoutMode: ViewportProfile['layoutMode']
  mode: HudViewModel['mode']
  interactive: boolean
  anchor?: HudAnchor
  canMove: boolean
  canAttack: boolean
  canSkill: boolean
  avoidClientPoints: HudClientPoint[]
}

export interface BuildTargetMarkersModelArgs {
  targetOptions: ActionTarget[]
  hoveredUnitId?: string
  getUnitById: (unitId: string) => UnitState | undefined
  buildAnchor: (unit: UnitState) => HudAnchor | undefined
  combatText: SceneCombatTextContext
}

export interface BuildTargetDetailModelArgs {
  t: (key: string, params?: Record<string, string | number>) => string
  hoveredUnit: UnitState
  target: ActionTarget
  presentation: 'anchored' | 'sheet'
  anchor?: HudAnchor
  combatText: SceneCombatTextContext
}

export interface BuildViewControlsModelArgs {
  t: (key: string, params?: Record<string, string | number>) => string
  zoom: number
  panModeActive: boolean
  layoutMode: ViewportProfile['layoutMode']
  phase: HudViewModel['phase']
}

export interface BuildAccessibleOptionsModelArgs {
  t: (key: string, params?: Record<string, string | number>) => string
  mode: HudViewModel['mode']
  reachableTiles: Array<{ point: GridPoint; cost: number }>
  targetOptions: ActionTarget[]
  mapTiles: ReadonlyArray<ReadonlyArray<{ terrainId: keyof typeof terrainDefinitions } | undefined>>
  getUnitById: (unitId: string) => UnitState | undefined
  combatText: SceneCombatTextContext
}

export interface BuildAccessiblePanelModelArgs {
  t: (key: string, params?: Record<string, string | number>) => string
  active: UnitState
  objectiveKey: string
  latestMessage: string
  commandButtons: HudViewModel['accessiblePanel']['commandButtons']
  options: AccessibleBattleOptionViewModel[]
  mode: HudViewModel['mode']
  modal?: HudViewModel['modal']
  phaseAnnouncementKey?: string
}

export interface ResolveMobileHudPresentationArgs {
  layoutMode: ViewportProfile['layoutMode']
  viewportWidth: number
  mode: HudViewModel['mode']
  hasActionMenu: boolean
  hasTargetDetail: boolean
}

const PHONE_PORTRAIT_COMMAND_DENSITY_MAX_WIDTH = 430

export interface BuildModalModelArgs {
  t: (key: string, params?: Record<string, string | number>) => string
  kind: 'briefing' | 'victory' | 'defeat'
  titleKey: string
  briefingKey: string
  victoryKey: string
  defeatKey: string
  objectiveKey: string
  objectivePhaseLabel: string
}

export function createCombatTextContext(args: {
  t: SceneCombatTextContext['t']
  getUnitName: SceneCombatTextContext['getUnitName']
}): SceneCombatTextContext {
  return {
    t: args.t,
    getUnitName: args.getUnitName,
  }
}

export function resolveUnitPresentation(
  t: SceneCombatTextContext['t'],
  unit: Pick<UnitState, 'classId'>,
): ResolvedUnitPresentation {
  const classDefinition = classDefinitions[unit.classId]

  return {
    className: t(classDefinition.nameKey),
    combatRole: classDefinition.combatRole,
    combatRoleLabel: t(`combatRole.${classDefinition.combatRole}`),
    roleFlavorLabel: t(classDefinition.roleKey),
    unitIconId: classDefinition.unitIconId,
  }
}

export function buildActiveUnitPanelModel(args: {
  t: SceneCombatTextContext['t']
  unit: UnitState
}): HudViewModel['activeUnitPanel'] {
  const presentation = resolveUnitPresentation(args.t, args.unit)
  const turnState = buildTurnStateSummary({
    hasMoved: args.unit.hasMovedThisTurn,
    hasActed: args.unit.hasActedThisTurn,
    move: {
      ready: args.t('hud.turn.moveReady'),
      spent: args.t('hud.turn.moveSpent'),
      committed: args.t('hud.turn.commit'),
    },
    action: {
      ready: args.t('hud.turn.actionReady'),
      spent: args.t('hud.turn.actionSpent'),
      committed: args.t('hud.turn.commit'),
    },
    overall: {
      ready: args.t('hud.turn.ready'),
      spent: args.t('hud.turn.commit'),
      committed: args.t('hud.turn.commit'),
    },
  })

  return {
    id: args.unit.id,
    name: args.t(args.unit.nameKey),
    className: presentation.className,
    combatRole: presentation.combatRole,
    combatRoleLabel: presentation.combatRoleLabel,
    roleFlavorLabel: presentation.roleFlavorLabel,
    team: args.unit.team,
    teamLabel: args.t(`hud.team.${args.unit.team}`),
    initials: buildUnitInitials(args.t(args.unit.nameKey)),
    unitIconId: presentation.unitIconId,
    hp: args.unit.hp,
    maxHp: classDefinitions[args.unit.classId].stats.maxHp,
    hpRatio: args.unit.hp / classDefinitions[args.unit.classId].stats.maxHp,
    position: args.unit.position,
    positionLabel: `${args.unit.position.x}, ${args.unit.position.y}`,
    facing: args.unit.facing,
    statuses:
      args.unit.statuses.length > 0
        ? args.unit.statuses.map((status) => ({
            id: status.id,
            label: args.t(statusDefinitions[status.id].labelKey),
            stacks: status.stacks,
            tone: args.unit.team === 'allies' ? 'ally' : 'enemy',
          }))
        : [
            {
              id: 'stable',
              label: args.t('duel.statusStable'),
              tone: 'neutral',
            },
          ],
    moveStateLabel: turnState.moveStateLabel,
    actionStateLabel: turnState.actionStateLabel,
    turnStateLabel: turnState.turnStateLabel,
  }
}

export function buildActionMenuModel(
  args: BuildActionMenuModelArgs,
): HudViewModel['actionMenu'] {
  if (!args.interactive) {
    return undefined
  }

  const presentation = args.layoutMode === 'desktop' ? 'anchored' : 'dock'

  if (presentation === 'anchored' && !args.anchor) {
    return undefined
  }

  return {
    label: args.t('hud.commands'),
    presentation,
    anchor: presentation === 'anchored' ? args.anchor : undefined,
    buttons: buildCommandButtons({
      interactive: args.interactive,
      mode: args.mode,
      canMove: args.canMove,
      canAttack: args.canAttack,
      canSkill: args.canSkill,
      labels: {
        move: args.t('hud.action.move'),
        attack: args.t('hud.action.attack'),
        skill: args.t('hud.action.skill'),
        wait: args.t('hud.action.wait'),
        cancel: args.t('hud.action.cancel'),
      },
      shortLabels: {
        move: args.t('hud.action.move'),
        attack: args.t('hud.action.attackShort'),
        skill: args.t('hud.action.skill'),
        wait: args.t('hud.action.wait'),
        cancel: args.t('hud.action.back'),
      },
    }),
    avoidClientPoints: presentation === 'anchored' ? args.avoidClientPoints : [],
  }
}

export function buildTargetMarkersModel(
  args: BuildTargetMarkersModelArgs,
): HudViewModel['targetMarkers'] {
  return args.targetOptions.flatMap((option) => {
    const unit = args.getUnitById(option.unitId)

    if (!unit) {
      return []
    }

    const anchor = args.buildAnchor(unit)

    if (!anchor) {
      return []
    }

    const preview = buildTargetPreviewStrings(option.forecast, args.combatText)

    return [
      {
        unitId: unit.id,
        team: unit.team,
        anchor,
        amountLabel: preview.markerLabel,
        amountKind: preview.markerKind,
        markerTone: preview.markerTone,
        emphasis: unit.id === args.hoveredUnitId,
      },
    ]
  })
}

export function resolveTargetDetailPlacement(
  activePoint: GridPoint,
  targetPoint: GridPoint,
): HudAnchor['preferredPlacement'] {
  if (targetPoint.x > activePoint.x) {
    return 'above-right'
  }

  if (targetPoint.x < activePoint.x) {
    return 'above-left'
  }

  return 'above-left'
}

export function buildTargetDetailModel(
  args: BuildTargetDetailModelArgs,
): HudViewModel['targetDetail'] {
  if (args.presentation === 'anchored' && !args.anchor) {
    return undefined
  }

  const preview = buildTargetPreviewStrings(args.target.forecast, args.combatText)
  const unitPresentation = resolveUnitPresentation(args.t, args.hoveredUnit)

  return {
    unitId: args.hoveredUnit.id,
    presentation: args.presentation,
    anchor: args.presentation === 'anchored' ? args.anchor : undefined,
    unitName: args.t(args.hoveredUnit.nameKey),
    className: unitPresentation.className,
    combatRole: unitPresentation.combatRole,
    combatRoleLabel: unitPresentation.combatRoleLabel,
    teamLabel: args.t(`hud.team.${args.hoveredUnit.team}`),
    unitIconId: unitPresentation.unitIconId,
    title: preview.title,
    subtitle: preview.subtitle,
    amountLabel: preview.amountLabel,
    counterLabel: preview.counterLabel,
    effectLabel: preview.effectLabel,
    verdictChips: preview.verdictChips,
    telegraphSummary: preview.telegraphSummary,
  }
}

export function resolveMobileHudPresentation(
  args: ResolveMobileHudPresentationArgs,
): MobileHudPresentationViewModel | undefined {
  if (args.layoutMode === 'desktop') {
    return undefined
  }

  const actionDockVisible = args.hasActionMenu
  const targetDetailMode = args.hasTargetDetail ? 'detail' : 'summary'
  const commandDensity =
    args.layoutMode === 'mobile-portrait' && args.viewportWidth <= PHONE_PORTRAIT_COMMAND_DENSITY_MAX_WIDTH
      ? 'compact-2row'
      : 'default'

  return {
    panelState: 'collapsed',
    actionDockVisible,
    initiativeMode: 'compact',
    commandDensity,
    overflowOpen: false,
    objectiveExpanded: false,
    targetDetailMode,
  }
}

export function buildViewControlsModel(
  args: BuildViewControlsModelArgs,
): HudViewModel['viewControls'] {
  const buttons: ViewControlButtonViewModel[] = [
    {
      id: 'view-rotate-left',
      label: args.t('hud.action.rotateLeft'),
      icon: 'rotate_left',
      disabled: false,
      active: false,
    },
    {
      id: 'view-rotate-right',
      label: args.t('hud.action.rotateRight'),
      icon: 'rotate_right',
      disabled: false,
      active: false,
    },
    {
      id: 'view-zoom-in',
      label: args.t('hud.action.zoomIn'),
      icon: 'zoom_in',
      disabled: args.zoom >= MAX_BATTLE_ZOOM,
      active: false,
    },
    {
      id: 'view-zoom-out',
      label: args.t('hud.action.zoomOut'),
      icon: 'zoom_out',
      disabled: args.zoom <= MIN_BATTLE_ZOOM,
      active: false,
    },
    {
      id: 'view-recenter',
      label: args.t('hud.action.recenter'),
      icon: 'my_location',
      disabled: false,
      active: false,
    },
  ]

  if (args.layoutMode === 'desktop') {
    buttons.push({
      id: 'view-pan-toggle',
      label: args.t('hud.action.pan'),
      icon: 'open_with',
      disabled: false,
      active: args.panModeActive,
    })
  }

  if (args.phase === 'active') {
    buttons.push({
      id: 'restart-battle',
      label: args.t('hud.playAgain'),
      icon: 'replay',
      disabled: false,
      active: false,
    })
  }

  return {
    label: args.t('hud.view'),
    buttons,
  }
}

export function buildAccessibleOptionsModel(
  args: BuildAccessibleOptionsModelArgs,
): HudViewModel['accessiblePanel']['options'] {
  if (args.mode === 'move') {
    return args.reachableTiles.map((tile) => {
      const mapTile = args.mapTiles[tile.point.y]?.[tile.point.x]
      const terrainLabel = mapTile
        ? args.t(terrainDefinitions[mapTile.terrainId].labelKey)
        : args.t('hud.none')

      return {
        id: `tile-${tile.point.x}-${tile.point.y}`,
        label: `${args.t('a11y.tile')} ${tile.point.x}, ${tile.point.y}`,
        detail: `${terrainLabel} · ${args.t('a11y.cost')} ${tile.cost}`,
        command: `accessible:tile:${tile.point.x}:${tile.point.y}`,
        kind: 'tile',
      }
    })
  }

  if (args.mode === 'attack' || args.mode === 'skill') {
    return args.targetOptions.map((option) => {
      const unit = args.getUnitById(option.unitId)
      const preview = buildTargetPreviewStrings(option.forecast, args.combatText)

      return {
        id: `target-${option.unitId}`,
        label: unit ? args.t(unit.nameKey) : option.unitId,
        detail: [preview.amountLabel, preview.counterLabel, preview.effectLabel]
          .filter(Boolean)
          .join(' · '),
        command: `accessible:target:${option.unitId}`,
        kind: 'target',
      }
    })
  }

  return []
}

export function buildAccessiblePanelModel(
  args: BuildAccessiblePanelModelArgs,
): HudViewModel['accessiblePanel'] {
  const liveMessage = args.modal
    ? `${args.modal.title}. ${args.modal.objectiveLabel}`
    : args.phaseAnnouncementKey
      ? args.t(args.phaseAnnouncementKey)
      : args.latestMessage

  return {
    label: args.t('a11y.panel'),
    summaryHeading: args.t('a11y.summary'),
    summary: [
      `${args.t('hud.activeUnit')}: ${args.t(args.active.nameKey)}`,
      `${args.t(`hud.team.${args.active.team}`)} · ${args.t(classDefinitions[args.active.classId].nameKey)}`,
      `HP ${args.active.hp}/${classDefinitions[args.active.classId].stats.maxHp}`,
      `${args.t('hud.objective')}: ${args.t(args.objectiveKey)}`,
    ].join(' • '),
    commandsHeading: args.t('a11y.commands'),
    commandButtons: args.commandButtons,
    optionsHeading:
      args.mode === 'move'
        ? args.t('a11y.reachableTiles')
        : args.mode === 'attack' || args.mode === 'skill'
          ? args.t('a11y.targets')
          : args.t('a11y.noOptions'),
    options: args.options,
    liveMessage,
  }
}

export function buildModalModel(args: BuildModalModelArgs): HudViewModel['modal'] {
  if (args.kind === 'briefing') {
    return {
      kind: args.kind,
      eyebrow: args.t('hud.phase.briefing'),
      title: args.t(args.titleKey),
      body: args.t(args.briefingKey),
      phaseLabel: args.objectivePhaseLabel,
      objectiveHeading: args.t('hud.modal.startingObjective'),
      objectiveLabel: args.t(args.objectiveKey),
      buttonLabel: args.t('hud.startBattle'),
    }
  }

  return {
    kind: args.kind,
    eyebrow: args.t(`hud.phase.${args.kind}`),
    title: args.t(args.titleKey),
    body: args.kind === 'victory' ? args.t(args.victoryKey) : args.t(args.defeatKey),
    phaseLabel: args.objectivePhaseLabel,
    objectiveHeading: args.t('hud.modal.finalObjective'),
    objectiveLabel: args.t(args.objectiveKey),
    buttonLabel: args.t('hud.playAgain'),
  }
}

export function buildObjectivePhaseProgressLabel(args: {
  t: SceneCombatTextContext['t']
  phases: BattleObjectivePhaseDefinition[]
  activePhaseId: string
}): string {
  if (args.phases.length <= 1) {
    return ''
  }

  const currentIndex = Math.max(
    0,
    args.phases.findIndex((phase) => phase.id === args.activePhaseId),
  )

  return args.t('hud.phaseObjective', {
    current: currentIndex + 1,
    total: args.phases.length,
  })
}
