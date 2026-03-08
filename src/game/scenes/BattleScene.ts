import Phaser from 'phaser'
import {
  BATTLE_DRAG_THRESHOLD_PX,
  DEFAULT_BATTLE_ZOOM,
  MAX_BATTLE_ZOOM,
  MIN_BATTLE_ZOOM,
  quarterTurnsToDegrees,
  rotateQuarterTurns,
  stepBattleZoom,
  type RotationQuarterTurns,
} from '../battle-camera'
import {
  buildInitiativeEntries,
  resolveActiveTurnMode,
  resolveIdleUnitSelection,
} from '../battle-ui-model'
import { classDefinitions, statusDefinitions, terrainDefinitions } from '../content'
import {
  BOARD_ORIGIN,
  HEIGHT_STEP,
  TILE_HEIGHT,
  TILE_WIDTH,
  type ProjectionOptions,
  tileDiamond,
  tileToWorld,
} from '../iso'
import { I18n } from '../i18n'
import { buildCombatForecastLines, formatBattleFeedEntry } from '../combat-text'
import { BattleRuntime } from '../runtime'
import type {
  ActionTarget,
  BattleAction,
  GridPoint,
  HudViewModel,
  Locale,
  ReachableTile,
  TiledMapData,
  UnitState,
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

export class BattleScene extends Phaser.Scene {
  private readonly uiBus: Phaser.Events.EventEmitter
  private readonly i18n: I18n
  private runtime?: BattleRuntime
  private battlefieldZone?: Phaser.GameObjects.Zone
  private mapGraphics?: Phaser.GameObjects.Graphics
  private overlayGraphics?: Phaser.GameObjects.Graphics
  private tileZones = new Map<string, Phaser.GameObjects.Zone>()
  private unitContainers = new Map<string, Phaser.GameObjects.Container>()
  private hoveredPoint?: GridPoint
  private selectedUnitId?: string
  private mode: HudViewModel['mode'] = 'idle'
  private moveRangeTiles: ReachableTile[] = []
  private reachableTiles: ReachableTile[] = []
  private targetOptions: ActionTarget[] = []
  private pendingAiDelayMs = 0
  private debugAdvanceMs = 0
  private lastActiveUnitId?: string
  private currentModal?: HudViewModel['modal']
  private duelTelemetry = {
    active: false,
    stepIndex: 0,
    stepCount: 0,
    actionLabel: '',
    fastMode: false,
  }
  private mapData?: TiledMapData
  private cameraBounds?: Phaser.Geom.Rectangle
  private pointerState?: BattlefieldPointerState
  private viewState: {
    rotationQuarterTurns: RotationQuarterTurns
    zoom: number
    panModeActive: boolean
  } = {
    rotationQuarterTurns: 0,
    zoom: DEFAULT_BATTLE_ZOOM,
    panModeActive: false,
  }

  constructor(uiBus: Phaser.Events.EventEmitter, i18n: I18n) {
    super('battle')
    this.uiBus = uiBus
    this.i18n = i18n
  }

  create(): void {
    this.mapData = this.cache.json.get('map:glenmoor-pass') as TiledMapData
    this.runtime = new BattleRuntime(this.mapData)
    this.resetViewState()
    this.registerBattlefieldInput()
    this.createBattlefieldZone()
    this.mapGraphics = this.add.graphics()
    this.overlayGraphics = this.add.graphics()

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

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.uiBus.off('hud:command', this.handleHudCommand, this)
      this.uiBus.off('hud:locale', this.handleLocaleChange, this)
      this.uiBus.off('duel:complete', this.handleDuelComplete, this)
      this.uiBus.off('duel:telemetry', this.handleDuelTelemetry, this)
      this.uiBus.off('debug:advance', this.handleDebugAdvance, this)
      this.uiBus.off('debug:tile-click', this.handleDebugTileClick, this)
      this.uiBus.off('debug:stage', this.handleDebugStage, this)
      this.input.off('pointermove', this.handlePointerMove, this)
      this.input.off('pointerup', this.handlePointerUp, this)
      this.input.off('gameout', this.handlePointerCancel, this)
      this.input.off('wheel', this.handleWheel, this)
    })

    this.refreshPresentation()
  }

  update(_time: number, delta: number): void {
    if (!this.runtime || this.currentModal || this.mode === 'busy' || this.runtime.state.phase !== 'active') {
      return
    }

    const active = this.runtime.getActiveUnit()
    const effectiveDelta = delta + this.debugAdvanceMs
    this.debugAdvanceMs = 0

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

  private resetViewState(): void {
    this.viewState = {
      rotationQuarterTurns: 0,
      zoom: DEFAULT_BATTLE_ZOOM,
      panModeActive: false,
    }
    this.pointerState = undefined
  }

  private registerBattlefieldInput(): void {
    this.input.on('pointermove', this.handlePointerMove, this)
    this.input.on('pointerup', this.handlePointerUp, this)
    this.input.on('gameout', this.handlePointerCancel, this)
    this.input.on('wheel', this.handleWheel, this)
  }

  private getProjectionOptions(): ProjectionOptions {
    return {
      rotationQuarterTurns: this.viewState.rotationQuarterTurns,
      mapWidth: this.runtime?.state.map.width,
      mapHeight: this.runtime?.state.map.height,
      origin: BOARD_ORIGIN,
    }
  }

  private projectTilePoint(point: GridPoint, height = 0): { x: number; y: number } {
    return tileToWorld(point, height, this.getProjectionOptions())
  }

  private projectTileDiamond(point: GridPoint, height = 0): { x: number; y: number }[] {
    return tileDiamond(point, height, this.getProjectionOptions())
  }

  private createBattlefieldZone(): void {
    this.battlefieldZone = this.add.zone(this.scale.width / 2, this.scale.height / 2, 4096, 4096)
    this.battlefieldZone.setInteractive({ cursor: 'grab' })
    this.battlefieldZone.setDepth(-1000)
    this.battlefieldZone.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
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

  private handlePointerMove(pointer: Phaser.Input.Pointer): void {
    if (!this.pointerState || pointer.id !== this.pointerState.pointerId) {
      return
    }

    const camera = this.cameras.main
    const dx = pointer.x - this.pointerState.startX
    const dy = pointer.y - this.pointerState.startY
    const distance = Math.hypot(dx, dy)
    const shouldPan = this.viewState.panModeActive || distance >= BATTLE_DRAG_THRESHOLD_PX

    if (!shouldPan) {
      return
    }

    this.pointerState.isDragging = true
    camera.setScroll(
      this.pointerState.startScrollX - dx / camera.zoom,
      this.pointerState.startScrollY - dy / camera.zoom,
    )
    this.clampCameraScroll()
    this.hoveredPoint = undefined
    this.drawOverlays()
    this.updateBattlefieldCursor(true)
  }

  private handlePointerUp(pointer: Phaser.Input.Pointer): void {
    this.finishPointerGesture(pointer, false)
  }

  private handlePointerCancel(): void {
    this.pointerState = undefined
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

    if (state.isDragging || cancelled) {
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
    camera.setZoom(this.viewState.zoom)
    this.syncTileInputs()
    this.updateCameraBounds(recenter)
    this.updateBattlefieldCursor(false)
    this.emitTelemetry()
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
      camera.centerOn(
        this.cameraBounds.x + this.cameraBounds.width / 2,
        this.cameraBounds.y + this.cameraBounds.height / 2,
      )
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

  private handleHudCommand(command: string): void {
    if (!this.runtime) {
      return
    }

    if (command.startsWith('view-')) {
      this.handleViewCommand(command)
      return
    }

    if (command === 'start-battle') {
      this.currentModal = undefined
      this.runtime.startBattle()
      this.syncPresentationFromActiveUnit(true)
      return
    }

    if (command === 'restart-battle') {
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
      this.enterMoveMode()
      return
    }

    if (command === 'attack') {
      this.mode = 'attack'
      this.targetOptions = this.runtime.getTargetsForAction({ actorId: active.id, kind: 'attack' })
      this.reachableTiles = []
      this.refreshPresentation()
      return
    }

    if (command === 'skill') {
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
      this.resolveAction({ actorId: active.id, kind: 'wait' })
      return
    }

    if (command === 'cancel') {
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

  private handleViewCommand(command: string): void {
    if (command === 'view-rotate-left') {
      this.viewState.rotationQuarterTurns = rotateQuarterTurns(this.viewState.rotationQuarterTurns, -1)
      this.pointerState = undefined
      this.applyCameraView(false)
      this.refreshPresentation()
      return
    }

    if (command === 'view-rotate-right') {
      this.viewState.rotationQuarterTurns = rotateQuarterTurns(this.viewState.rotationQuarterTurns, 1)
      this.pointerState = undefined
      this.applyCameraView(false)
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
    }
  }

  private handleLocaleChange(locale: Locale): void {
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
    }
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
    if (!this.runtime) {
      return
    }

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
    this.currentModal = undefined

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

    if (stage === 'push-demo') {
      this.placeUnit('rowan', { x: 0, y: 1 }, 30)
      this.placeUnit('brigandCaptain', { x: 0, y: 0 }, 24)
      this.runtime.state.activeUnitId = 'rowan'
    }

    if (stage === 'victory-demo') {
      for (const enemy of ['huntmaster', 'hexbinder', 'shieldbearer', 'cutpurse', 'fanatic']) {
        this.placeUnit(enemy, this.runtime.state.units[enemy].position, 0)
      }
      this.placeUnit('rowan', { x: 7, y: 8 }, 18)
      this.placeUnit('brigandCaptain', { x: 7, y: 7 }, 5)
      this.runtime.state.activeUnitId = 'rowan'
    }

    this.lastActiveUnitId = undefined
    this.pendingAiDelayMs = 0
    this.syncPresentationFromActiveUnit(true)
  }

  private resetBattle(): void {
    if (!this.runtime || !this.mapData) {
      return
    }

    this.runtime.reset(this.mapData)
    this.resetViewState()
    this.currentModal = this.buildModal('briefing')
    this.lastActiveUnitId = undefined
    this.pendingAiDelayMs = 0
    this.applyCameraView(true)
    this.syncUnits()
    this.syncPresentationFromActiveUnit(false)
  }

  private resolveAction(action: BattleAction): void {
    if (!this.runtime) {
      return
    }

    this.mode = 'busy'
    this.reachableTiles = []
    this.targetOptions = []
    const resolution = this.runtime.commitAction(action)
    this.syncUnits()

    if (action.kind === 'wait') {
      this.finalizeTurnTransition()
      return
    }

    this.scene.launch('duel', {
      resolution,
      locale: this.i18n.getLocale(),
    })
    this.scene.bringToTop('duel')
    this.refreshPresentation()
  }

  private finalizeTurnTransition(): void {
    if (!this.runtime) {
      return
    }

    if (this.runtime.state.phase === 'victory') {
      this.currentModal = this.buildModal('victory')
      this.syncPresentationFromActiveUnit(false)
    } else if (this.runtime.state.phase === 'defeat') {
      this.currentModal = this.buildModal('defeat')
      this.syncPresentationFromActiveUnit(false)
    } else {
      this.currentModal = undefined
      this.syncPresentationFromActiveUnit(true)
    }
  }

  private createTileInputs(): void {
    if (!this.runtime) {
      return
    }

    for (const row of this.runtime.state.map.tiles) {
      for (const tile of row) {
        const zone = this.add.zone(0, 0, TILE_WIDTH * 0.72, TILE_HEIGHT * 0.78)
        zone.setInteractive({ cursor: 'pointer' })
        zone.on('pointerover', () => {
          if (
            this.currentModal ||
            this.mode === 'busy' ||
            this.mode === 'move' ||
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
            this.mode === 'move' ||
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
    const isActive = unit.id === this.runtime?.state.activeUnitId
    const outline = isActive ? 0xf5d18c : unit.id === this.selectedUnitId ? 0xffffff : 0x233341
    const graphic = this.add.graphics()

    graphic.fillStyle(0x061015, 0.55)
    graphic.fillEllipse(0, 24, 38, 14)
    graphic.fillStyle(teamTint, 1)
    graphic.fillRoundedRect(-20, -26, 40, 40, 12)
    graphic.lineStyle(2, outline, 1)
    graphic.strokeRoundedRect(-20, -26, 40, 40, 12)
    if (isActive) {
      graphic.lineStyle(3, 0xf7e7b0, 0.92)
      graphic.strokeRoundedRect(-24, -30, 48, 48, 15)
      graphic.lineStyle(2, 0xf0b35f, 0.8)
      graphic.strokeEllipse(0, 24, 48, 18)
    }
    graphic.fillStyle(0x10202c, 0.8)
    graphic.fillTriangle(0, -33, 7, -22, -7, -22)

    const initials = this.i18n.t(unit.nameKey).slice(0, 2).toUpperCase()
    const label = this.add.text(0, -6, initials, {
      fontFamily: 'Cinzel',
      fontSize: '18px',
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
        hitArea: new Phaser.Geom.Rectangle(-22, -34, 44, 68),
        hitAreaCallback: Phaser.Geom.Rectangle.Contains,
        cursor: 'pointer',
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
    const active = this.runtime.getActiveUnit()

    for (const tile of this.reachableTiles) {
      const height = this.runtime.state.map.tiles[tile.point.y][tile.point.x].height
      const diamond = this.projectTileDiamond(tile.point, height)
      this.overlayGraphics.fillStyle(0x67b9ff, tile.cost === 0 ? 0.1 : 0.28)
      this.overlayGraphics.fillPoints(diamond, true)
      this.overlayGraphics.lineStyle(tile.cost === 0 ? 2 : 1, tile.cost === 0 ? 0xf5d18c : 0x99d5ff, 0.74)
      this.overlayGraphics.strokePoints([...diamond, diamond[0]], true)
    }

    for (const option of this.targetOptions) {
      const unit = this.runtime.state.units[option.unitId]
      const height = this.runtime.state.map.tiles[unit.position.y][unit.position.x].height
      const diamond = this.projectTileDiamond(unit.position, height)
      this.overlayGraphics.lineStyle(2, unit.team === 'allies' ? 0x79d8bc : 0xffa88f, 0.95)
      this.overlayGraphics.strokePoints([...diamond, diamond[0]], true)
    }

    if (this.hoveredPoint) {
      const height = this.runtime.state.map.tiles[this.hoveredPoint.y][this.hoveredPoint.x].height
      const diamond = this.projectTileDiamond(this.hoveredPoint, height)
      this.overlayGraphics.lineStyle(2, 0xf6dc9f, 1)
      this.overlayGraphics.strokePoints([...diamond, diamond[0]], true)
    }

    const activeHeight = this.runtime.state.map.tiles[active.position.y][active.position.x].height
    const activeDiamond = this.projectTileDiamond(active.position, activeHeight)
    this.overlayGraphics.fillStyle(active.team === 'allies' ? 0xf0b35f : 0xff9b7b, this.mode === 'move' ? 0.12 : 0.18)
    this.overlayGraphics.fillPoints(activeDiamond, true)
    this.overlayGraphics.lineStyle(3, 0xf5d18c, 0.96)
    this.overlayGraphics.strokePoints([...activeDiamond, activeDiamond[0]], true)
  }

  private publishHud(): void {
    if (!this.runtime) {
      return
    }

    const active = this.runtime.getActiveUnit()
    const selected = this.selectedUnitId ? this.runtime.getUnit(this.selectedUnitId) : undefined
    const hoverUnit = this.hoveredPoint ? this.findUnitAt(this.hoveredPoint) : undefined
    const hoveredForecast = hoverUnit ? this.targetOptions.find((option) => option.unitId === hoverUnit.id)?.forecast : undefined
    const combatText = this.createCombatTextContext()

    const view: HudViewModel = {
      locale: this.i18n.getLocale(),
      title: this.i18n.t('game.title'),
      objective: this.i18n.t(this.runtime.definition.objectiveKey),
      subtitle: this.i18n.t(this.runtime.definition.titleKey),
      currentTurnLabel: this.i18n.t('hud.currentTurn'),
      activeTeamLabel: this.i18n.t(`hud.team.${active.team}`),
      activeTeam: active.team,
      phase: this.runtime.state.phase,
      mode: this.mode,
      activeUnit: this.asUnitCard(active),
      selectedUnit: selected ? this.asUnitCard(selected) : undefined,
      forecastLines: hoveredForecast ? buildCombatForecastLines(hoveredForecast, combatText) : [this.i18n.t(`hud.mode.${this.mode}`)],
      viewTitle: this.i18n.t('hud.view'),
      camera: {
        rotationDegrees: quarterTurnsToDegrees(this.viewState.rotationQuarterTurns),
        zoomPercent: Math.round(this.viewState.zoom * 100),
        panModeActive: this.viewState.panModeActive,
        rotationLabel: `${this.i18n.t('hud.view.rotation')} ${quarterTurnsToDegrees(this.viewState.rotationQuarterTurns)}°`,
        zoomLabel: `${this.i18n.t('hud.view.zoom')} ${Math.round(this.viewState.zoom * 100)}%`,
        panLabel: `${this.i18n.t('hud.view.pan')} ${this.i18n.t(
          this.viewState.panModeActive ? 'hud.view.on' : 'hud.view.off',
        )}`,
      },
      viewButtons: this.buildViewButtons(),
      initiative: buildInitiativeEntries(
        this.runtime
          .getInitiativeOrder(Object.values(this.runtime.state.units).filter((unit) => !unit.defeated).length)
          .map((unit) => ({
            id: unit.id,
            name: this.i18n.t(unit.nameKey),
            className: this.i18n.t(classDefinitions[unit.classId].nameKey),
            team: unit.team,
            active: unit.id === active.id,
            selected: unit.id === this.selectedUnitId,
          })),
        this.i18n.t('hud.initiative.now'),
      ),
      messages: this.runtime.state.messages.map((message) => formatBattleFeedEntry(message, combatText)),
      buttons: this.buildButtons(),
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
      phase: this.runtime.state.phase,
      mode: this.mode,
      activeUnitId: active.id,
      selectedUnitId: this.selectedUnitId,
      hoveredTile: this.hoveredPoint,
      reachableTiles: this.reachableTiles.map((tile) => tile.point),
      targetableUnitIds: this.targetOptions.map((option) => option.unitId),
      units: Object.values(this.runtime.state.units).map((unit) => ({
        id: unit.id,
        name: this.i18n.t(unit.nameKey),
        className: this.i18n.t(classDefinitions[unit.classId].nameKey),
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
    })
  }

  private createCombatTextContext(): {
    t: (key: string, params?: Record<string, string | number>) => string
    getUnitName: (unitId: string) => string
  } {
    return {
      t: this.i18n.t.bind(this.i18n),
      getUnitName: (unitId: string) => this.i18n.t(this.runtime?.getUnit(unitId)?.nameKey ?? unitId),
    }
  }

  private asUnitCard(unit: UnitState): HudViewModel['activeUnit'] {
    return {
      id: unit.id,
      name: this.i18n.t(unit.nameKey),
      className: this.i18n.t(classDefinitions[unit.classId].nameKey),
      team: unit.team,
      hp: unit.hp,
      maxHp: classDefinitions[unit.classId].stats.maxHp,
      position: unit.position,
      facing: unit.facing,
      statuses: unit.statuses.map((status) => ({
        id: status.id,
        label: this.i18n.t(statusDefinitions[status.id].labelKey),
        stacks: status.stacks,
      })),
      active: unit.id === this.runtime?.state.activeUnitId,
    }
  }

  private buildButtons(): HudViewModel['buttons'] {
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

    return [
      {
        id: 'move',
        label: this.i18n.t('hud.action.move'),
        disabled: !interactive || active.hasActedThisTurn || this.moveRangeTiles.length === 0,
        active: this.mode === 'move',
      },
      { id: 'attack', label: this.i18n.t('hud.action.attack'), disabled: !interactive || attackTargets.length === 0, active: this.mode === 'attack' },
      { id: 'skill', label: this.i18n.t('hud.action.skill'), disabled: !interactive || skillTargets.length === 0, active: this.mode === 'skill' },
      { id: 'wait', label: this.i18n.t('hud.action.wait'), disabled: !interactive, active: false },
      { id: 'cancel', label: this.i18n.t('hud.action.cancel'), disabled: !interactive || this.mode === 'idle', active: false },
    ]
  }

  private buildViewButtons(): HudViewModel['viewButtons'] {
    return [
      {
        id: 'view-rotate-left',
        label: this.i18n.t('hud.action.rotateLeft'),
        disabled: false,
        active: false,
      },
      {
        id: 'view-rotate-right',
        label: this.i18n.t('hud.action.rotateRight'),
        disabled: false,
        active: false,
      },
      {
        id: 'view-zoom-in',
        label: this.i18n.t('hud.action.zoomIn'),
        disabled: this.viewState.zoom >= MAX_BATTLE_ZOOM,
        active: false,
      },
      {
        id: 'view-zoom-out',
        label: this.i18n.t('hud.action.zoomOut'),
        disabled: this.viewState.zoom <= MIN_BATTLE_ZOOM,
        active: false,
      },
      {
        id: 'view-pan-toggle',
        label: this.i18n.t('hud.action.pan'),
        disabled: false,
        active: this.viewState.panModeActive,
      },
    ]
  }

  private buildModal(kind: 'briefing' | 'victory' | 'defeat'): HudViewModel['modal'] {
    if (!this.runtime) {
      return undefined
    }

    if (kind === 'briefing') {
      return {
        kind,
        title: this.i18n.t(this.runtime.definition.titleKey),
        body: this.i18n.t(this.runtime.definition.briefingKey),
        buttonLabel: this.i18n.t('hud.startBattle'),
      }
    }

    return {
      kind,
      title: this.i18n.t(this.runtime.definition.titleKey),
      body:
        kind === 'victory'
          ? this.i18n.t(this.runtime.definition.victoryKey)
          : this.i18n.t(this.runtime.definition.defeatKey),
      buttonLabel: this.i18n.t('hud.playAgain'),
    }
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
      return
    }

    if (this.runtime.repositionActiveUnit(point, allowed)) {
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

  public debugProjectTile(point: GridPoint): {
    point: GridPoint
    world: { x: number; y: number }
    screen: { x: number; y: number }
    client: { x: number; y: number }
  } | null {
    if (!this.runtime) {
      return null
    }

    const tile = this.runtime.state.map.tiles[point.y]?.[point.x]

    if (!tile) {
      return null
    }

    const world = this.projectTilePoint(point, tile.height)
    const camera = this.cameras.main
    const canvasBounds = this.game.canvas.getBoundingClientRect()
    const screen = {
      x: (world.x - camera.scrollX) * camera.zoom,
      y: (world.y - camera.scrollY) * camera.zoom,
    }

    return {
      point,
      world,
      screen,
      client: {
        x: canvasBounds.left + screen.x * (canvasBounds.width / camera.width),
        y: canvasBounds.top + screen.y * (canvasBounds.height / camera.height),
      },
    }
  }
}
