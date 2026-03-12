export type Locale = 'en' | 'ko'

export type Team = 'allies' | 'enemies'

export type Direction = 'north' | 'east' | 'south' | 'west'

export type FacingRelation = 'front' | 'side' | 'back'

export type TerrainKey =
  | 'grass'
  | 'road'
  | 'forest'
  | 'water'
  | 'stone'
  | 'bridge'
  | 'ruins'

export type StatusKey = 'burning' | 'guardBreak' | 'warded' | 'slow'

export type TerrainReactionId = 'forest-kindling' | 'ruins-echo' | 'bridge-drop'

export type ActionKind = 'attack' | 'skill' | 'wait'

export type SkillTargetType = 'enemy' | 'ally' | 'self'

export type AttackFlavor = 'power' | 'magic'

export type TelegraphStyle = 'attack' | 'skill' | 'support' | 'status' | 'move' | 'counter'

export type ImpactWeight = 'light' | 'medium' | 'heavy' | 'finisher'

export type PresentationTone =
  | 'steel'
  | 'ember'
  | 'ward'
  | 'shadow'
  | 'wind'
  | 'radiant'
  | 'hazard'
  | 'neutral'

export type CameraCue =
  | 'none'
  | 'impact-light'
  | 'impact-heavy'
  | 'support-pulse'
  | 'counter-jolt'
  | 'defeat-drop'

export type MatterProfile =
  | 'slash-spark'
  | 'shock-ring'
  | 'arrow-streak'
  | 'ember-plume'
  | 'light-shards'
  | 'dash-burst'
  | 'ward-orbit'
  | 'slow-haze'
  | 'guard-fragments'
  | 'magic-bolt'

export interface PresentationProfile {
  fxCueId: string
  sfxCueId: string
  telegraphStyle: TelegraphStyle
  impactWeight: ImpactWeight
  castMs: number
  impactMs: number
  hitStopMs: number
  lingerMs: number
  cameraCue: CameraCue
  matterProfile: MatterProfile
  tone: PresentationTone
}

export interface CombatImpulseProfile {
  intensity: number
  spread: number
  fragmentCount: number
  speed: number
  lifetimeMs: number
}

export interface GridPoint {
  x: number
  y: number
}

export interface Stats {
  maxHp: number
  power: number
  magic: number
  defense: number
  resistance: number
  speed: number
  move: number
  maxClimb: number
}

export interface TerrainDefinition {
  id: TerrainKey
  labelKey: string
  moveCost: number
  passable: boolean
  defenseBonus: number
  resistanceBonus: number
  tint: number
  sideTint: number
  overlayTint: number
}

export interface StatusDefinition {
  id: StatusKey
  labelKey: string
  descriptionKey: string
  maxStacks: number
  presentation: PresentationProfile
}

export interface StatusInstance {
  id: StatusKey
  stacks: number
  duration: number
}

export interface SkillEffectDamage {
  type: 'damage'
  amount: number
  flavor: AttackFlavor
}

export interface SkillEffectHeal {
  type: 'heal'
  amount: number
}

export interface SkillEffectStatus {
  type: 'status'
  statusId: StatusKey
  stacks: number
  duration: number
}

export interface SkillEffectPush {
  type: 'push'
  distance: number
}

export type SkillEffect =
  | SkillEffectDamage
  | SkillEffectHeal
  | SkillEffectStatus
  | SkillEffectPush

export interface SkillDefinition {
  id: string
  nameKey: string
  descriptionKey: string
  targetType: SkillTargetType
  rangeMin: number
  rangeMax: number
  effects: SkillEffect[]
  counterable: boolean
  presentation: PresentationProfile
}

export interface ClassDefinition {
  id: string
  nameKey: string
  roleKey: string
  basicAttackNameKey: string
  basicAttackPresentationId: string
  basicAttackFlavor: AttackFlavor
  basicAttackPower: number
  basicAttackRangeMin: number
  basicAttackRangeMax: number
  signatureSkillId: string
  stats: Stats
}

export interface AIProfile {
  id: string
  aggression: number
  support: number
  riskTolerance: number
  terrainBias: number
  controlBias: number
}

export interface UnitBlueprint {
  id: string
  nameKey: string
  classId: string
  team: Team
  position: GridPoint
  aiProfileId: string
  startingHp?: number
}

export interface UnitState {
  id: string
  nameKey: string
  classId: string
  team: Team
  position: GridPoint
  facing: Direction
  hp: number
  statuses: StatusInstance[]
  nextActAt: number
  hasMovedThisTurn: boolean
  hasActedThisTurn: boolean
  defeated: boolean
}

export interface TiledLayer {
  name: string
  type: string
  width: number
  height: number
  data: number[]
}

export interface TiledMapData {
  type: string
  orientation: string
  width: number
  height: number
  tilewidth: number
  tileheight: number
  layers: TiledLayer[]
}

export interface MapTile {
  point: GridPoint
  terrainId: TerrainKey
  height: number
}

