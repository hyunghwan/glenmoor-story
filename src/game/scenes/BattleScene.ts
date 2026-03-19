import Phaser from 'phaser'
import {
  BATTLE_DRAG_THRESHOLD_PX,
  clampBattleZoom,
  rotateQuarterTurns,
  stepBattleZoom,
  type RotationQuarterTurns,
} from '../battle-camera'
import {
  buildCommandButtons,
  buildInitiativeEntries,
  buildRangeTiles,
  buildTargetPreviewStrings,
  buildTargetPreviewSummary,
  buildUnitInitials,
  resolveActiveTurnMode,
  resolveIdleUnitSelection,
} from '../battle-ui-model'
import { classDefinitions, skillDefinitions, statusDefinitions, terrainDefinitions } from '../content'
import { HEIGHT_STEP, TILE_HEIGHT, TILE_WIDTH } from '../iso'
import { I18n } from '../i18n'
import { formatBattleFeedEntry } from '../combat-text'
import { resolveDefaultZoom, resolveDynamicBoardOrigin } from '../responsive'
import { BattleRuntime } from '../runtime'
import {
  buildProjectionOptions as buildSceneProjectionOptions,
  buildUnitAnchor as buildSceneUnitAnchor,
  computeCameraFocusScroll as computeSceneCameraFocusScroll,
  projectGridPointToClient as projectSceneGridPointToClient,
  projectTileDiamond as projectSceneTileDiamond,
  projectTilePoint as projectSceneTilePoint,
} from './battle/scene-camera'
import {
  getBridgeDropPreviewPoint as getSceneBridgeDropPreviewPoint,
  getPulse as getScenePulse,
  resolveCueColor as resolveSceneCueColor,
  resolveImpactScale as resolveSceneImpactScale,
  resolveMarkerToneColor as resolveSceneMarkerToneColor,
  resolveTerrainReactionColor as resolveSceneTerrainReactionColor,
  resolveToneColor as resolveSceneToneColor,
} from './battle/scene-effects'
import {
  buildAccessibleOptionsModel,
  buildAccessiblePanelModel,
  buildActionMenuModel,
  buildActiveUnitPanelModel,
  buildModalModel,
  buildObjectivePhaseProgressLabel as buildSceneObjectivePhaseProgressLabel,
  buildTargetDetailModel,
  buildTargetMarkersModel,
  buildViewControlsModel,
  createCombatTextContext as createSceneCombatTextContext,
  resolveTargetDetailPlacement as resolveSceneTargetDetailPlacement,
  resolveUnitPresentation as resolveSceneUnitPresentation,
} from './battle/scene-hud'
import { drawBattlefieldUnitIcon } from '../unit-visuals'
import type {
  ActionTarget,
  AccessibilityPreferences,
  BattleAction,
  CombatResolution,
  DuelTelemetry,
  GridPoint,
  HudAnchor,
  HudViewModel,
  ImpactWeight,
  Locale,
  ReachableTile,
  TerrainReactionId,
  TiledMapData,
  UnitState,
  ViewportProfile,
} from '../types'

function samePoint(left: GridPoint, right: GridPoint): boolean {
  return left.x === right.x && left.y === right.y
}

function pointKey(point: GridPoint): string {
  return `${point.x},${point.y}`
}

interface BattlefieldPointerState {
  pointerId: number
  startX: number
  startY: number
  startScrollX: number
  startScrollY: number
  tilePoint?: GridPoint
  unitId?: string
  isDragging: boolean
}

interface MatterFxParticle {
  body: MatterJS.BodyType
  color: number
  radius: number
  width: number
  height: number
  alpha: number
  ageMs: number
  lifetimeMs: number
  shape: 'circle' | 'shard'
  cueId: string
}

interface ActionFeedbackState {
  elapsedMs: number
  durationMs: number
  sourcePoint: GridPoint
  targetPoint: GridPoint
  color: number
  impactWeight: ImpactWeight
}

interface PendingDuelLaunch {
  remainingMs: number
  resolution: CombatResolution
}

interface PhaseSequenceState {
  elapsedMs: number
  durationMs: number
  focusUnitId?: string
  returnScrollX: number
  returnScrollY: number
  focusScrollX: number
  focusScrollY: number
}

interface PinchState {
  startDistance: number
  startZoom: number
}

export class BattleScene extends Phaser.Scene {
  private readonly uiBus: Phaser.Events.EventEmitter
  private readonly i18n: I18n
  private readonly getViewportProfile: () => ViewportProfile
  private readonly getAccessibilityPreferences: () => AccessibilityPreferences
  private runtime?: BattleRuntime
  private battlefieldZone?: Phaser.GameObjects.Zone
  private mapGraphics?: Phaser.GameObjects.Graphics
  private overlayGraphics?: Phaser.GameObjects.Graphics
  private statusAuraGraphics?: Phaser.GameObjects.Graphics
  private matterFxGraphics?: Phaser.GameObjects.Graphics
  private screenFxGraphics?: Phaser.GameObjects.Graphics
  private tileZones = new Map<string, Phaser.GameObjects.Zone>()
  private unitContainers = new Map<string, Phaser.GameObjects.Container>()
  private matterParticles: MatterFxParticle[] = []
  private hoveredPoint?: GridPoint
  private selectedUnitId?: string
  private mode: HudViewModel['mode'] = 'idle'
  private moveRangeTiles: ReachableTile[] = []
  private reachableTiles: ReachableTile[] = []
  private targetOptions: ActionTarget[] = []
  private activeTelegraphKinds: string[] = []
  private pulseElapsedMs = 0
  private matterSpawnElapsedMs = 0
  private pendingAiDelayMs = 0
  private debugAdvanceMs = 0
  private lastDebugInput: Record<string, unknown> = {}
  private lastActiveUnitId?: string
  private pendingObjectivePhaseId?: string
  private pendingReinforcementIds: string[] = []
  private phaseAnnouncementKey?: string
  private phaseAnnouncementCueId?: string
  private phaseAnnouncementMs = 0
  private lastCameraFocusUnitId?: string
  private currentModal?: HudViewModel['modal']
  private battleMusic?: Phaser.Sound.BaseSound
  private actionFeedback?: ActionFeedbackState
  private pendingDuelLaunch?: PendingDuelLaunch
  private phaseSequence?: PhaseSequenceState
  private duelTelemetry: DuelTelemetry = {
    active: false,
    stepIndex: 0,
    stepCount: 0,
    actionLabel: '',
    fastMode: false,
    stepKind: undefined,
    fxCueId: undefined,
    targetUnitId: undefined,
  }
  private mapData?: TiledMapData
  private cameraBounds?: Phaser.Geom.Rectangle
  private pointerState?: BattlefieldPointerState
  private pinchState?: PinchState
  private projectionOrigin = { x: 0, y: 0 }
  private viewportProfile: ViewportProfile
  private accessibilityPreferences: AccessibilityPreferences
  private viewState: {
    rotationQuarterTurns: RotationQuarterTurns
    zoom: number
    panModeActive: boolean
  } = {
    rotationQuarterTurns: 0,
    zoom: 1,
    panModeActive: false,
  }

  constructor(
    uiBus: Phaser.Events.EventEmitter,
    i18n: I18n,
    getViewportProfile: () => ViewportProfile,
    getAccessibilityPreferences: () => AccessibilityPreferences,
  ) {
    super('battle')
    this.uiBus = uiBus
    this.i18n = i18n
    this.getViewportProfile = getViewportProfile
    this.getAccessibilityPreferences = getAccessibilityPreferences
    this.viewportProfile = getViewportProfile()
    this.accessibilityPreferences = getAccessibilityPreferences()
  }

  create(): void {
    this.viewportProfile = this.getViewportProfile()
    this.accessibilityPreferences = this.getAccessibilityPreferences()
    this.mapData = this.cache.json.get('map:glenmoor-pass') as TiledMapData
    this.runtime = new BattleRuntime(this.mapData)
    this.resetViewState()
    this.registerBattlefieldInput()
    this.input.addPointer(2)
    this.createBattlefieldZone()
    this.mapGraphics = this.add.graphics()
    this.overlayGraphics = this.add.graphics()
    this.statusAuraGraphics = this.add.graphics()
    this.matterFxGraphics = this.add.graphics()
    this.screenFxGraphics = this.add.graphics().setScrollFactor(0).setDepth(4000)
    this.statusAuraGraphics.setDepth(20)
    this.matterFxGraphics.setDepth(42)
    this.overlayGraphics.setDepth(48)
    this.matter.world.setGravity(0, 0)
    this.scale.on(Phaser.Scale.Events.RESIZE, this.handleScaleResize, this)

    this.createTileInputs()
    this.syncTileInputs()
    this.applyCameraView(true)
    this.drawBoard()
    this.syncUnits()

    this.selectedUnitId = this.runtime.getActiveUnit().id
    this.currentModal = this.buildModal('briefing')

    this.uiBus.on('hud:command', this.handleHudCommand, this)
    this.uiBus.on('hud:locale', this.handleLocaleChange, this)
    this.uiBus.on('duel:complete', this.handleDuelComplete, this)
    this.uiBus.on('duel:telemetry', this.handleDuelTelemetry, this)
    this.uiBus.on('debug:advance', this.handleDebugAdvance, this)
    this.uiBus.on('debug:tile-click', this.handleDebugTileClick, this)
    this.uiBus.on('debug:stage', this.handleDebugStage, this)
    this.uiBus.on('presentation:viewport', this.handleViewportProfileUpdate, this)
    this.uiBus.on('presentation:accessibility', this.handleAccessibilityPreferencesUpdate, this)

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.battleMusic?.stop()
      this.battleMusic?.destroy()
      this.battleMusic = undefined
      this.uiBus.off('hud:command', this.handleHudCommand, this)
      this.uiBus.off('hud:locale', this.handleLocaleChange, this)
      this.uiBus.off('duel:complete', this.handleDuelComplete, this)
      this.uiBus.off('duel:telemetry', this.handleDuelTelemetry, this)
      this.uiBus.off('debug:advance', this.handleDebugAdvance, this)
      this.uiBus.off('debug:tile-click', this.handleDebugTileClick, this)
      this.uiBus.off('debug:stage', this.handleDebugStage, this)
      this.uiBus.off('presentation:viewport', this.handleViewportProfileUpdate, this)
      this.uiBus.off('presentation:accessibility', this.handleAccessibilityPreferencesUpdate, this)
      this.scale.off(Phaser.Scale.Events.RESIZE, this.handleScaleResize, this)
      this.input.off('pointermove', this.handlePointerMove, this)
      this.input.off('pointerup', this.handlePointerUp, this)
      this.input.off('gameout', this.handlePointerCancel, this)
      this.input.off('wheel', this.handleWheel, this)
      this.clearMatterFx()
      this.screenFxGraphics?.clear()
    })

    this.refreshPresentation()
  }

  update(_time: number, delta: number): void {
    const effectiveDelta = delta + this.debugAdvanceMs
    this.debugAdvanceMs = 0

    if (this.runtime) {
      this.flushPointerGestureFallback()
      this.pulseElapsedMs += effectiveDelta
      this.updateMatterFx(effectiveDelta)
      this.updateTransientFeedback(effectiveDelta)
      this.drawOverlays()
      this.drawStatusAuras()
      this.drawScreenFx()
    }

    if (!this.runtime || this.currentModal || this.mode === 'busy' || this.runtime.state.phase !== 'active') {
      return
    }

    const active = this.runtime.getActiveUnit()

    if (active.team === 'allies') {
      this.pendingAiDelayMs = 0
      this.lastActiveUnitId = active.id
      return
    }

    if (this.lastActiveUnitId !== active.id) {
      this.pendingAiDelayMs = 850
      this.lastActiveUnitId = active.id
    }

    this.pendingAiDelayMs -= effectiveDelta

    if (this.pendingAiDelayMs <= 0) {
      const choice = this.runtime.chooseBestAction(active.id)
      this.resolveAction(choice.action)
      this.pendingAiDelayMs = 0
    }
  }

  private flushPointerGestureFallback(): void {
    if (!this.pointerState) {
      return
    }

    const pointer = this.input.activePointer

    if (pointer.id !== this.pointerState.pointerId || pointer.isDown) {
      return
    }

    this.finishPointerGesture(pointer, false)
  }

  private resetViewState(): void {
    this.viewState = {
      rotationQuarterTurns: 0,
      zoom: resolveDefaultZoom(this.viewportProfile),
      panModeActive: false,
    }
    this.pointerState = undefined
    this.pinchState = undefined
    this.lastCameraFocusUnitId = undefined
  }

  private registerBattlefieldInput(): void {
    this.input.on('pointermove', this.handlePointerMove, this)
    this.input.on('pointerup', this.handlePointerUp, this)
    this.input.on('gameout', this.handlePointerCancel, this)
    this.input.on('wheel', this.handleWheel, this)
  }

  private handleScaleResize(): void {
    this.applyCameraView(false)
    this.refreshPresentation()
  }

  private handleViewportProfileUpdate(profile: ViewportProfile): void {
    this.viewportProfile = profile
    this.viewState.zoom = resolveDefaultZoom(profile)
    this.applyCameraView(true)
    this.refreshPresentation()
  }

  private handleAccessibilityPreferencesUpdate(preferences: AccessibilityPreferences): void {
    this.accessibilityPreferences = preferences
    this.refreshPresentation()
  }

  private getProjectionOptions() {
    return buildSceneProjectionOptions({
      rotationQuarterTurns: this.viewState.rotationQuarterTurns,
      mapWidth: this.runtime?.state.map.width,
      mapHeight: this.runtime?.state.map.height,
      origin: this.projectionOrigin,
    })
  }

  private projectTilePoint(point: GridPoint, height = 0): { x: number; y: number } {
    return projectSceneTilePoint(point, height, this.getProjectionOptions())
  }

  private projectTileDiamond(point: GridPoint, height = 0): { x: number; y: number }[] {
    return projectSceneTileDiamond(point, height, this.getProjectionOptions())
  }

  private getPulse(periodMs = 860, phaseMs = 0): number {
    return getScenePulse(this.pulseElapsedMs, periodMs, phaseMs)
  }

  private resolveToneColor(tone: string): number {
    return resolveSceneToneColor(tone)
  }

  private resolveMarkerToneColor(tone: HudViewModel['targetMarkers'][number]['markerTone']): number {
    return resolveSceneMarkerToneColor(tone)
  }

  private resolveCueColor(fxCueId: string): number {
    return resolveSceneCueColor(fxCueId)
  }

  private resolveTerrainReactionColor(reactionId: TerrainReactionId): number {
    return resolveSceneTerrainReactionColor(reactionId)
  }

  private getBridgeDropPreviewPoint(actorPoint: GridPoint, targetPoint: GridPoint): GridPoint | undefined {
    return this.runtime
      ? getSceneBridgeDropPreviewPoint(this.runtime.state.map, actorPoint, targetPoint)
      : undefined
  }

  private resolveImpactScale(weight: ImpactWeight): number {
    return resolveSceneImpactScale(weight)
  }

  private getTileHeight(point: GridPoint): number {
    return this.runtime?.state.map.tiles[point.y]?.[point.x]?.height ?? 0
  }

  private findReachableTile(point: GridPoint): ReachableTile | undefined {
    return this.moveRangeTiles.find((tile) => samePoint(tile.point, point))
  }

  private spawnMatterParticle(config: {
    x: number
    y: number
    cueId: string
    color: number
    radius?: number
    width?: number
    height?: number
    velocityX: number
    velocityY: number
    angularVelocity?: number
    lifetimeMs: number
    shape: MatterFxParticle['shape']
  }): void {
    if (this.matterParticles.length >= 180) {
      const oldest = this.matterParticles.shift()

      if (oldest) {
        this.matter.world.remove(oldest.body)
      }
    }

    const body =
      config.shape === 'circle'
        ? this.matter.add.circle(config.x, config.y, config.radius ?? 4, {
            frictionAir: 0.035,
            collisionFilter: { group: -1, mask: 0 },
            isSensor: true,
          })
        : this.matter.add.rectangle(config.x, config.y, config.width ?? 8, config.height ?? 3, {
            frictionAir: 0.04,
            collisionFilter: { group: -1, mask: 0 },
            isSensor: true,
          })

    this.matter.setVelocity(body, config.velocityX, config.velocityY)

    if (config.angularVelocity) {
      this.matter.setAngularVelocity(body, config.angularVelocity)
    }

    this.matterParticles.push({
      body,
      color: config.color,
      radius: config.radius ?? 4,
      width: config.width ?? 8,
      height: config.height ?? 3,
      alpha: 1,
      ageMs: 0,
      lifetimeMs: config.lifetimeMs,
      shape: config.shape,
      cueId: config.cueId,
    })
  }

  private clearMatterFx(): void {
    for (const particle of this.matterParticles) {
      this.matter.world.remove(particle.body)
    }

    this.matterParticles = []
    this.matterFxGraphics?.clear()
  }

  private emitAmbientMatterFx(): void {
    if (!this.runtime) {
      return
    }

    for (const unit of Object.values(this.runtime.state.units)) {
      if (unit.defeated || unit.statuses.length === 0) {
        continue
      }

      const world = this.projectTilePoint(unit.position, this.getTileHeight(unit.position))

      for (const [index, status] of unit.statuses.entries()) {
        const color = this.resolveToneColor(statusDefinitions[status.id].presentation.tone)
        const orbit = this.pulseElapsedMs * 0.005 + unit.position.x * 0.8 + unit.position.y * 0.6 + index * 1.7
        const offsetX = Math.cos(orbit) * (16 + index * 5)
        const offsetY = Math.sin(orbit) * (6 + index * 3)
        this.spawnMatterParticle({
          x: world.x + offsetX,
          y: world.y - 18 + offsetY,
          cueId: statusDefinitions[status.id].presentation.fxCueId,
          color,
          radius: 2.8 + Math.min(status.stacks, 3),
          velocityX: offsetX * 0.012,
          velocityY: -0.18 - Math.abs(offsetY) * 0.01,
          angularVelocity: 0.06,
          lifetimeMs: 560 + index * 90,
          shape: statusDefinitions[status.id].presentation.matterProfile === 'guard-fragments' ? 'shard' : 'circle',
        })
      }
    }

    for (const option of this.targetOptions) {
      const unit = this.runtime.state.units[option.unitId]

      if (!unit || unit.defeated) {
        continue
      }

      const preview = buildTargetPreviewStrings(option.forecast, this.createCombatTextContext())
      const world = this.projectTilePoint(unit.position, this.getTileHeight(unit.position))
      const color = this.resolveMarkerToneColor(preview.markerTone)
      const count = this.hoveredPoint && samePoint(this.hoveredPoint, unit.position) ? 2 : 1

      for (let index = 0; index < count; index += 1) {
        const angle = this.pulseElapsedMs * 0.006 + option.point.x * 0.4 + option.point.y * 0.33 + index * Math.PI
        this.spawnMatterParticle({
          x: world.x + Math.cos(angle) * 18,
          y: world.y - 10 + Math.sin(angle) * 10,
          cueId: preview.telegraphSummary.markerTone,
          color,
          radius: preview.telegraphSummary.markerTone === 'lethal' ? 4.4 : 3.2,
          width: 10,
          height: 3,
          velocityX: Math.cos(angle) * 0.3,
          velocityY: Math.sin(angle) * 0.1 - 0.14,
          angularVelocity: 0.08,
          lifetimeMs: 420,
          shape: preview.telegraphSummary.markerTone === 'status' ? 'circle' : 'shard',
        })
      }
    }
  }

  private updateMatterFx(delta: number): void {
    if (!this.runtime || !this.matterFxGraphics) {
      return
    }

    this.matterSpawnElapsedMs += delta

    while (this.matterSpawnElapsedMs >= 140) {
      this.emitAmbientMatterFx()
      this.matterSpawnElapsedMs -= 140
    }

    this.matterParticles = this.matterParticles.filter((particle) => {
      particle.ageMs += delta
      particle.alpha = Math.max(0, 1 - particle.ageMs / particle.lifetimeMs)

      if (particle.ageMs >= particle.lifetimeMs) {
        this.matter.world.remove(particle.body)
        return false
      }

      return true
    })

    this.drawMatterFx()
  }

  private drawMatterFx(): void {
    if (!this.matterFxGraphics) {
      return
    }

    this.matterFxGraphics.clear()

    for (const particle of this.matterParticles) {
      const { x, y } = particle.body.position

      this.matterFxGraphics.fillStyle(particle.color, 0.15 * particle.alpha)
      this.matterFxGraphics.lineStyle(1, particle.color, 0.9 * particle.alpha)

      if (particle.shape === 'circle') {
        this.matterFxGraphics.fillCircle(x, y, particle.radius * 1.8)
        this.matterFxGraphics.fillStyle(particle.color, 0.78 * particle.alpha)
        this.matterFxGraphics.fillCircle(x, y, particle.radius)
        continue
      }

      const halfWidth = particle.width / 2
      const halfHeight = particle.height / 2
      const angle = particle.body.angle
      const points = [
        { x: -halfWidth, y: -halfHeight },
        { x: halfWidth, y: -halfHeight },
        { x: halfWidth, y: halfHeight },
        { x: -halfWidth, y: halfHeight },
      ].map((point) => ({
        x: x + point.x * Math.cos(angle) - point.y * Math.sin(angle),
        y: y + point.x * Math.sin(angle) + point.y * Math.cos(angle),
      }))

      this.matterFxGraphics.fillPoints(points, true)
      this.matterFxGraphics.strokePoints([...points, points[0]], true)
    }
  }

  private updateTransientFeedback(delta: number): void {
    if (this.phaseAnnouncementMs > 0) {
      this.phaseAnnouncementMs = Math.max(0, this.phaseAnnouncementMs - delta)

      if (this.phaseAnnouncementMs === 0) {
        this.phaseAnnouncementKey = undefined
        this.phaseAnnouncementCueId = undefined
        this.publishHud()
      }
    }

    if (this.actionFeedback) {
      this.actionFeedback.elapsedMs += delta

      if (this.actionFeedback.elapsedMs >= this.actionFeedback.durationMs) {
        this.actionFeedback = undefined
      }
    }

    if (this.pendingDuelLaunch) {
      this.pendingDuelLaunch.remainingMs -= delta

      if (this.pendingDuelLaunch.remainingMs <= 0) {
        const pending = this.pendingDuelLaunch
        this.pendingDuelLaunch = undefined
        this.scene.launch('duel', {
          resolution: pending.resolution,
          locale: this.i18n.getLocale(),
        })
        this.scene.bringToTop('duel')
        this.refreshPresentation()
      }
    }

    if (this.phaseSequence && this.runtime) {
      this.phaseSequence.elapsedMs += delta
      const progress = Phaser.Math.Clamp(this.phaseSequence.elapsedMs / this.phaseSequence.durationMs, 0, 1)
      const camera = this.cameras.main
      const focusEase =
        progress < 0.42
          ? Phaser.Math.Easing.Sine.Out(progress / 0.42)
          : progress < 0.72
            ? 1
            : 1 - Phaser.Math.Easing.Sine.InOut((progress - 0.72) / 0.28)

      camera.scrollX = Phaser.Math.Linear(
        this.phaseSequence.returnScrollX,
        this.phaseSequence.focusScrollX,
        focusEase,
      )
      camera.scrollY = Phaser.Math.Linear(
        this.phaseSequence.returnScrollY,
        this.phaseSequence.focusScrollY,
        focusEase,
      )
      this.clampCameraScroll()

      if (progress >= 1) {
        camera.setScroll(this.phaseSequence.returnScrollX, this.phaseSequence.returnScrollY)
        this.phaseSequence = undefined
        this.syncPresentationFromActiveUnit(true)
      }
    }
  }

  private computeCameraFocusScroll(point: GridPoint): { x: number; y: number } | undefined {
    if (!this.runtime || !this.cameraBounds) {
      return undefined
    }

    const camera = this.cameras.main

    return computeSceneCameraFocusScroll({
      point,
      tileHeight: this.getTileHeight(point),
      projection: this.getProjectionOptions(),
      cameraWidth: camera.width,
      cameraHeight: camera.height,
      cameraZoom: camera.zoom,
      cameraBounds: this.cameraBounds,
    })
  }

  private drawStatusAuras(): void {
    if (!this.runtime || !this.statusAuraGraphics) {
      return
    }

    this.statusAuraGraphics.clear()
    const pulse = this.getPulse(980)

    for (const unit of Object.values(this.runtime.state.units)) {
      if (unit.defeated || unit.statuses.length === 0) {
        continue
      }

      const world = this.projectTilePoint(unit.position, this.getTileHeight(unit.position))

      for (const [index, status] of unit.statuses.entries()) {
        const presentation = statusDefinitions[status.id].presentation
        const color = this.resolveToneColor(presentation.tone)
        const width = 40 + index * 10 + pulse * 8
        const height = 14 + index * 4 + pulse * 3
        this.statusAuraGraphics.fillStyle(color, 0.05 + status.stacks * 0.015)
        this.statusAuraGraphics.fillEllipse(world.x, world.y + 8 - index * 3, width, height)
        this.statusAuraGraphics.lineStyle(2, color, 0.24 + pulse * 0.18)
        this.statusAuraGraphics.strokeEllipse(world.x, world.y + 8 - index * 3, width + 6, height + 3)
        this.statusAuraGraphics.lineStyle(1, color, 0.18 + pulse * 0.12)
        this.statusAuraGraphics.strokeEllipse(world.x, world.y - 6 - index * 6, 24 + index * 7, 10 + pulse * 2)
      }
    }
  }

  private drawScreenFx(): void {
    if (!this.screenFxGraphics || !this.runtime) {
      return
    }

    this.screenFxGraphics.clear()

    const width = this.scale.width
    const height = this.scale.height

    if (this.actionFeedback) {
      const progress = Phaser.Math.Clamp(this.actionFeedback.elapsedMs / this.actionFeedback.durationMs, 0, 1)
      const pulse = Math.sin(progress * Math.PI)
      const alpha = 0.05 + (1 - progress) * 0.1
      this.screenFxGraphics.fillStyle(this.actionFeedback.color, alpha)
      this.screenFxGraphics.fillRect(0, 0, width, height)
      this.screenFxGraphics.lineStyle(3, this.actionFeedback.color, 0.22 + pulse * 0.2)
      this.screenFxGraphics.strokeRect(12, 12, width - 24, height - 24)
    }

    if (this.phaseSequence) {
      const progress = Phaser.Math.Clamp(this.phaseSequence.elapsedMs / this.phaseSequence.durationMs, 0, 1)
      const pulse = Math.sin(progress * Math.PI)
      this.screenFxGraphics.fillStyle(0xf0c877, 0.03 + pulse * 0.035)
      this.screenFxGraphics.fillRect(0, 0, width, height)
      this.screenFxGraphics.lineStyle(2, 0xf5d18c, 0.18 + pulse * 0.2)
      this.screenFxGraphics.strokeRect(22, 22, width - 44, height - 44)
    }

    const hoveredPoint = this.hoveredPoint
    const hoveredTarget =
      hoveredPoint ? this.targetOptions.find((option) => samePoint(option.point, hoveredPoint)) : undefined
    const hoveredSummary = hoveredTarget ? buildTargetPreviewSummary(hoveredTarget.forecast) : undefined

    if (!hoveredSummary) {
      return
    }

    const pulse = this.getPulse(720)
    let color = 0
    let alpha = 0

    if (hoveredSummary.lethal) {
      color = 0xf6d88d
      alpha = 0.022 + pulse * 0.032
    } else if (hoveredSummary.counterRisk > 0) {
      color = 0xa32633
      alpha = 0.016 + pulse * 0.024
    }

    if (alpha <= 0) {
      return
    }

    this.screenFxGraphics.fillStyle(color, alpha)
    this.screenFxGraphics.fillRect(0, 0, width, height)
    this.screenFxGraphics.lineStyle(2, color, alpha * 3.2)
    this.screenFxGraphics.strokeRect(10, 10, width - 20, height - 20)
  }

  private createBattlefieldZone(): void {
    this.battlefieldZone = this.add.zone(this.scale.width / 2, this.scale.height / 2, 4096, 4096)
    this.battlefieldZone.name = 'battlefield-zone'
    this.battlefieldZone.setInteractive({ cursor: 'grab' })
    this.battlefieldZone.setDepth(-1000)
    this.battlefieldZone.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      this.lastDebugInput = {
        source: 'battlefield-zone:pointerdown',
        pointerId: pointer.id,
        x: pointer.x,
        y: pointer.y,
      }
      this.beginPointerGesture(pointer)
    })
  }

  private beginPointerGesture(
    pointer: Phaser.Input.Pointer,
    candidate?: { tilePoint?: GridPoint; unitId?: string },
  ): void {
    if (this.mode === 'busy') {
      return
    }

    const camera = this.cameras.main
    this.lastDebugInput = {
      source: 'begin-pointer-gesture',
      pointerId: pointer.id,
      x: pointer.x,
      y: pointer.y,
      tilePoint: candidate?.tilePoint,
      unitId: candidate?.unitId,
      panModeActive: this.viewState.panModeActive,
    }
    this.pointerState = {
      pointerId: pointer.id,
      startX: pointer.x,
      startY: pointer.y,
      startScrollX: camera.scrollX,
      startScrollY: camera.scrollY,
      tilePoint: candidate?.tilePoint,
      unitId: candidate?.unitId,
      isDragging: false,
    }
  }

  private getActiveTouchPointers(): Phaser.Input.Pointer[] {
    return this.input.manager.pointers.filter((pointer) => pointer.isDown)
  }

  private resolveDragThresholdPx(): number {
    return this.viewportProfile.coarsePointer ? Math.max(6, BATTLE_DRAG_THRESHOLD_PX - 2) : BATTLE_DRAG_THRESHOLD_PX
  }

  private panCameraFromGesture(deltaX: number, deltaY: number, startScrollX: number, startScrollY: number): void {
    const camera = this.cameras.main
    camera.setScroll(
      startScrollX - deltaX / camera.zoom,
      startScrollY - deltaY / camera.zoom,
    )
    this.clampCameraScroll()
    this.hoveredPoint = undefined
    this.drawOverlays()
    this.publishHud()
  }

  private updatePinchGesture(): boolean {
    if (!this.viewportProfile.coarsePointer) {
      this.pinchState = undefined
      return false
    }

    const activePointers = this.getActiveTouchPointers()

    if (activePointers.length < 2) {
      this.pinchState = undefined
      return false
    }

    const [first, second] = activePointers
    const distance = Math.hypot(first.x - second.x, first.y - second.y)

    if (!this.pinchState) {
      this.pinchState = {
        startDistance: distance,
        startZoom: this.viewState.zoom,
      }
      this.pointerState = undefined
      return true
    }

    if (this.pinchState.startDistance <= 0) {
      return true
    }

    this.pointerState = undefined
    this.hoveredPoint = undefined
    this.viewState.zoom = clampBattleZoom(this.pinchState.startZoom * (distance / this.pinchState.startDistance))
    this.applyCameraView(false)
    this.publishHud()
    return true
  }

  private handlePointerMove(pointer: Phaser.Input.Pointer): void {
    if (this.updatePinchGesture()) {
      return
    }

    if (!this.pointerState || pointer.id !== this.pointerState.pointerId) {
      return
    }

    const dx = pointer.x - this.pointerState.startX
    const dy = pointer.y - this.pointerState.startY
    const distance = Math.hypot(dx, dy)
    const shouldPan = this.viewState.panModeActive || distance >= this.resolveDragThresholdPx()

    if (!shouldPan) {
      return
    }

    this.pointerState.isDragging = true
    this.panCameraFromGesture(dx, dy, this.pointerState.startScrollX, this.pointerState.startScrollY)
    this.updateBattlefieldCursor(true)
  }

  private handlePointerUp(pointer: Phaser.Input.Pointer): void {
    this.finishPointerGesture(pointer, false)
  }

  private handlePointerCancel(): void {
    this.pointerState = undefined
    this.pinchState = undefined
    this.updateBattlefieldCursor(false)
    this.emitTelemetry()
  }

  private finishPointerGesture(pointer: Phaser.Input.Pointer, cancelled: boolean): void {
    if (!this.pointerState || pointer.id !== this.pointerState.pointerId) {
      return
    }

    const state = this.pointerState
    this.pointerState = undefined
    this.updateBattlefieldCursor(false)
    const dx = pointer.x - state.startX
    const dy = pointer.y - state.startY
    const gestureDistance = Math.hypot(dx, dy)
    const didDrag = state.isDragging || gestureDistance >= this.resolveDragThresholdPx()

    if (this.pinchState) {
      this.pinchState = undefined
      this.emitTelemetry()
      return
    }

    this.lastDebugInput = {
      source: 'finish-pointer-gesture',
      pointerId: pointer.id,
      cancelled,
      x: pointer.x,
      y: pointer.y,
      tilePoint: state.tilePoint,
      unitId: state.unitId,
      isDragging: didDrag,
      gestureDistance: Math.round(gestureDistance * 100) / 100,
      panModeActive: this.viewState.panModeActive,
    }

    if (didDrag && !cancelled) {
      this.panCameraFromGesture(dx, dy, state.startScrollX, state.startScrollY)
    }

    if (didDrag || cancelled) {
      this.emitTelemetry()
      return
    }

    if (this.viewState.panModeActive) {
      this.emitTelemetry()
      return
    }

    if (state.unitId) {
      const unit = state.unitId ? this.runtime?.getUnit(state.unitId) : undefined

      if (unit && !unit.defeated) {
        this.handleUnitClick(unit)
        return
      }
    }

    if (state.tilePoint) {
      this.handleTileClick(state.tilePoint)
      return
    }

    this.emitTelemetry()
  }

  private handleWheel(
    _pointer: Phaser.Input.Pointer,
    _currentlyOver: Phaser.GameObjects.GameObject[],
    _deltaX: number,
    deltaY: number,
  ): void {
    if (this.mode === 'busy') {
      return
    }

    this.setZoom(stepBattleZoom(this.viewState.zoom, deltaY < 0 ? 1 : -1))
  }

  private updateBattlefieldCursor(isDragging: boolean): void {
    if (isDragging) {
      this.input.setDefaultCursor('grabbing')
      return
    }

    this.input.setDefaultCursor(this.viewState.panModeActive ? 'grab' : 'default')
  }

  private applyCameraView(recenter: boolean): void {
    const camera = this.cameras.main
    this.updateProjectionOrigin()
    camera.setZoom(this.viewState.zoom)
    this.syncTileInputs()
    this.updateCameraBounds(recenter)
    this.updateBattlefieldCursor(false)
    this.emitTelemetry()
  }

  private updateProjectionOrigin(): void {
    if (!this.runtime) {
      return
    }

    const heights = this.runtime.state.map.tiles.map((row) => row.map((tile) => tile.height))

    this.projectionOrigin = resolveDynamicBoardOrigin({
      viewportWidth: this.scale.width,
      viewportHeight: this.scale.height,
      rotationQuarterTurns: this.viewState.rotationQuarterTurns,
      mapWidth: this.runtime.state.map.width,
      mapHeight: this.runtime.state.map.height,
      heights,
    })
  }

  private updateCameraBounds(recenter: boolean): void {
    if (!this.runtime) {
      return
    }

    let minX = Number.POSITIVE_INFINITY
    let maxX = Number.NEGATIVE_INFINITY
    let minY = Number.POSITIVE_INFINITY
    let maxY = Number.NEGATIVE_INFINITY

    for (const row of this.runtime.state.map.tiles) {
      for (const tile of row) {
        const diamond = this.projectTileDiamond(tile.point, tile.height)

        for (const point of diamond) {
          minX = Math.min(minX, point.x)
          maxX = Math.max(maxX, point.x)
          minY = Math.min(minY, point.y)
          maxY = Math.max(maxY, point.y + HEIGHT_STEP)
        }
      }
    }

    const padding = 200
    this.cameraBounds = new Phaser.Geom.Rectangle(
      minX - padding,
      minY - padding,
      maxX - minX + padding * 2,
      maxY - minY + padding * 2,
    )

    const camera = this.cameras.main
    camera.setBounds(
      this.cameraBounds.x,
      this.cameraBounds.y,
      this.cameraBounds.width,
      this.cameraBounds.height,
    )

    if (recenter) {
      if (this.viewportProfile.layoutMode !== 'desktop') {
        this.focusCameraOnPoint(this.runtime.getActiveUnit().position)
      } else {
        camera.centerOn(
          this.cameraBounds.x + this.cameraBounds.width / 2,
          this.cameraBounds.y + this.cameraBounds.height / 2,
        )
      }
      return
    }

    this.clampCameraScroll()
  }

  private clampCameraScroll(): void {
    if (!this.cameraBounds) {
      return
    }

    const camera = this.cameras.main
    const visibleWidth = camera.width / camera.zoom
    const visibleHeight = camera.height / camera.zoom
    const maxScrollX = Math.max(this.cameraBounds.x, this.cameraBounds.x + this.cameraBounds.width - visibleWidth)
    const maxScrollY = Math.max(this.cameraBounds.y, this.cameraBounds.y + this.cameraBounds.height - visibleHeight)

    camera.scrollX = Phaser.Math.Clamp(camera.scrollX, this.cameraBounds.x, maxScrollX)
    camera.scrollY = Phaser.Math.Clamp(camera.scrollY, this.cameraBounds.y, maxScrollY)
  }

  private setZoom(nextZoom: number): void {
    if (nextZoom === this.viewState.zoom) {
      return
    }

    this.viewState.zoom = nextZoom
    this.applyCameraView(false)
    this.publishHud()
  }

  private focusCameraOnPoint(point: GridPoint): void {
    const focusScroll = this.computeCameraFocusScroll(point)

    if (!focusScroll) {
      return
    }

    this.cameras.main.setScroll(focusScroll.x, focusScroll.y)
  }

  private handleHudCommand(command: string): void {
    if (!this.runtime) {
      return
    }

    if (this.handleAccessibleCommand(command)) {
      return
    }

    if (command.startsWith('view-')) {
      this.playSfx('select', { volume: 0.18 })
      this.handleViewCommand(command)
      return
    }

    if (command === 'start-battle') {
      this.playSfx('confirm', { volume: 0.22 })
      this.currentModal = undefined
      this.runtime.startBattle()
      this.ensureBattleMusic()
      this.syncPresentationFromActiveUnit(true)
      return
    }

    if (command === 'restart-battle') {
      this.playSfx('confirm', { volume: 0.22 })
      this.resetBattle()
      return
    }

    if (this.currentModal || this.mode === 'busy') {
      return
    }

    const active = this.runtime.getActiveUnit()

    if (this.runtime.state.phase !== 'active' || active.team !== 'allies') {
      return
    }

    if (command === 'move') {
      this.playSfx('select', { volume: 0.18 })
      this.enterMoveMode()
      return
    }

    if (command === 'attack') {
      this.playSfx('select', { volume: 0.18 })
      this.mode = 'attack'
      this.targetOptions = this.runtime.getTargetsForAction({ actorId: active.id, kind: 'attack' })
      this.reachableTiles = []
      this.refreshPresentation()
      return
    }

    if (command === 'skill') {
      this.playSfx('select', { volume: 0.18 })
      this.mode = 'skill'
      this.targetOptions = this.runtime.getTargetsForAction({
        actorId: active.id,
        kind: 'skill',
        skillId: classDefinitions[active.classId].signatureSkillId,
      })
      this.reachableTiles = []
      this.refreshPresentation()
      return
    }

    if (command === 'wait') {
      this.playSfx('confirm', { volume: 0.2 })
      this.resolveAction({ actorId: active.id, kind: 'wait' })
      return
    }

    if (command === 'cancel') {
      this.playSfx('cancel', { volume: 0.22 })
      const shouldRestoreMove =
        (this.mode === 'attack' || this.mode === 'skill') &&
        this.runtime.state.phase === 'active' &&
        active.team === 'allies' &&
        !active.hasActedThisTurn &&
        this.moveRangeTiles.length > 0
      this.mode = shouldRestoreMove ? 'move' : 'idle'
      this.reachableTiles = shouldRestoreMove ? this.moveRangeTiles : []
      this.targetOptions = []
      this.refreshPresentation()
    }
  }

  private handleAccessibleCommand(command: string): boolean {
    if (command.startsWith('accessible:tile:')) {
      const [, , xRaw, yRaw] = command.split(':')
      const x = Number(xRaw)
      const y = Number(yRaw)

      if (Number.isFinite(x) && Number.isFinite(y)) {
        this.handleTileClick({ x, y })
      }

      return true
    }

    if (command.startsWith('accessible:target:')) {
      const unitId = command.split(':')[2]
      const unit = unitId ? this.runtime?.getUnit(unitId) : undefined

      if (unit && !unit.defeated) {
        this.handleTargetUnitClick(unit)
      }

      return true
    }

    return false
  }

  private handleViewCommand(command: string): void {
    if (command === 'view-rotate-left') {
      this.viewState.rotationQuarterTurns = rotateQuarterTurns(this.viewState.rotationQuarterTurns, -1)
      this.pointerState = undefined
      this.applyCameraView(this.viewportProfile.layoutMode !== 'desktop')
      this.refreshPresentation()
      return
    }

    if (command === 'view-rotate-right') {
      this.viewState.rotationQuarterTurns = rotateQuarterTurns(this.viewState.rotationQuarterTurns, 1)
      this.pointerState = undefined
      this.applyCameraView(this.viewportProfile.layoutMode !== 'desktop')
      this.refreshPresentation()
      return
    }

    if (command === 'view-zoom-in') {
      this.setZoom(stepBattleZoom(this.viewState.zoom, 1))
      return
    }

    if (command === 'view-zoom-out') {
      this.setZoom(stepBattleZoom(this.viewState.zoom, -1))
      return
    }

    if (command === 'view-pan-toggle') {
      this.viewState.panModeActive = !this.viewState.panModeActive
      this.pointerState = undefined
      this.hoveredPoint = undefined
      this.syncTileInputs()
      this.refreshPresentation()
      return
    }

    if (command === 'view-recenter') {
      this.focusCameraOnPoint(this.runtime!.getActiveUnit().position)
      this.publishHud()
      this.emitTelemetry()
    }
  }

  private handleLocaleChange(locale: Locale): void {
    this.playSfx('select', { volume: 0.16 })
    this.i18n.setLocale(locale)
    this.currentModal =
      this.runtime?.state.phase === 'briefing'
        ? this.buildModal('briefing')
        : this.runtime?.state.phase === 'victory'
          ? this.buildModal('victory')
          : this.runtime?.state.phase === 'defeat'
            ? this.buildModal('defeat')
            : undefined
    this.refreshPresentation()
  }

  private handleDuelComplete(): void {
    this.duelTelemetry = {
      active: false,
      stepIndex: 0,
      stepCount: 0,
      actionLabel: '',
      fastMode: false,
      stepKind: undefined,
      fxCueId: undefined,
      targetUnitId: undefined,
    }
    this.pendingDuelLaunch = undefined
    this.actionFeedback = undefined
    this.mode = 'idle'
    this.emitTelemetry()
    this.finalizeTurnTransition()
  }

  private handleDuelTelemetry(telemetry: typeof this.duelTelemetry): void {
    this.duelTelemetry = telemetry
    this.emitTelemetry()
  }

  private handleDebugAdvance(ms: number): void {
    if (this.scene.isActive('duel')) {
      this.uiBus.emit('duel:advance', ms)
      return
    }

    this.debugAdvanceMs += ms
  }

  private handleDebugTileClick(point: GridPoint): void {
    this.handleTileClick(point)
  }

  private handleDebugStage(stage: string): void {
    if (!this.runtime || !this.mapData) {
      return
    }

    this.clearMatterFx()
    this.runtime.reset(this.mapData)

    const initialPhase = this.runtime.definition.objectivePhases?.[0]

    for (const unit of Object.values(this.runtime.state.units)) {
      unit.statuses = []
      unit.hasMovedThisTurn = false
      unit.hasActedThisTurn = false
      unit.defeated = false
      unit.hp = classDefinitions[unit.classId].stats.maxHp
      unit.nextActAt = 500
    }

    this.runtime.state.messages = []
    this.runtime.state.phase = 'active'
    this.runtime.state.objectivePhaseId = initialPhase?.id ?? 'default-objective'
    this.runtime.state.objectiveKey = initialPhase?.objectiveKey ?? this.runtime.definition.objectiveKey
    this.runtime.state.briefingKey = initialPhase?.briefingKey ?? this.runtime.definition.briefingKey
    this.runtime.state.victoryKey = initialPhase?.victoryKey ?? this.runtime.definition.victoryKey
    this.runtime.state.defeatKey = initialPhase?.defeatKey ?? this.runtime.definition.defeatKey
    this.runtime.state.resolvedEventIds = []
    this.currentModal = undefined
    this.pendingObjectivePhaseId = undefined
    this.pendingReinforcementIds = []
    this.lastCameraFocusUnitId = undefined
    this.phaseAnnouncementKey = undefined
    this.phaseAnnouncementCueId = undefined
    this.phaseAnnouncementMs = 0
    this.pendingDuelLaunch = undefined
    this.actionFeedback = undefined
    this.phaseSequence = undefined

    if (stage === 'engagement') {
      this.placeUnit('rowan', { x: 7, y: 8 }, 12)
      this.placeUnit('brigandCaptain', { x: 7, y: 7 }, 20)
      this.runtime.state.activeUnitId = 'rowan'
    }

    if (stage === 'skill-demo') {
      this.placeUnit('maelin', { x: 8, y: 9 }, 20)
      this.placeUnit('brigandCaptain', { x: 8, y: 7 }, 24)
      this.runtime.state.activeUnitId = 'maelin'
    }

    if (stage === 'forest-demo') {
      this.placeUnit('huntmaster', this.runtime.state.units.huntmaster.position, 0)
      this.placeUnit('maelin', { x: 13, y: 5 }, 20)
      this.placeUnit('brigandCaptain', { x: 13, y: 2 }, 14)
      this.runtime.state.activeUnitId = 'maelin'
    }

    if (stage === 'ruins-demo') {
      for (const enemy of ['hexbinder', 'fanatic']) {
        this.placeUnit(enemy, this.runtime.state.units[enemy].position, 0)
      }
      this.placeUnit('talia', { x: 10, y: 6 }, 18)
      this.placeUnit('osric', { x: 10, y: 3 }, 12)
      this.runtime.state.activeUnitId = 'talia'
    }

    if (stage === 'push-demo') {
      this.placeUnit('rowan', { x: 0, y: 1 }, 30)
      this.placeUnit('brigandCaptain', { x: 0, y: 0 }, 24)
      this.runtime.state.activeUnitId = 'rowan'
    }

    if (stage === 'bridge-demo') {
      for (const enemy of ['hexbinder', 'shieldbearer', 'cutpurse', 'fanatic']) {
        this.placeUnit(enemy, this.runtime.state.units[enemy].position, 0)
      }
      this.placeUnit('rowan', { x: 7, y: 8 }, 18)
      this.placeUnit('brigandCaptain', { x: 7, y: 7 }, 10)
      this.runtime.state.activeUnitId = 'rowan'
    }

    if (stage === 'phase-demo') {
      for (const enemy of ['huntmaster', 'hexbinder', 'cutpurse', 'fanatic']) {
        this.placeUnit(enemy, this.runtime.state.units[enemy].position, 0)
      }
      this.placeUnit('rowan', { x: 11, y: 5 }, 16)
      this.placeUnit('shieldbearer', { x: 11, y: 4 }, 1)
      this.placeUnit('brigandCaptain', { x: 12, y: 3 }, 20)
      this.runtime.state.activeUnitId = 'rowan'
    }

    if (stage === 'victory-demo') {
      for (const enemy of ['huntmaster', 'hexbinder', 'shieldbearer', 'cutpurse', 'fanatic']) {
        this.placeUnit(enemy, this.runtime.state.units[enemy].position, 0)
      }
      this.placeUnit('rowan', { x: 7, y: 8 }, 18)
      this.placeUnit('brigandCaptain', { x: 7, y: 7 }, 5)
      this.setDebugObjectivePhase('hunt-the-captain')
      this.runtime.state.activeUnitId = 'rowan'
    }

    this.lastActiveUnitId = undefined
    this.pendingAiDelayMs = 0
    this.lastCameraFocusUnitId = undefined
    this.syncPresentationFromActiveUnit(true)
  }

  private setDebugObjectivePhase(phaseId: string): void {
    if (!this.runtime) {
      return
    }

    const phase =
      this.runtime.definition.objectivePhases?.find((candidate) => candidate.id === phaseId) ??
      this.runtime.definition.objectivePhases?.[0]

    if (!phase) {
      return
    }

    this.runtime.state.objectivePhaseId = phase.id
    this.runtime.state.objectiveKey = phase.objectiveKey
    this.runtime.state.briefingKey = phase.briefingKey ?? this.runtime.definition.briefingKey
    this.runtime.state.victoryKey = phase.victoryKey ?? this.runtime.definition.victoryKey
    this.runtime.state.defeatKey = phase.defeatKey ?? this.runtime.definition.defeatKey
  }

  private resetBattle(): void {
    if (!this.runtime || !this.mapData) {
      return
    }

    this.clearMatterFx()
    this.runtime.reset(this.mapData)
    this.resetViewState()
    this.currentModal = this.buildModal('briefing')
    this.pendingObjectivePhaseId = undefined
    this.pendingReinforcementIds = []
    this.phaseAnnouncementKey = undefined
    this.phaseAnnouncementCueId = undefined
    this.phaseAnnouncementMs = 0
    this.lastActiveUnitId = undefined
    this.pendingAiDelayMs = 0
    this.pendingDuelLaunch = undefined
    this.actionFeedback = undefined
    this.phaseSequence = undefined
    this.lastCameraFocusUnitId = undefined
    this.applyCameraView(true)
    this.syncUnits()
    this.syncPresentationFromActiveUnit(false)
  }

  private resolveAction(action: BattleAction): void {
    if (!this.runtime) {
      return
    }

    const previousUnitIds = new Set(Object.keys(this.runtime.state.units))
    this.pendingObjectivePhaseId = this.runtime.state.objectivePhaseId
    this.mode = 'busy'
    this.clearMatterFx()
    this.reachableTiles = []
    this.targetOptions = []
    const resolution = this.runtime.commitAction(action)
    this.pendingReinforcementIds = Object.keys(this.runtime.state.units).filter((unitId) => !previousUnitIds.has(unitId))
    this.syncUnits()

    if (action.kind === 'wait') {
      this.finalizeTurnTransition()
      return
    }

    this.actionFeedback = this.buildActionFeedback(resolution)
    this.pendingDuelLaunch = {
      remainingMs: this.actionFeedback?.durationMs ?? 0,
      resolution,
    }
    this.playActionCommitCue(resolution)
    this.refreshPresentation()
  }

  private finalizeTurnTransition(): void {
    if (!this.runtime) {
      return
    }

    if (this.runtime.state.phase === 'victory') {
      this.playSfx('victory', { volume: 0.28 })
      this.phaseAnnouncementKey = undefined
      this.phaseAnnouncementCueId = undefined
      this.phaseAnnouncementMs = 0
      this.currentModal = this.buildModal('victory')
      this.syncPresentationFromActiveUnit(false)
    } else if (this.runtime.state.phase === 'defeat') {
      this.playSfx('defeat', { volume: 0.26 })
      this.phaseAnnouncementKey = undefined
      this.phaseAnnouncementCueId = undefined
      this.phaseAnnouncementMs = 0
      this.currentModal = this.buildModal('defeat')
      this.syncPresentationFromActiveUnit(false)
    } else {
      this.currentModal = undefined
      if (!this.startPhaseSequence(this.pendingObjectivePhaseId)) {
        this.syncPresentationFromActiveUnit(true)
      }
    }

    this.pendingObjectivePhaseId = undefined
    this.pendingReinforcementIds = []
  }

  private createTileInputs(): void {
    if (!this.runtime) {
      return
    }

    for (const row of this.runtime.state.map.tiles) {
      for (const tile of row) {
        const zone = this.add.zone(
          0,
          0,
          TILE_WIDTH * (this.viewportProfile.coarsePointer ? 1.08 : 0.72),
          TILE_HEIGHT * (this.viewportProfile.coarsePointer ? 1.18 : 0.78),
        )
        zone.name = `tile:${tile.point.x},${tile.point.y}`
        zone.setInteractive({ cursor: 'pointer' })
        zone.on('pointerover', () => {
          if (
            this.currentModal ||
            this.mode === 'busy' ||
            this.viewState.panModeActive ||
            this.pointerState?.isDragging
          ) {
            return
          }

          this.hoveredPoint = tile.point
          this.drawOverlays()
          this.publishHud()
        })
        zone.on('pointerout', () => {
          if (
            this.currentModal ||
            this.mode === 'busy' ||
            this.viewState.panModeActive ||
            this.pointerState?.isDragging
          ) {
            return
          }

          this.hoveredPoint = undefined
          this.drawOverlays()
          this.publishHud()
        })
        zone.on(
          'pointerdown',
          (
            pointer: Phaser.Input.Pointer,
            _localX: number,
            _localY: number,
            event: Phaser.Types.Input.EventData,
          ) => {
            event.stopPropagation()
            this.lastDebugInput = {
              source: 'tile-zone:pointerdown',
              tilePoint: tile.point,
              pointerId: pointer.id,
              x: pointer.x,
              y: pointer.y,
            }
            this.beginPointerGesture(pointer, { tilePoint: tile.point })
          },
        )
        this.tileZones.set(pointKey(tile.point), zone)
      }
    }
  }

  private syncTileInputs(): void {
    if (!this.runtime) {
      return
    }

    for (const row of this.runtime.state.map.tiles) {
      for (const tile of row) {
        const zone = this.tileZones.get(pointKey(tile.point))

        if (!zone) {
          continue
        }

        const world = this.projectTilePoint(tile.point, tile.height)
        zone.setPosition(world.x, world.y)
        zone.setSize(
          TILE_WIDTH * (this.viewportProfile.coarsePointer ? 1.08 : 0.72),
          TILE_HEIGHT * (this.viewportProfile.coarsePointer ? 1.18 : 0.78),
        )

        if (zone.input) {
          zone.input.cursor = this.viewState.panModeActive ? 'grab' : 'pointer'
        }
      }
    }
  }

  private handleTileClick(point: GridPoint): void {
    if (!this.runtime || this.currentModal || this.mode === 'busy') {
      return
    }

    const occupant = this.findUnitAt(point)

    if (this.mode === 'move') {
      this.handleMoveModeTileClick(point, occupant)
      return
    }

    if (this.mode === 'attack' || this.mode === 'skill') {
      if (occupant) {
        this.handleTargetUnitClick(occupant)
      }

      return
    }

    if (occupant) {
      this.handleUnitClick(occupant)
      return
    }

    if (!this.isPlayerTurnInteractive()) {
      return
    }

    this.selectedUnitId = this.runtime.getActiveUnit().id
    this.refreshPresentation()
  }

  private findUnitAt(point: GridPoint): UnitState | undefined {
    if (!this.runtime) {
      return undefined
    }

    return Object.values(this.runtime.state.units).find(
      (unit) => !unit.defeated && unit.position.x === point.x && unit.position.y === point.y,
    )
  }

  private drawBoard(): void {
    if (!this.runtime || !this.mapGraphics) {
      return
    }

    this.mapGraphics.clear()

    const tiles = this.runtime.state.map.tiles.flat().sort((left, right) => {
      const leftWorld = this.projectTilePoint(left.point, left.height)
      const rightWorld = this.projectTilePoint(right.point, right.height)
      return leftWorld.y - rightWorld.y || leftWorld.x - rightWorld.x
    })

    for (const tile of tiles) {
      const terrain = terrainDefinitions[tile.terrainId]
      const diamond = this.projectTileDiamond(tile.point, tile.height)
      const world = this.projectTilePoint(tile.point, tile.height)
      const leftFace = [
        diamond[2],
        { x: diamond[2].x, y: diamond[2].y + tile.height * 0 },
        { x: diamond[2].x - TILE_WIDTH / 2, y: diamond[2].y + 22 },
        { x: diamond[3].x, y: diamond[3].y + 22 },
      ]
      const rightFace = [
        diamond[1],
        { x: diamond[1].x, y: diamond[1].y + 22 },
        { x: diamond[2].x, y: diamond[2].y + 22 },
        diamond[2],
      ]

      if (tile.height > 0) {
        this.mapGraphics.fillStyle(terrain.sideTint, 1)
        this.mapGraphics.fillPoints(leftFace, true)
        this.mapGraphics.fillStyle(terrain.sideTint - 0x101010, 1)
        this.mapGraphics.fillPoints(rightFace, true)
      }

      this.mapGraphics.fillStyle(terrain.tint, 1)
      this.mapGraphics.fillPoints(diamond, true)
      this.mapGraphics.lineStyle(1, 0x1a2832, 0.8)
      this.mapGraphics.strokePoints([...diamond, diamond[0]], true)

      if (tile.terrainId === 'forest') {
        this.mapGraphics.fillStyle(terrain.overlayTint, 0.9)
        this.mapGraphics.fillCircle(world.x - 10, world.y - 8, 7)
        this.mapGraphics.fillCircle(world.x + 9, world.y - 5, 6)
      }

      if (tile.terrainId === 'water') {
        this.mapGraphics.lineStyle(2, 0x8fccff, 0.35)
        this.mapGraphics.strokeEllipse(world.x, world.y, 18, 8)
      }

      if (tile.terrainId === 'bridge' || tile.terrainId === 'road') {
        this.mapGraphics.lineStyle(2, 0xd8bf8e, 0.3)
        this.mapGraphics.lineBetween(world.x - 18, world.y + 3, world.x + 18, world.y - 3)
      }
    }
  }

  private syncUnits(): void {
    for (const container of this.unitContainers.values()) {
      container.removeAll(true)
      container.destroy()
    }

    this.unitContainers.clear()

    if (!this.runtime) {
      return
    }

    const units = Object.values(this.runtime.state.units)
      .filter((unit) => !unit.defeated)
      .sort((left, right) => left.position.y - right.position.y || left.position.x - right.position.x)

    for (const unit of units) {
      const container = this.drawUnit(unit)
      this.unitContainers.set(unit.id, container)
    }
  }

  private drawUnit(unit: UnitState): Phaser.GameObjects.Container {
    const world = this.projectTilePoint(
      unit.position,
      this.runtime!.state.map.tiles[unit.position.y][unit.position.x].height,
    )
    const container = this.add.container(world.x, world.y - 16)
    const teamTint = unit.team === 'allies' ? 0x86baf7 : 0xf49274
    const presentation = this.resolveUnitPresentation(unit)
    const isActive = unit.id === this.runtime?.state.activeUnitId
    const outline = isActive ? 0xf5d18c : unit.id === this.selectedUnitId ? 0xffffff : 0x233341
    const graphic = this.add.graphics()
    graphic.name = `unit:${unit.id}`

    graphic.fillStyle(0x061015, 0.55)
    graphic.fillEllipse(0, 24, 38, 14)
    graphic.fillStyle(unit.team === 'allies' ? 0x112234 : 0x301a19, 0.96)
    graphic.fillRoundedRect(-20, -26, 40, 40, 12)
    graphic.lineStyle(2, teamTint, 1)
    graphic.strokeRoundedRect(-20, -26, 40, 40, 12)
    graphic.lineStyle(1.25, outline, 1)
    graphic.strokeRoundedRect(-20, -26, 40, 40, 12)
    if (isActive) {
      graphic.lineStyle(3, 0xf7e7b0, 0.92)
      graphic.strokeRoundedRect(-24, -30, 48, 48, 15)
      graphic.lineStyle(2, 0xf0b35f, 0.8)
      graphic.strokeEllipse(0, 24, 48, 18)
    }
    graphic.fillStyle(teamTint, 0.22)
    graphic.fillTriangle(0, -33, 7, -22, -7, -22)
    drawBattlefieldUnitIcon({
      graphics: graphic,
      combatRole: presentation.combatRole,
      unitIconId: presentation.unitIconId,
      x: 0,
      y: -9,
      size: 18,
    })

    const initials = buildUnitInitials(this.i18n.t(unit.nameKey))
    const label = this.add.text(0, 7, initials, {
      fontFamily: 'Cinzel',
      fontSize: '10px',
      color: '#f7f0dd',
      fontStyle: '700',
    }).setOrigin(0.5)
    const hp = this.add.graphics()
    const hpRatio = unit.hp / classDefinitions[unit.classId].stats.maxHp
    hp.fillStyle(0x0d1217, 0.9)
    hp.fillRoundedRect(-22, 22, 44, 7, 3)
    hp.fillStyle(unit.team === 'allies' ? 0x7de0b4 : 0xff8e75, 1)
    hp.fillRoundedRect(-22, 22, 44 * hpRatio, 7, 3)

    const markerObjects: Array<Phaser.GameObjects.Graphics | Phaser.GameObjects.Text> = []
    if (isActive) {
      const markerText = this.add
        .text(0, -47, this.i18n.t('hud.initiative.now').toUpperCase(), {
          fontFamily: 'Outfit',
          fontSize: '11px',
          color: '#081117',
          fontStyle: '700',
        })
        .setOrigin(0.5)
      const markerWidth = Math.max(40, markerText.width + 16)
      const marker = this.add.graphics()
      marker.fillStyle(0xf5d18c, 0.96)
      marker.lineStyle(1, 0xf7f0dd, 0.95)
      marker.fillRoundedRect(-markerWidth / 2, -56, markerWidth, 18, 9)
      marker.strokeRoundedRect(-markerWidth / 2, -56, markerWidth, 18, 9)
      markerObjects.push(marker, markerText)
    }

    if (!this.viewState.panModeActive && this.mode !== 'move') {
      graphic.setInteractive({
        hitArea: this.viewportProfile.coarsePointer
          ? new Phaser.Geom.Rectangle(-30, -42, 60, 86)
          : new Phaser.Geom.Rectangle(-22, -34, 44, 68),
        hitAreaCallback: Phaser.Geom.Rectangle.Contains,
        cursor: 'pointer',
      })
      graphic.on('pointerover', () => {
        if (
          this.currentModal ||
          this.mode === 'busy' ||
          this.viewState.panModeActive ||
          this.pointerState?.isDragging
        ) {
          return
        }

        this.hoveredPoint = unit.position
        this.drawOverlays()
        this.publishHud()
      })
      graphic.on('pointerout', () => {
        if (
          this.currentModal ||
          this.mode === 'busy' ||
          this.viewState.panModeActive ||
          this.pointerState?.isDragging
        ) {
          return
        }

        if (this.hoveredPoint && samePoint(this.hoveredPoint, unit.position)) {
          this.hoveredPoint = undefined
          this.drawOverlays()
          this.publishHud()
        }
      })
      graphic.on(
        'pointerdown',
        (
          pointer: Phaser.Input.Pointer,
          _localX: number,
          _localY: number,
          event: Phaser.Types.Input.EventData,
        ) => {
          event.stopPropagation()
          this.lastDebugInput = {
            source: 'unit:pointerdown',
            unitId: unit.id,
            pointerId: pointer.id,
            x: pointer.x,
            y: pointer.y,
          }
          this.beginPointerGesture(pointer, { unitId: unit.id })
        },
      )
    }

    container.add([graphic, label, hp, ...markerObjects])
    container.setDepth(world.y + 160)
    return container
  }

  private refreshPresentation(): void {
    this.drawBoard()
    this.drawOverlays()
    this.syncUnits()
    this.publishHud()
  }

  private drawOverlays(): void {
    if (!this.runtime || !this.overlayGraphics) {
      return
    }

    this.overlayGraphics.clear()
    const telegraphKinds = new Set<string>()
    const active = this.runtime.getActiveUnit()
    const actionRangeTiles = this.getActionRangeTiles()
    const movePulse = this.getPulse(1080)
    const rangePulse = this.getPulse(880, 140)
    const targetPulse = this.getPulse(720, 280)

    for (const tile of this.reachableTiles) {
      telegraphKinds.add('move-range')
      const height = this.runtime.state.map.tiles[tile.point.y][tile.point.x].height
      const diamond = this.projectTileDiamond(tile.point, height)
      this.overlayGraphics.fillStyle(0x67b9ff, tile.cost === 0 ? 0.12 + movePulse * 0.06 : 0.2 + movePulse * 0.12)
      this.overlayGraphics.fillPoints(diamond, true)
      this.overlayGraphics.lineStyle(
        tile.cost === 0 ? 2 : 1,
        tile.cost === 0 ? 0xf5d18c : 0x99d5ff,
        0.7 + movePulse * 0.2,
      )
      this.overlayGraphics.strokePoints([...diamond, diamond[0]], true)

      if (tile.cost > 0) {
        const world = this.projectTilePoint(tile.point, height)
        this.overlayGraphics.fillStyle(0xdff2ff, 0.08 + movePulse * 0.08)
        this.overlayGraphics.fillCircle(world.x, world.y, 2.4)
      }
    }

    const hoveredReachable = this.hoveredPoint ? this.findReachableTile(this.hoveredPoint) : undefined

    if (this.mode === 'move' && hoveredReachable?.path.length) {
      telegraphKinds.add('move-path')
      this.overlayGraphics.lineStyle(4, 0xccecff, 0.4 + movePulse * 0.32)

      const pathPoints = hoveredReachable.path.map((point) =>
        this.projectTilePoint(point, this.runtime!.state.map.tiles[point.y][point.x].height),
      )

      for (let index = 1; index < pathPoints.length; index += 1) {
        this.overlayGraphics.lineBetween(
          pathPoints[index - 1].x,
          pathPoints[index - 1].y - 2,
          pathPoints[index].x,
          pathPoints[index].y - 2,
        )
      }

      for (const point of pathPoints) {
        this.overlayGraphics.fillStyle(0xf5f6f8, 0.4 + movePulse * 0.28)
        this.overlayGraphics.fillCircle(point.x, point.y - 2, 3.2)
      }
    }

    for (const point of actionRangeTiles) {
      telegraphKinds.add(this.mode === 'skill' ? 'skill-range' : 'attack-range')
      const height = this.runtime.state.map.tiles[point.y][point.x].height
      const diamond = this.projectTileDiamond(point, height)
      const fillColor = this.mode === 'skill' ? 0x864bb7 : 0xa31f2f
      const lineColor = this.mode === 'skill' ? 0xd9b7ff : 0xff7f6b
      this.overlayGraphics.fillStyle(fillColor, 0.1 + rangePulse * 0.16)
      this.overlayGraphics.fillPoints(diamond, true)
      this.overlayGraphics.lineStyle(1.5, lineColor, 0.4 + rangePulse * 0.32)
      this.overlayGraphics.strokePoints([...diamond, diamond[0]], true)
      this.overlayGraphics.lineBetween(diamond[0].x, diamond[0].y, diamond[2].x, diamond[2].y)
      this.overlayGraphics.lineBetween(diamond[1].x, diamond[1].y, diamond[3].x, diamond[3].y)
    }

    for (const option of this.targetOptions) {
      const unit = this.runtime.state.units[option.unitId]
      const height = this.runtime.state.map.tiles[unit.position.y][unit.position.x].height
      const diamond = this.projectTileDiamond(unit.position, height)
      const preview = buildTargetPreviewStrings(option.forecast, this.createCombatTextContext())
      const color = this.resolveMarkerToneColor(preview.markerTone)
      telegraphKinds.add('target-lock')
      this.overlayGraphics.fillStyle(color, 0.06 + targetPulse * 0.08)
      this.overlayGraphics.fillPoints(diamond, true)
      this.overlayGraphics.lineStyle(2 + targetPulse, color, 0.66 + targetPulse * 0.22)
      this.overlayGraphics.strokePoints([...diamond, diamond[0]], true)

      if (preview.telegraphSummary.lethal) {
        telegraphKinds.add('lethal')
        this.overlayGraphics.lineStyle(2, 0xf8efc1, 0.94)
        this.overlayGraphics.lineBetween(diamond[0].x, diamond[0].y - 10, diamond[0].x, diamond[0].y - 2)
        this.overlayGraphics.lineBetween(diamond[1].x + 10, diamond[1].y, diamond[1].x + 2, diamond[1].y)
        this.overlayGraphics.lineBetween(diamond[2].x, diamond[2].y + 10, diamond[2].x, diamond[2].y + 2)
        this.overlayGraphics.lineBetween(diamond[3].x - 10, diamond[3].y, diamond[3].x - 2, diamond[3].y)
      }

      if (preview.telegraphSummary.counterRisk > 0) {
        telegraphKinds.add('counter-risk')
        this.overlayGraphics.lineStyle(2, 0xd7525f, 0.74)
        this.overlayGraphics.lineBetween(diamond[3].x, diamond[3].y, diamond[0].x, diamond[0].y)
        this.overlayGraphics.lineBetween(diamond[0].x, diamond[0].y, diamond[1].x, diamond[1].y)
      }

      if (preview.telegraphSummary.pushOutcome !== 'none') {
        telegraphKinds.add('push')
        const world = this.projectTilePoint(unit.position, height)
        this.overlayGraphics.lineStyle(2, 0xf0c877, 0.68)
        this.overlayGraphics.lineBetween(world.x - 10, world.y - 16, world.x + 12, world.y - 16)
        this.overlayGraphics.lineBetween(world.x + 8, world.y - 20, world.x + 12, world.y - 16)
        this.overlayGraphics.lineBetween(world.x + 8, world.y - 12, world.x + 12, world.y - 16)
      }

      if (preview.telegraphSummary.predictedStatusIds.length > 0) {
        const world = this.projectTilePoint(unit.position, height)
        const statusColor = this.resolveToneColor(
          statusDefinitions[preview.telegraphSummary.predictedStatusIds[0]].presentation.tone,
        )
        this.overlayGraphics.lineStyle(2, statusColor, 0.76)
        this.overlayGraphics.strokeEllipse(world.x, world.y - 8, 42 + targetPulse * 6, 20 + targetPulse * 3)
        for (const statusId of preview.telegraphSummary.predictedStatusIds) {
          telegraphKinds.add(`status-${statusId}`)
        }
      }

      if (preview.telegraphSummary.terrainReactions.includes('forest-kindling')) {
        const world = this.projectTilePoint(unit.position, height)
        const forestColor = this.resolveTerrainReactionColor('forest-kindling')
        telegraphKinds.add('terrain-forest-kindling')
        this.overlayGraphics.lineStyle(2.5, forestColor, 0.86)
        this.overlayGraphics.strokeEllipse(world.x, world.y - 8, 48 + targetPulse * 8, 24 + targetPulse * 4)
        this.overlayGraphics.fillStyle(forestColor, 0.1 + targetPulse * 0.08)
        this.overlayGraphics.fillCircle(world.x, world.y - 8, 10 + targetPulse * 4)
      }

      if (preview.telegraphSummary.terrainReactions.includes('ruins-echo')) {
        const world = this.projectTilePoint(unit.position, height)
        const ruinsColor = this.resolveTerrainReactionColor('ruins-echo')
        telegraphKinds.add('terrain-ruins-echo')
        this.overlayGraphics.lineStyle(2, ruinsColor, 0.82)
        this.overlayGraphics.strokeCircle(world.x, world.y - 8, 20 + targetPulse * 8)
        this.overlayGraphics.strokeCircle(world.x, world.y - 8, 32 + targetPulse * 10)
      }

      if (preview.telegraphSummary.terrainReactions.includes('bridge-drop')) {
        const world = this.projectTilePoint(unit.position, height)
        const bridgeColor = this.resolveTerrainReactionColor('bridge-drop')
        const dropPoint = this.getBridgeDropPreviewPoint(active.position, unit.position)
        telegraphKinds.add('terrain-bridge-drop')
        this.overlayGraphics.lineStyle(2.5, bridgeColor, 0.9)
        this.overlayGraphics.strokePoints([...diamond, diamond[0]], true)
        this.overlayGraphics.strokeEllipse(world.x, world.y + 18, 44 + targetPulse * 8, 16 + targetPulse * 5)

        if (dropPoint) {
          const dropHeight = this.runtime.state.map.tiles[dropPoint.y][dropPoint.x].height
          const dropDiamond = this.projectTileDiamond(dropPoint, dropHeight)
          const dropWorld = this.projectTilePoint(dropPoint, dropHeight)
          this.overlayGraphics.fillStyle(bridgeColor, 0.12 + targetPulse * 0.08)
          this.overlayGraphics.fillPoints(dropDiamond, true)
          this.overlayGraphics.lineStyle(2, bridgeColor, 0.78)
          this.overlayGraphics.strokePoints([...dropDiamond, dropDiamond[0]], true)
          this.overlayGraphics.lineBetween(world.x, world.y - 4, dropWorld.x, dropWorld.y - 4)
          this.overlayGraphics.strokeCircle(dropWorld.x, dropWorld.y - 2, 12 + targetPulse * 6)
        }
      }
    }

    if (this.hoveredPoint) {
      const height = this.runtime.state.map.tiles[this.hoveredPoint.y][this.hoveredPoint.x].height
      const diamond = this.projectTileDiamond(this.hoveredPoint, height)
      const hoveredTargetOption = this.targetOptions.find((option) => samePoint(option.point, this.hoveredPoint!))
      const hoveredColor = hoveredTargetOption
        ? this.resolveMarkerToneColor(
            buildTargetPreviewStrings(hoveredTargetOption.forecast, this.createCombatTextContext()).markerTone,
          )
        : 0xf6dc9f
      this.overlayGraphics.lineStyle(2.5, hoveredColor, 0.96)
      this.overlayGraphics.strokePoints([...diamond, diamond[0]], true)

      if (hoveredTargetOption) {
        const actorWorld = this.projectTilePoint(active.position, this.getTileHeight(active.position))
        const targetWorld = this.projectTilePoint(this.hoveredPoint, height)
        telegraphKinds.add('target-focus')
        this.overlayGraphics.lineStyle(3, hoveredColor, 0.34 + targetPulse * 0.28)
        this.overlayGraphics.lineBetween(actorWorld.x, actorWorld.y - 10, targetWorld.x, targetWorld.y - 10)
        this.overlayGraphics.lineStyle(1.5, hoveredColor, 0.84)
        this.overlayGraphics.strokeCircle(targetWorld.x, targetWorld.y - 8, 22 + targetPulse * 10)
      }
    }

    const activeHeight = this.runtime.state.map.tiles[active.position.y][active.position.x].height
    const activeDiamond = this.projectTileDiamond(active.position, activeHeight)
    telegraphKinds.add('active-unit')
    this.overlayGraphics.fillStyle(
      active.team === 'allies' ? 0xf0b35f : 0xff9b7b,
      this.mode === 'move' ? 0.12 + movePulse * 0.06 : 0.16 + movePulse * 0.08,
    )
    this.overlayGraphics.fillPoints(activeDiamond, true)
    this.overlayGraphics.lineStyle(3, 0xf5d18c, 0.82 + movePulse * 0.18)
    this.overlayGraphics.strokePoints([...activeDiamond, activeDiamond[0]], true)
    const activeWorld = this.projectTilePoint(active.position, activeHeight)
    this.overlayGraphics.lineStyle(2, 0xf9f0c7, 0.3 + movePulse * 0.24)
    this.overlayGraphics.strokeEllipse(activeWorld.x, activeWorld.y + 12, 56 + movePulse * 10, 20 + movePulse * 4)

    if (this.actionFeedback) {
      const progress = Phaser.Math.Clamp(this.actionFeedback.elapsedMs / this.actionFeedback.durationMs, 0, 1)
      const pulse = Math.sin(progress * Math.PI)
      const sourceWorld = this.projectTilePoint(
        this.actionFeedback.sourcePoint,
        this.getTileHeight(this.actionFeedback.sourcePoint),
      )
      const targetWorld = this.projectTilePoint(
        this.actionFeedback.targetPoint,
        this.getTileHeight(this.actionFeedback.targetPoint),
      )
      const scale = this.resolveImpactScale(this.actionFeedback.impactWeight)

      telegraphKinds.add('impact-burst')
      this.overlayGraphics.lineStyle(4, this.actionFeedback.color, 0.24 + pulse * 0.4)
      this.overlayGraphics.lineBetween(sourceWorld.x, sourceWorld.y - 8, targetWorld.x, targetWorld.y - 8)
      this.overlayGraphics.fillStyle(this.actionFeedback.color, 0.12 + pulse * 0.18)
      this.overlayGraphics.fillCircle(targetWorld.x, targetWorld.y - 8, (18 + pulse * 22) * scale)
      this.overlayGraphics.lineStyle(2, this.actionFeedback.color, 0.68 + pulse * 0.2)
      this.overlayGraphics.strokeCircle(targetWorld.x, targetWorld.y - 8, (24 + pulse * 28) * scale)
    }

    this.activeTelegraphKinds = Array.from(telegraphKinds)
  }

  private publishHud(): void {
    if (!this.runtime) {
      return
    }

    const active = this.runtime.getActiveUnit()
    const combatText = this.createCombatTextContext()
    const latestMessage = this.runtime.state.messages[0]
      ? formatBattleFeedEntry(this.runtime.state.messages[0], combatText)
      : this.i18n.t(`hud.mode.${this.mode}`)

    const view: HudViewModel = {
      locale: this.i18n.getLocale(),
      phase: this.runtime.state.phase,
      mode: this.mode,
      layoutMode: this.viewportProfile.layoutMode,
      viewportProfile: this.viewportProfile,
      accessibilityState: this.accessibilityPreferences,
      activeUnitPanel: this.buildActiveUnitPanel(active),
      actionMenu: this.buildActionMenu(active),
      initiativeRail: {
        label: this.i18n.t('hud.initiative'),
        currentTurnLabel: this.i18n.t('hud.initiative.now'),
        entries: buildInitiativeEntries(
          this.runtime
            .getInitiativeOrder(Object.values(this.runtime.state.units).filter((unit) => !unit.defeated).length)
            .map((unit) => ({
              ...this.resolveUnitPresentation(unit),
              id: unit.id,
              name: this.i18n.t(unit.nameKey),
              team: unit.team,
              active: unit.id === active.id,
              selected: unit.id === this.selectedUnitId,
            })),
          this.i18n.t('hud.initiative.now'),
        ),
      },
      targetMarkers: this.buildTargetMarkers(),
      targetDetail: this.buildTargetDetail(),
      viewControls: this.buildViewControls(),
      accessiblePanel: this.buildAccessiblePanel(active, latestMessage),
      statusLine: {
        objectivePhaseLabel: this.buildObjectivePhaseProgressLabel(),
        objectiveLabel: this.i18n.t(this.runtime.state.objectiveKey),
        modeLabel: this.i18n.t(`hud.mode.${this.mode}`),
        logLabel: latestMessage,
        phaseLabel:
          this.runtime.state.phase === 'active'
            ? `${this.i18n.t('hud.currentTurn')}: ${this.i18n.t(`hud.team.${active.team}`)}`
            : this.i18n.t(`hud.phase.${this.runtime.state.phase}`),
      },
      phaseAnnouncement: this.phaseAnnouncementKey
        ? {
            label: this.i18n.t('hud.phaseUpdate'),
            body: this.i18n.t(this.phaseAnnouncementKey),
            cueId: this.phaseAnnouncementCueId,
          }
        : undefined,
      modal: this.currentModal,
    }

    this.uiBus.emit('hud:update', view)
    this.emitTelemetry()
  }

  private emitTelemetry(): void {
    if (!this.runtime) {
      return
    }

    const active = this.runtime.getActiveUnit()
    const camera = this.cameras.main

    this.uiBus.emit('telemetry:update', {
      mapId: this.runtime.definition.mapId,
      boardProjection: {
        origin: { x: this.projectionOrigin.x, y: this.projectionOrigin.y },
        tileWidth: TILE_WIDTH,
        tileHeight: TILE_HEIGHT,
        heightStep: HEIGHT_STEP,
        mapWidth: this.runtime.state.map.width,
        mapHeight: this.runtime.state.map.height,
      },
      phase: this.runtime.state.phase,
      mode: this.mode,
      activeUnitId: active.id,
      selectedUnitId: this.selectedUnitId,
      hoveredTile: this.hoveredPoint,
      reachableTiles: this.reachableTiles.map((tile) => tile.point),
      actionRangeTiles: this.getActionRangeTiles(),
      targetableUnitIds: this.targetOptions.map((option) => option.unitId),
      objectivePhaseId: this.runtime.state.objectivePhaseId,
      activeStatusAuraIds: Array.from(
        new Set(
          Object.values(this.runtime.state.units).flatMap((unit) => unit.statuses.map((status) => status.id)),
        ),
      ),
      activeTelegraphKinds: this.activeTelegraphKinds,
      units: Object.values(this.runtime.state.units).map((unit) => ({
        ...this.resolveUnitPresentation(unit),
        id: unit.id,
        name: this.i18n.t(unit.nameKey),
        team: unit.team,
        hp: unit.hp,
        maxHp: classDefinitions[unit.classId].stats.maxHp,
        position: unit.position,
        statuses: unit.statuses.map((status) => ({
          id: status.id,
          label: this.i18n.t(statusDefinitions[status.id].labelKey),
          stacks: status.stacks,
          duration: status.duration,
        })),
        defeated: unit.defeated,
      })),
      modal: this.currentModal,
      camera: {
        rotationQuarterTurns: this.viewState.rotationQuarterTurns,
        zoom: this.viewState.zoom,
        panModeActive: this.viewState.panModeActive,
        scrollX: Math.round(camera.scrollX * 100) / 100,
        scrollY: Math.round(camera.scrollY * 100) / 100,
      },
      duel: this.duelTelemetry,
      layoutMode: this.viewportProfile.layoutMode,
      viewportProfile: this.viewportProfile,
      accessibilityState: this.accessibilityPreferences,
    })
  }

  private createCombatTextContext(): {
    t: (key: string, params?: Record<string, string | number>) => string
    getUnitName: (unitId: string) => string
  } {
    return createSceneCombatTextContext({
      t: this.i18n.t.bind(this.i18n),
      getUnitName: (unitId: string) => this.i18n.t(this.runtime?.getUnit(unitId)?.nameKey ?? unitId),
    })
  }

  private resolveUnitPresentation(unit: Pick<UnitState, 'classId'>) {
    return resolveSceneUnitPresentation(this.i18n.t.bind(this.i18n), unit)
  }

  private buildActiveUnitPanel(unit: UnitState): HudViewModel['activeUnitPanel'] {
    return buildActiveUnitPanelModel({
      t: this.i18n.t.bind(this.i18n),
      unit,
    })
  }

  private buildActionMenu(unit: UnitState): HudViewModel['actionMenu'] {
    const interactive = this.isPlayerTurnInteractive()
    const anchor =
      this.viewportProfile.layoutMode === 'desktop'
        ? this.buildUnitAnchor(unit, 'above-right', { x: 0, y: -46 })
        : undefined

    return buildActionMenuModel({
      t: this.i18n.t.bind(this.i18n),
      layoutMode: this.viewportProfile.layoutMode,
      mode: this.mode,
      interactive,
      anchor,
      canMove: !unit.hasActedThisTurn && this.moveRangeTiles.length > 0,
      canAttack:
        interactive &&
        this.runtime?.getTargetsForAction({ actorId: unit.id, kind: 'attack' }).length !== 0,
      canSkill:
        interactive &&
        this.runtime?.getTargetsForAction({
          actorId: unit.id,
          kind: 'skill',
          skillId: classDefinitions[unit.classId].signatureSkillId,
        }).length !== 0,
      avoidClientPoints: this.buildActionMenuAvoidPoints(),
    })
  }

  private buildActionMenuAvoidPoints(): Array<{ clientX: number; clientY: number }> {
    if (!this.runtime) {
      return []
    }

    const points =
      this.mode === 'move'
        ? this.reachableTiles.map((tile) => tile.point)
        : this.mode === 'attack' || this.mode === 'skill'
          ? this.targetOptions
              .map((option) => this.runtime?.state.units[option.unitId]?.position)
              .filter((point): point is GridPoint => Boolean(point))
          : []

    const seen = new Set<string>()

    return points.flatMap((point) => {
      const key = `${point.x},${point.y}`

      if (seen.has(key)) {
        return []
      }

      seen.add(key)
      const clientPoint = this.projectGridPointToClient(point)

      return clientPoint
        ? [
            {
              clientX: clientPoint.clientX,
              clientY: clientPoint.clientY,
            },
          ]
        : []
    })
  }

  private buildTargetMarkers(): HudViewModel['targetMarkers'] {
    if (!this.runtime) {
      return []
    }

    const hoveredUnitId = this.hoveredPoint ? this.findUnitAt(this.hoveredPoint)?.id : undefined

    return buildTargetMarkersModel({
      targetOptions: this.targetOptions,
      hoveredUnitId,
      getUnitById: (unitId) => this.runtime?.state.units[unitId],
      buildAnchor: (unit) => this.buildUnitAnchor(unit, 'above', { x: 0, y: -34 }),
      combatText: this.createCombatTextContext(),
    })
  }

  private buildTargetDetail(): HudViewModel['targetDetail'] {
    if (!this.runtime || !this.hoveredPoint) {
      return undefined
    }

    const active = this.runtime.getActiveUnit()
    const hoveredUnit = this.findUnitAt(this.hoveredPoint)

    if (!hoveredUnit) {
      return undefined
    }

    const target = this.targetOptions.find((option) => option.unitId === hoveredUnit.id)

    if (!target) {
      return undefined
    }

    const presentation = this.viewportProfile.layoutMode === 'mobile-portrait' ? 'sheet' : 'anchored'
    const anchor =
      presentation === 'anchored'
        ? this.buildUnitAnchor(
            hoveredUnit,
            this.resolveTargetDetailPlacement(active.position, hoveredUnit.position),
            { x: 0, y: -42 },
          )
        : undefined

    if (presentation === 'anchored' && !anchor) {
      return undefined
    }

    return buildTargetDetailModel({
      t: this.i18n.t.bind(this.i18n),
      hoveredUnit,
      target,
      presentation,
      anchor,
      combatText: this.createCombatTextContext(),
    })
  }

  private resolveTargetDetailPlacement(
    activePoint: GridPoint,
    targetPoint: GridPoint,
  ): HudAnchor['preferredPlacement'] {
    return resolveSceneTargetDetailPlacement(activePoint, targetPoint)
  }

  private buildCommandButtons(): NonNullable<HudViewModel['actionMenu']>['buttons'] {
    if (!this.runtime) {
      return []
    }

    const active = this.runtime.getActiveUnit()
    const interactive = !this.currentModal && this.runtime.state.phase === 'active' && active.team === 'allies' && this.mode !== 'busy'
    const attackTargets = interactive ? this.runtime.getTargetsForAction({ actorId: active.id, kind: 'attack' }) : []
    const skillTargets = interactive
      ? this.runtime.getTargetsForAction({
          actorId: active.id,
          kind: 'skill',
          skillId: classDefinitions[active.classId].signatureSkillId,
        })
      : []

    return buildCommandButtons({
      interactive,
      mode: this.mode,
      canMove: !active.hasActedThisTurn && this.moveRangeTiles.length > 0,
      canAttack: attackTargets.length > 0,
      canSkill: skillTargets.length > 0,
      labels: {
        move: this.i18n.t('hud.action.move'),
        attack: this.i18n.t('hud.action.attack'),
        skill: this.i18n.t('hud.action.skill'),
        wait: this.i18n.t('hud.action.wait'),
        cancel: this.i18n.t('hud.action.cancel'),
      },
    })
  }

  private buildViewControls(): HudViewModel['viewControls'] {
    return buildViewControlsModel({
      t: this.i18n.t.bind(this.i18n),
      zoom: this.viewState.zoom,
      panModeActive: this.viewState.panModeActive,
      layoutMode: this.viewportProfile.layoutMode,
      phase: this.runtime?.state.phase ?? 'briefing',
    })
  }

  private buildAccessiblePanel(
    active: UnitState,
    latestMessage: string,
  ): HudViewModel['accessiblePanel'] {
    const options = this.buildAccessibleOptions()

    return buildAccessiblePanelModel({
      t: this.i18n.t.bind(this.i18n),
      active,
      objectiveKey: this.runtime?.state.objectiveKey ?? 'battle.glenmoorPass.objective',
      latestMessage,
      commandButtons: this.buildCommandButtons().filter((button) => !button.disabled),
      options,
      mode: this.mode,
      modal: this.currentModal,
      phaseAnnouncementKey: this.phaseAnnouncementKey,
    })
  }

  private buildAccessibleOptions(): HudViewModel['accessiblePanel']['options'] {
    if (!this.runtime) {
      return []
    }

    return buildAccessibleOptionsModel({
      t: this.i18n.t.bind(this.i18n),
      mode: this.mode,
      reachableTiles: this.reachableTiles,
      targetOptions: this.targetOptions,
      mapTiles: this.runtime.state.map.tiles,
      getUnitById: (unitId) => this.runtime?.state.units[unitId],
      combatText: this.createCombatTextContext(),
    })
  }

  private buildUnitAnchor(
    unit: UnitState,
    preferredPlacement: HudAnchor['preferredPlacement'],
    offset: { x: number; y: number },
  ): HudAnchor | undefined {
    if (!this.runtime) {
      return undefined
    }

    const tile = this.runtime.state.map.tiles[unit.position.y]?.[unit.position.x]

    if (!tile) {
      return undefined
    }

    return buildSceneUnitAnchor({
      point: unit.position,
      tileHeight: tile.height,
      projection: this.getProjectionOptions(),
      preferredPlacement,
      offset,
      cameraScrollX: this.cameras.main.scrollX,
      cameraScrollY: this.cameras.main.scrollY,
      cameraZoom: this.cameras.main.zoom,
      cameraWidth: this.cameras.main.width,
      cameraHeight: this.cameras.main.height,
      canvasBounds: this.game.canvas.getBoundingClientRect(),
    })
  }

  private projectGridPointToClient(point: GridPoint): { clientX: number; clientY: number } | undefined {
    if (!this.runtime) {
      return undefined
    }

    const tile = this.runtime.state.map.tiles[point.y]?.[point.x]

    if (!tile) {
      return undefined
    }

    return projectSceneGridPointToClient({
      point,
      tileHeight: tile.height,
      projection: this.getProjectionOptions(),
      cameraScrollX: this.cameras.main.scrollX,
      cameraScrollY: this.cameras.main.scrollY,
      cameraZoom: this.cameras.main.zoom,
      cameraWidth: this.cameras.main.width,
      cameraHeight: this.cameras.main.height,
      canvasBounds: this.game.canvas.getBoundingClientRect(),
    })
  }

  private getActionRangeTiles(): GridPoint[] {
    if (!this.runtime || (this.mode !== 'attack' && this.mode !== 'skill')) {
      return []
    }

    const active = this.runtime.getActiveUnit()
    const range =
      this.mode === 'attack'
        ? {
            min: classDefinitions[active.classId].basicAttackRangeMin,
            max: classDefinitions[active.classId].basicAttackRangeMax,
          }
        : (() => {
            const skillId = classDefinitions[active.classId].signatureSkillId
            const skill = skillDefinitions[skillId]

            return {
              min: skill.rangeMin,
              max: skill.rangeMax,
            }
          })()

    return buildRangeTiles(active.position, range.min, range.max, {
      width: this.runtime.state.map.width,
      height: this.runtime.state.map.height,
    })
  }

  private buildModal(kind: 'briefing' | 'victory' | 'defeat'): HudViewModel['modal'] {
    if (!this.runtime) {
      return undefined
    }

    return buildModalModel({
      t: this.i18n.t.bind(this.i18n),
      kind,
      titleKey: this.runtime.definition.titleKey,
      briefingKey: this.runtime.state.briefingKey,
      victoryKey: this.runtime.state.victoryKey,
      defeatKey: this.runtime.state.defeatKey,
      objectiveKey: this.runtime.state.objectiveKey,
      objectivePhaseLabel: this.buildObjectivePhaseProgressLabel(),
    })
  }

  private getCurrentObjectivePhase(): NonNullable<NonNullable<BattleRuntime['definition']['objectivePhases']>[number]> | undefined {
    if (!this.runtime) {
      return undefined
    }

    return this.runtime.definition.objectivePhases?.find(
      (phase) => phase.id === this.runtime!.state.objectivePhaseId,
    )
  }

  private buildObjectivePhaseProgressLabel(): string {
    if (!this.runtime) {
      return ''
    }

    return buildSceneObjectivePhaseProgressLabel({
      t: this.i18n.t.bind(this.i18n),
      phases: this.runtime.definition.objectivePhases ?? [],
      activePhaseId: this.runtime.state.objectivePhaseId,
    })
  }

  private updateObjectiveAnnouncement(previousObjectivePhaseId?: string): void {
    if (!this.runtime || !previousObjectivePhaseId || previousObjectivePhaseId === this.runtime.state.objectivePhaseId) {
      return
    }

    const phase = this.getCurrentObjectivePhase()

    this.phaseAnnouncementKey = phase?.announcementKey ?? this.runtime.state.objectiveKey
    this.phaseAnnouncementCueId = phase?.announcementCueId
    this.phaseAnnouncementMs = 1800
    this.publishHud()
  }

  private resolvePhaseFocusUnit(): string | undefined {
    if (!this.runtime) {
      return undefined
    }

    if (this.pendingReinforcementIds.length > 0) {
      return this.pendingReinforcementIds[0]
    }

    const phase = this.getCurrentObjectivePhase()
    const defeatTarget = phase?.victoryConditions.find((condition) => condition.type === 'defeat-unit')
    return defeatTarget?.type === 'defeat-unit' ? defeatTarget.unitId : undefined
  }

  private startPhaseSequence(previousObjectivePhaseId?: string): boolean {
    if (!this.runtime || !previousObjectivePhaseId || previousObjectivePhaseId === this.runtime.state.objectivePhaseId) {
      return false
    }

    this.updateObjectiveAnnouncement(previousObjectivePhaseId)

    const focusUnitId = this.resolvePhaseFocusUnit()
    const focusUnit = focusUnitId ? this.runtime.getUnit(focusUnitId) : undefined
    const focusScroll = focusUnit ? this.computeCameraFocusScroll(focusUnit.position) : undefined

    if (this.phaseAnnouncementCueId) {
      this.playCueSfx(this.phaseAnnouncementCueId, { volume: 0.24 })
    }

    if (!focusScroll) {
      this.syncPresentationFromActiveUnit(true)
      return true
    }

    const camera = this.cameras.main
    this.phaseSequence = {
      elapsedMs: 0,
      durationMs: 780,
      focusUnitId,
      returnScrollX: camera.scrollX,
      returnScrollY: camera.scrollY,
      focusScrollX: focusScroll.x,
      focusScrollY: focusScroll.y,
    }
    this.mode = 'busy'
    this.refreshPresentation()
    return true
  }

  private buildActionFeedback(resolution: CombatResolution): ActionFeedbackState | undefined {
    const step = resolution.presentation?.steps.find((candidate) =>
      candidate.kind === 'hit' ||
      candidate.kind === 'status' ||
      candidate.kind === 'push' ||
      candidate.kind === 'counter' ||
      candidate.kind === 'defeat',
    )

    if (!step) {
      return undefined
    }

    return {
      elapsedMs: 0,
      durationMs: 96,
      sourcePoint: step.sourcePoint,
      targetPoint: step.targetPoint,
      color: this.resolveCueColor(step.fxCueId),
      impactWeight: step.impactWeight,
    }
  }

  private playActionCommitCue(resolution: CombatResolution): void {
    const step = resolution.presentation?.steps.find((candidate) =>
      candidate.kind === 'cast' ||
      candidate.kind === 'hit' ||
      candidate.kind === 'status' ||
      candidate.kind === 'counter',
    )

    if (!step) {
      return
    }

    this.playCueSfx(step.sfxCueId, {
      volume: step.kind === 'cast' ? 0.12 : 0.16,
    })
  }

  private placeUnit(unitId: string, point: GridPoint, hp: number): void {
    if (!this.runtime) {
      return
    }

    const unit = this.runtime.state.units[unitId]
    unit.position = point
    unit.hp = Math.max(0, hp)
    unit.defeated = hp <= 0
  }

  private playSfx(key: string, config: Phaser.Types.Sound.SoundConfig = {}): void {
    if (!this.cache.audio.exists(`sfx:${key}`)) {
      return
    }

    this.sound.play(`sfx:${key}`, {
      volume: 0.22,
      ...config,
    })
  }

  private playCueSfx(key: string, config: Phaser.Types.Sound.SoundConfig = {}): void {
    const cueConfig: Record<string, Phaser.Types.Sound.SoundConfig> = {
      'melee-light': { volume: 0.17, rate: 1.16 },
      'melee-heavy': { volume: 0.22, rate: 0.94 },
      'ranged-shot': { volume: 0.18, rate: 1.08 },
      'magic-cast': { volume: 0.18, rate: 0.98 },
      heal: { volume: 0.16, rate: 1.05 },
      counter: { volume: 0.2, rate: 1.12 },
      'phase-shift': { volume: 0.24, rate: 1.02 },
      'kill-confirm': { volume: 0.24, rate: 0.92 },
    }

    this.playSfx(key, {
      ...(cueConfig[key] ?? {}),
      ...config,
    })
  }

  private ensureBattleMusic(): void {
    if (!this.cache.audio.exists('music:battle')) {
      return
    }

    if (!this.battleMusic) {
      this.battleMusic = this.sound.add('music:battle', {
        loop: true,
        volume: 0.2,
      })
    }

    if (!this.battleMusic.isPlaying) {
      this.battleMusic.play()
    }
  }

  private isPlayerTurnInteractive(): boolean {
    return Boolean(
      this.runtime &&
        this.runtime.state.phase === 'active' &&
        this.runtime.getActiveUnit().team === 'allies' &&
        !this.currentModal &&
        this.mode !== 'busy',
    )
  }

  private enterMoveMode(): void {
    if (!this.runtime || !this.isPlayerTurnInteractive()) {
      return
    }

    const active = this.runtime.getActiveUnit()

    if (active.hasActedThisTurn) {
      return
    }

    if (this.moveRangeTiles.length === 0) {
      this.moveRangeTiles = this.runtime.getReachableTiles(active.id)
    }

    this.selectedUnitId = active.id
    this.mode = 'move'
    this.reachableTiles = this.moveRangeTiles
    this.targetOptions = []
    this.refreshPresentation()
  }

  private syncPresentationFromActiveUnit(autoOpenMove: boolean): void {
    if (!this.runtime) {
      return
    }

    const active = this.runtime.getActiveUnit()
    this.selectedUnitId = active.id
    this.hoveredPoint = undefined
    this.targetOptions = []
    this.moveRangeTiles =
      this.runtime.state.phase === 'active' && active.team === 'allies' && !active.hasActedThisTurn
        ? this.runtime.getReachableTiles(active.id)
        : []
    this.mode = autoOpenMove
      ? resolveActiveTurnMode({
          phase: this.runtime.state.phase,
          activeTeam: active.team,
          activeHasMoved: active.hasMovedThisTurn,
          activeHasActed: active.hasActedThisTurn,
        })
      : 'idle'
    this.reachableTiles = this.mode === 'move' ? this.moveRangeTiles : []
    if (this.viewportProfile.layoutMode !== 'desktop' && this.lastCameraFocusUnitId !== active.id) {
      this.focusCameraOnPoint(active.position)
      this.lastCameraFocusUnitId = active.id
    }
    this.refreshPresentation()
  }

  private handleUnitClick(unit: UnitState): void {
    if (!this.runtime || this.currentModal || this.mode === 'busy') {
      return
    }

    if (this.mode === 'move') {
      return
    }

    if (this.mode === 'attack' || this.mode === 'skill') {
      this.handleTargetUnitClick(unit)
      return
    }

    const active = this.runtime.getActiveUnit()
    const action = resolveIdleUnitSelection({
      phase: this.runtime.state.phase,
      mode: this.mode,
      activeTeam: active.team,
      activeUnitId: active.id,
      clickedUnitId: unit.id,
      activeHasMoved: active.hasMovedThisTurn,
      activeHasActed: active.hasActedThisTurn,
    })

    if (action === 'ignore') {
      return
    }

    this.selectedUnitId = unit.id
    this.reachableTiles = []
    this.targetOptions = []

    if (action === 'enter-move') {
      this.enterMoveMode()
      return
    }

    this.refreshPresentation()
  }

  private handleMoveModeTileClick(point: GridPoint, occupant?: UnitState): void {
    if (!this.runtime) {
      return
    }

    const active = this.runtime.getActiveUnit()
    const allowed = this.moveRangeTiles.map((tile) => tile.point)

    if (occupant || samePoint(point, active.position)) {
      this.lastDebugInput = {
        source: 'move-mode-tile-click',
        point,
        occupant: occupant?.id,
        activePosition: active.position,
        moved: false,
        reason: occupant ? 'occupied' : 'same-point',
      }
      return
    }

    const moved = this.runtime.repositionActiveUnit(point, allowed)
    this.lastDebugInput = {
      source: 'move-mode-tile-click',
      point,
      activePosition: active.position,
      allowed,
      moved,
    }

    if (moved) {
      this.playSfx('move', { volume: 0.18 })
      this.mode = 'move'
      this.reachableTiles = this.moveRangeTiles
      this.targetOptions = []
      this.selectedUnitId = active.id
      this.refreshPresentation()
      return
    }

    this.refreshPresentation()
  }

  private handleTargetUnitClick(unit: UnitState): void {
    if (!this.runtime || (this.mode !== 'attack' && this.mode !== 'skill')) {
      return
    }

    const forecast = this.targetOptions.find((option) => option.unitId === unit.id)

    if (!forecast) {
      return
    }

    this.playSfx('select', { volume: 0.18 })
    this.resolveAction({
      actorId: this.runtime.getActiveUnit().id,
      kind: this.mode === 'attack' ? 'attack' : 'skill',
      skillId:
        this.mode === 'skill'
          ? classDefinitions[this.runtime.getActiveUnit().classId].signatureSkillId
          : undefined,
      targetId: unit.id,
    })
  }

  public debugInspectClientPoint(clientX: number, clientY: number): Array<{
    name: string
    type: string
    x: number
    y: number
    depth: number
  }> {
    const camera = this.cameras.main
    const pointer = this.input.activePointer
    const canvasBounds = this.game.canvas.getBoundingClientRect()
    const scaledX = (clientX - canvasBounds.left) * (camera.width / canvasBounds.width)
    const scaledY = (clientY - canvasBounds.top) * (camera.height / canvasBounds.height)
    const previous = { x: pointer.x, y: pointer.y, worldX: pointer.worldX, worldY: pointer.worldY }

    pointer.x = scaledX
    pointer.y = scaledY
    pointer.worldX = scaledX / camera.zoom + camera.scrollX
    pointer.worldY = scaledY / camera.zoom + camera.scrollY
    pointer.camera = camera

    const hits = this.input.hitTestPointer(pointer)
      .map((gameObject) => {
        const positioned = gameObject as Phaser.GameObjects.GameObject & {
          x?: number
          y?: number
          depth?: number
        }

        return {
          name: gameObject.name || gameObject.type,
          type: gameObject.type,
          x: Math.round((positioned.x ?? 0) * 100) / 100,
          y: Math.round((positioned.y ?? 0) * 100) / 100,
          depth: positioned.depth ?? 0,
        }
      })

    pointer.x = previous.x
    pointer.y = previous.y
    pointer.worldX = previous.worldX
    pointer.worldY = previous.worldY

    return hits
  }

  public debugGetLastInput(): Record<string, unknown> {
    return this.lastDebugInput
  }
}