export interface BattleMapData {
  id: string
  width: number
  height: number
  tileWidth: number
  tileHeight: number
  tiles: MapTile[][]
}

export interface BattleDefinition {
  id: string
  titleKey: string
  objectiveKey: string
  briefingKey: string
  victoryKey: string
  defeatKey: string
  mapId: string
  allies: UnitBlueprint[]
  enemies: UnitBlueprint[]
  objectivePhases?: BattleObjectivePhaseDefinition[]
  events?: BattleScriptedEvent[]
}

export type BattleObjectiveCondition =
  | {
      type: 'eliminate-team'
      team: Team
    }
  | {
      type: 'defeat-unit'
      unitId: string
    }
  | {
      type: 'turn-at-least'
      turnIndex: number
    }

export interface BattleObjectivePhaseDefinition {
  id: string
  objectiveKey: string
  briefingKey?: string
  victoryKey?: string
  defeatKey?: string
  announcementKey?: string
  announcementCueId?: string
  victoryConditions: BattleObjectiveCondition[]
  defeatConditions?: BattleObjectiveCondition[]
}

export type BattleEventTrigger =
  | {
      type: 'battle-start'
      objectivePhaseId?: string
    }
  | {
      type: 'turn-start'
      turnIndex?: number
      team?: Team
      unitId?: string
      objectivePhaseId?: string
    }
  | {
      type: 'unit-defeated'
      team?: Team
      unitId?: string
      objectivePhaseId?: string
    }

export type BattleEventEffect =
  | {
      type: 'set-objective-phase'
      objectivePhaseId: string
    }
  | {
      type: 'deploy-unit'
      unit: UnitBlueprint
      facing?: Direction
      nextActAt?: number
    }

export interface BattleScriptedEvent {
  id: string
  once?: boolean
  trigger: BattleEventTrigger
  effects: BattleEventEffect[]
}

export interface BattleState {
  definitionId: string
  map: BattleMapData
  units: Record<string, UnitState>
  activeUnitId: string
  turnIndex: number
  phase: 'briefing' | 'active' | 'victory' | 'defeat'
  objectivePhaseId: string
  objectiveKey: string
  briefingKey: string
  victoryKey: string
  defeatKey: string
  resolvedEventIds: string[]
  messages: BattleFeedEntry[]
}

export interface BattleAction {
  actorId: string
  kind: ActionKind
  skillId?: string
  destination?: GridPoint
  targetId?: string
}

export interface AppliedStatusResult {
  statusId: StatusKey
  stacks: number
  duration: number
}

export interface PushResult {
  attempted: boolean
  succeeded: boolean
  blockedReason?: 'edge' | 'occupied' | 'height'
  destination?: GridPoint
}

export interface CombatPresentationUnitSnapshot {
  unitId: string
  hpBefore: number
  hpAfter: number
  statusesBefore: StatusInstance[]
  statusesAfter: StatusInstance[]
  positionBefore: GridPoint
  positionAfter: GridPoint
}

export interface CombatPresentationStatusChange extends AppliedStatusResult {
  unitId: string
}

export interface TerrainReactionResult {
  id: TerrainReactionId
  unitId: string
  terrainId: TerrainKey
  amount?: number
  valueKind?: 'damage' | 'heal'
  statusChanges: AppliedStatusResult[]
  defeat?: {
    unitId: string
  }
}

export interface CombatPresentationStep {
  kind: 'announce' | 'cast' | 'projectile' | 'hit' | 'status' | 'push' | 'terrain' | 'counter' | 'defeat' | 'recover'
  actorId: string
  targetId?: string
  labelKey: string
  fxCueId: string
  sfxCueId: string
  impactWeight: ImpactWeight
  hitStopMs: number
  sourcePoint: GridPoint
  targetPoint: GridPoint
  amount?: number
  valueKind?: 'damage' | 'heal'
  cameraCue?: CameraCue
  impulseProfile?: CombatImpulseProfile
  statusChanges: CombatPresentationStatusChange[]
  terrainReaction?: TerrainReactionId
  push?: PushResult
  defeat?: {
    unitId: string
  }
  durationMs: number
}

export interface CombatPresentation {
  actionLabelKey: string
  units: CombatPresentationUnitSnapshot[]
  steps: CombatPresentationStep[]
}

export interface DuelTelemetry {
  active: boolean
  stepIndex: number
  stepCount: number
  actionLabel: string
  fastMode: boolean
  stepKind?: CombatPresentationStep['kind']
  fxCueId?: string
  targetUnitId?: string
}

export interface ExchangeOutcome {
  sourceId: string
  targetId: string
  labelKey: string
  amount: number
  kind: 'damage' | 'heal'
  flavor: AttackFlavor | 'support'
  relation: FacingRelation
  heightDelta: number
  terrainBonus: number
  appliedStatuses: AppliedStatusResult[]
  push?: PushResult
  targetDefeated: boolean
}

export interface CombatResolution {
  action: BattleAction
  actorAfterMove: GridPoint
  primary?: ExchangeOutcome
  terrainReactions: TerrainReactionResult[]
  counter?: ExchangeOutcome
  startTurnMessages: BattleFeedEntry[]
  messages: BattleFeedEntry[]
  presentation?: CombatPresentation
  state: BattleState
}

export type BattleFeedEntry =
  | { kind: 'turn'; unitId: string }
  | { kind: 'move'; unitId: string }
  | { kind: 'wait'; unitId: string }
  | { kind: 'fell'; unitId: string }
  | { kind: 'burn'; unitId: string; amount: number }
  | { kind: 'presentation'; presentation: CombatPresentation }

export interface ReachableTile {
  point: GridPoint
  path: GridPoint[]
  cost: number
}

export interface ActionTarget {
  unitId: string
  point: GridPoint
  forecast: CombatResolution
}

export interface ScoreBreakdown {
  total: number
  damage: number
  healing: number
  lethal: number
  counterRisk: number
  terrain: number
  control: number
  facing: number
}

export interface CombatTelegraphSummary {
  lethal: boolean
  counterRisk: number
  predictedStatusIds: StatusKey[]
  terrainReactions: TerrainReactionId[]
  pushOutcome: 'none' | 'push' | 'blocked'
  markerTone: 'damage' | 'heal' | 'effect' | 'lethal' | 'counter' | 'status'
}

export interface AiScoredAction {
  action: BattleAction
  forecast?: CombatResolution
  breakdown: ScoreBreakdown
}

export interface HudActionButton {
  id: string
  label: string
  disabled: boolean
  active: boolean
}

export type HudPlacement =
  | 'above'
  | 'above-right'
  | 'right'
  | 'below-right'
  | 'below'
  | 'below-left'
  | 'left'
  | 'above-left'

export interface HudAnchor {
  clientX: number
  clientY: number
  preferredPlacement: HudPlacement
}

export interface HudClientPoint {
  clientX: number
  clientY: number
}

export interface HudStatusChipViewModel {
  id: string
  label: string
  stacks?: number
  tone: 'neutral' | 'accent' | 'ally' | 'enemy'
}

export interface ActiveUnitPanelViewModel {
  id: string
  name: string
  className: string
  team: Team
  teamLabel: string
  initials: string
  hp: number
  maxHp: number
  hpRatio: number
  position: GridPoint
  positionLabel: string
  facing: Direction
  statuses: HudStatusChipViewModel[]
  moveStateLabel: string
  actionStateLabel: string
  turnStateLabel: string
}

export interface InitiativeRailEntryViewModel {
  id: string
  name: string
  className: string
  team: Team
  initials: string
  active: boolean
  selected: boolean
  emphasis: 'active' | 'selected' | 'normal'
  orderLabel: string
}

export interface InitiativeRailViewModel {
  label: string
  currentTurnLabel: string
  entries: InitiativeRailEntryViewModel[]
}

export interface ActionMenuViewModel {
  label: string
  anchor: HudAnchor
  buttons: HudActionButton[]
  avoidClientPoints: HudClientPoint[]
}

export interface TargetMarkerViewModel {
  unitId: string
  team: Team
  anchor: HudAnchor
  amountLabel: string
  amountKind: 'damage' | 'heal' | 'effect'
  markerTone: CombatTelegraphSummary['markerTone']
  emphasis: boolean
}

export interface TargetDetailPopupViewModel {
  unitId: string
  anchor: HudAnchor
  title: string
  subtitle: string
  amountLabel: string
  counterLabel: string
  effectLabel: string
  verdictChips: HudStatusChipViewModel[]
  telegraphSummary: CombatTelegraphSummary
}

export interface DuelTelemetry {
  active: boolean
  stepIndex: number
  stepCount: number
  actionLabel: string
  fastMode: boolean
  stepKind?: CombatPresentationStep['kind']
  fxCueId?: string
  targetUnitId?: string
}

export interface ViewControlButtonViewModel {
  id: string
  label: string
  icon: string
  disabled: boolean
  active: boolean
}

export interface ViewControlsViewModel {
  label: string
  buttons: ViewControlButtonViewModel[]
}

export interface BottomStatusLineViewModel {
  objectivePhaseLabel: string
  objectiveLabel: string
  modeLabel: string
  logLabel: string
  phaseLabel: string
}

export interface HudViewModel {
  locale: Locale
  phase: BattleState['phase']
  mode: 'idle' | 'move' | 'attack' | 'skill' | 'busy'
  activeUnitPanel?: ActiveUnitPanelViewModel
  actionMenu?: ActionMenuViewModel
  initiativeRail: InitiativeRailViewModel
  targetMarkers: TargetMarkerViewModel[]
  targetDetail?: TargetDetailPopupViewModel
  viewControls: ViewControlsViewModel
  statusLine: BottomStatusLineViewModel
  phaseAnnouncement?: {
    label: string
    body: string
    cueId?: string
  }
  modal?: {
    kind: 'briefing' | 'victory' | 'defeat'
    eyebrow: string
    title: string
    body: string
    phaseLabel: string
    objectiveHeading: string
    objectiveLabel: string
    buttonLabel: string
  }
}
