import Phaser from 'phaser'
import { classDefinitions, statusDefinitions, terrainDefinitions } from '../content'
import { TILE_HEIGHT, TILE_WIDTH, tileDiamond, tileToWorld } from '../iso'
import { I18n } from '../i18n'
import { BattleRuntime } from '../runtime'
import type {
  ActionTarget,
  BattleAction,
  CombatResolution,
  GridPoint,
  HudViewModel,
  Locale,
  ReachableTile,
  TiledMapData,
  UnitState,
} from '../types'

export class BattleScene extends Phaser.Scene {
  private readonly uiBus: Phaser.Events.EventEmitter
  private readonly i18n: I18n
  private runtime?: BattleRuntime
  private mapGraphics?: Phaser.GameObjects.Graphics
  private overlayGraphics?: Phaser.GameObjects.Graphics
  private unitContainers = new Map<string, Phaser.GameObjects.Container>()
  private hoveredPoint?: GridPoint
  private selectedUnitId?: string
  private mode: HudViewModel['mode'] = 'idle'
  private reachableTiles: ReachableTile[] = []
  private targetOptions: ActionTarget[] = []
  private pendingAiDelayMs = 0
  private debugAdvanceMs = 0
  private lastActiveUnitId?: string
  private currentModal?: HudViewModel['modal']
  private mapData?: TiledMapData

  constructor(uiBus: Phaser.Events.EventEmitter, i18n: I18n) {
    super('battle')
    this.uiBus = uiBus
    this.i18n = i18n
  }

  create(): void {
    this.mapData = this.cache.json.get('map:glenmoor-pass') as TiledMapData
    this.runtime = new BattleRuntime(this.mapData)
    this.mapGraphics = this.add.graphics()
    this.overlayGraphics = this.add.graphics()

    this.drawBoard()
    this.createTileInputs()
    this.syncUnits()

    this.selectedUnitId = this.runtime.getActiveUnit().id
    this.currentModal = this.buildModal('briefing')

    this.uiBus.on('hud:command', this.handleHudCommand, this)
    this.uiBus.on('hud:locale', this.handleLocaleChange, this)
    this.uiBus.on('duel:complete', this.handleDuelComplete, this)
    this.uiBus.on('debug:advance', this.handleDebugAdvance, this)
    this.uiBus.on('debug:tile-click', this.handleDebugTileClick, this)
    this.uiBus.on('debug:stage', this.handleDebugStage, this)

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.uiBus.off('hud:command', this.handleHudCommand, this)
      this.uiBus.off('hud:locale', this.handleLocaleChange, this)
      this.uiBus.off('duel:complete', this.handleDuelComplete, this)
      this.uiBus.off('debug:advance', this.handleDebugAdvance, this)
      this.uiBus.off('debug:tile-click', this.handleDebugTileClick, this)
      this.uiBus.off('debug:stage', this.handleDebugStage, this)
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

  private handleHudCommand(command: string): void {
    if (!this.runtime) {
      return
    }

    if (command === 'start-battle') {
      this.currentModal = undefined
      this.runtime.startBattle()
      this.selectedUnitId = this.runtime.getActiveUnit().id
      this.refreshPresentation()
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
      this.mode = 'move'
      this.reachableTiles = this.runtime.getReachableTiles(active.id)
      this.targetOptions = []
      this.refreshPresentation()
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
      this.mode = 'idle'
      this.reachableTiles = []
      this.targetOptions = []
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
    this.mode = 'idle'
    this.finalizeTurnTransition()
  }

  private handleDebugAdvance(ms: number): void {
    this.debugAdvanceMs += ms

    if (this.scene.isActive('duel')) {
      this.uiBus.emit('duel:fast-forward')
    }
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
    this.mode = 'idle'
    this.reachableTiles = []
    this.targetOptions = []

    if (stage === 'engagement') {
      this.placeUnit('rowan', { x: 7, y: 8 }, 12)
      this.placeUnit('brigandCaptain', { x: 7, y: 7 }, 20)
      this.runtime.state.activeUnitId = 'rowan'
      this.selectedUnitId = 'rowan'
    }

    if (stage === 'skill-demo') {
      this.placeUnit('maelin', { x: 8, y: 9 }, 20)
      this.placeUnit('brigandCaptain', { x: 8, y: 7 }, 24)
      this.runtime.state.activeUnitId = 'maelin'
      this.selectedUnitId = 'maelin'
    }

    if (stage === 'push-demo') {
      this.placeUnit('rowan', { x: 0, y: 1 }, 30)
      this.placeUnit('brigandCaptain', { x: 0, y: 0 }, 24)
      this.runtime.state.activeUnitId = 'rowan'
      this.selectedUnitId = 'rowan'
    }

    if (stage === 'victory-demo') {
      for (const enemy of ['huntmaster', 'hexbinder', 'shieldbearer', 'cutpurse', 'fanatic']) {
        this.placeUnit(enemy, this.runtime.state.units[enemy].position, 0)
      }
      this.placeUnit('rowan', { x: 7, y: 8 }, 18)
      this.placeUnit('brigandCaptain', { x: 7, y: 7 }, 5)
      this.runtime.state.activeUnitId = 'rowan'
      this.selectedUnitId = 'rowan'
    }

    this.lastActiveUnitId = undefined
    this.pendingAiDelayMs = 0
    this.refreshPresentation()
  }

  private resetBattle(): void {
    if (!this.runtime || !this.mapData) {
      return
    }

    this.runtime.reset(this.mapData)
    this.mode = 'idle'
    this.reachableTiles = []
    this.targetOptions = []
    this.hoveredPoint = undefined
    this.selectedUnitId = this.runtime.getActiveUnit().id
    this.currentModal = this.buildModal('briefing')
    this.lastActiveUnitId = undefined
    this.pendingAiDelayMs = 0
    this.syncUnits()
    this.refreshPresentation()
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
    } else if (this.runtime.state.phase === 'defeat') {
      this.currentModal = this.buildModal('defeat')
    } else {
      this.currentModal = undefined
      this.selectedUnitId = this.runtime.getActiveUnit().id
    }

    this.refreshPresentation()
  }

  private createTileInputs(): void {
    if (!this.runtime) {
      return
    }

    for (const row of this.runtime.state.map.tiles) {
      for (const tile of row) {
        const world = tileToWorld(tile.point, tile.height)
        const zone = this.add.zone(world.x, world.y, TILE_WIDTH * 0.72, TILE_HEIGHT * 0.78)
        zone.setInteractive({ useHandCursor: true })
        zone.on('pointerover', () => {
          this.hoveredPoint = tile.point
          this.refreshPresentation()
        })
        zone.on('pointerout', () => {
          this.hoveredPoint = undefined
          this.refreshPresentation()
        })
        zone.on('pointerdown', () => this.handleTileClick(tile.point))
      }
    }
  }

  private handleTileClick(point: GridPoint): void {
    if (!this.runtime || this.currentModal || this.mode === 'busy') {
      return
    }

    if (this.mode === 'move') {
      if (this.runtime.repositionActiveUnit(point)) {
        this.mode = 'idle'
        this.reachableTiles = []
        this.selectedUnitId = this.runtime.getActiveUnit().id
        this.syncUnits()
      }

      this.refreshPresentation()
      return
    }

    if (this.mode === 'attack' || this.mode === 'skill') {
      const occupant = this.findUnitAt(point)
      const forecast = this.targetOptions.find((option) => option.unitId === occupant?.id)

      if (forecast && occupant) {
        this.resolveAction({
          actorId: this.runtime.getActiveUnit().id,
          kind: this.mode === 'attack' ? 'attack' : 'skill',
          skillId:
            this.mode === 'skill'
              ? classDefinitions[this.runtime.getActiveUnit().classId].signatureSkillId
              : undefined,
          targetId: occupant.id,
        })
      }

      return
    }

    const occupant = this.findUnitAt(point)
    this.selectedUnitId = occupant?.id ?? this.runtime.getActiveUnit().id
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

    const tiles = this.runtime.state.map.tiles.flat().sort((left, right) => left.point.x + left.point.y - (right.point.x + right.point.y))

    for (const tile of tiles) {
      const terrain = terrainDefinitions[tile.terrainId]
      const diamond = tileDiamond(tile.point, tile.height)
      const world = tileToWorld(tile.point, tile.height)
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
    const world = tileToWorld(unit.position, this.runtime!.state.map.tiles[unit.position.y][unit.position.x].height)
    const container = this.add.container(world.x, world.y - 16)
    const teamTint = unit.team === 'allies' ? 0x86baf7 : 0xf49274
    const outline = unit.id === this.runtime?.state.activeUnitId ? 0xf5d18c : unit.id === this.selectedUnitId ? 0xffffff : 0x233341
    const graphic = this.add.graphics()

    graphic.fillStyle(0x061015, 0.55)
    graphic.fillEllipse(0, 24, 38, 14)
    graphic.fillStyle(teamTint, 1)
    graphic.fillRoundedRect(-20, -26, 40, 40, 12)
    graphic.lineStyle(2, outline, 1)
    graphic.strokeRoundedRect(-20, -26, 40, 40, 12)
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

    container.add([graphic, label, hp])
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

    for (const tile of this.reachableTiles) {
      const height = this.runtime.state.map.tiles[tile.point.y][tile.point.x].height
      const diamond = tileDiamond(tile.point, height)
      this.overlayGraphics.fillStyle(0x67b9ff, tile.cost === 0 ? 0 : 0.18)
      this.overlayGraphics.fillPoints(diamond, true)
    }

    for (const option of this.targetOptions) {
      const unit = this.runtime.state.units[option.unitId]
      const height = this.runtime.state.map.tiles[unit.position.y][unit.position.x].height
      const diamond = tileDiamond(unit.position, height)
      this.overlayGraphics.lineStyle(2, unit.team === 'allies' ? 0x79d8bc : 0xffa88f, 0.95)
      this.overlayGraphics.strokePoints([...diamond, diamond[0]], true)
    }

    if (this.hoveredPoint) {
      const height = this.runtime.state.map.tiles[this.hoveredPoint.y][this.hoveredPoint.x].height
      const diamond = tileDiamond(this.hoveredPoint, height)
      this.overlayGraphics.lineStyle(2, 0xf6dc9f, 1)
      this.overlayGraphics.strokePoints([...diamond, diamond[0]], true)
    }
  }

  private publishHud(): void {
    if (!this.runtime) {
      return
    }

    const active = this.runtime.getActiveUnit()
    const selected = this.selectedUnitId ? this.runtime.getUnit(this.selectedUnitId) : undefined
    const hoverUnit = this.hoveredPoint ? this.findUnitAt(this.hoveredPoint) : undefined
    const hoveredForecast = hoverUnit ? this.targetOptions.find((option) => option.unitId === hoverUnit.id)?.forecast : undefined

    const view: HudViewModel = {
      locale: this.i18n.getLocale(),
      title: this.i18n.t('game.title'),
      objective: this.i18n.t(this.runtime.definition.objectiveKey),
      subtitle: this.i18n.t(this.runtime.definition.titleKey),
      activeTeam: active.team,
      phase: this.runtime.state.phase,
      mode: this.mode,
      activeUnit: this.asUnitCard(active),
      selectedUnit: selected ? this.asUnitCard(selected) : undefined,
      forecastText: hoveredForecast ? this.describeForecast(hoveredForecast) : this.i18n.t(`hud.mode.${this.mode}`),
      timeline: this.runtime
        .getInitiativeOrder()
        .map((unit) => `${this.i18n.t(unit.nameKey)} · ${this.i18n.t(classDefinitions[unit.classId].nameKey)}`),
      messages: this.runtime.state.messages.map((message) => this.translateMessage(message)),
      buttons: this.buildButtons(),
      modal: this.currentModal,
    }

    this.uiBus.emit('hud:update', view)
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
    })
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
      { id: 'move', label: this.i18n.t('hud.action.move'), disabled: !interactive || active.hasMovedThisTurn, active: this.mode === 'move' },
      { id: 'attack', label: this.i18n.t('hud.action.attack'), disabled: !interactive || attackTargets.length === 0, active: this.mode === 'attack' },
      { id: 'skill', label: this.i18n.t('hud.action.skill'), disabled: !interactive || skillTargets.length === 0, active: this.mode === 'skill' },
      { id: 'wait', label: this.i18n.t('hud.action.wait'), disabled: !interactive, active: false },
      { id: 'cancel', label: this.i18n.t('hud.action.cancel'), disabled: !interactive || this.mode === 'idle', active: false },
    ]
  }

  private describeForecast(forecast: CombatResolution): string {
    const primary = forecast.primary

    if (!primary) {
      return this.i18n.t('hud.none')
    }

    const lines = [
      `${this.i18n.t(primary.labelKey)} · ${
        primary.kind === 'heal' ? this.i18n.t('hud.heal') : this.i18n.t('hud.damage')
      }: ${primary.amount}`,
      `${primary.relation.toUpperCase()} / H${primary.heightDelta >= 0 ? '+' : ''}${primary.heightDelta}`,
    ]

    if (primary.appliedStatuses.length > 0) {
      lines.push(
        primary.appliedStatuses.map((status) => this.i18n.t(statusDefinitions[status.statusId].labelKey)).join(', '),
      )
    }

    if (primary.push?.attempted) {
      lines.push(primary.push.succeeded ? 'Push 1' : `Push blocked (${primary.push.blockedReason ?? 'edge'})`)
    }

    if (forecast.counter) {
      lines.push(`${this.i18n.t('hud.counter')}: ${forecast.counter.amount}`)
    }

    return lines.join(' · ')
  }

  private translateMessage(code: string): string {
    const [kind, first, second, third] = code.split(':')
    const firstName = first ? this.i18n.t(this.runtime?.getUnit(first)?.nameKey ?? first) : ''
    const secondName = second ? this.i18n.t(this.runtime?.getUnit(second)?.nameKey ?? second) : ''

    switch (kind) {
      case 'turn':
        return this.i18n.t('log.turn', { name: firstName })
      case 'move':
        return this.i18n.t('log.move', { name: firstName })
      case 'wait':
        return this.i18n.t('log.wait', { name: firstName })
      case 'damage':
        return this.i18n.t('log.damage', { source: firstName, target: secondName, amount: third ?? 0 })
      case 'heal':
        return this.i18n.t('log.heal', { source: firstName, target: secondName, amount: third ?? 0 })
      case 'status':
        return this.i18n.t('log.status', {
          target: firstName,
          status: this.i18n.t(statusDefinitions[second].labelKey),
        })
      case 'push':
        return this.i18n.t('log.push', { target: firstName })
      case 'pushBlocked':
        return this.i18n.t('log.pushBlocked', { target: firstName })
      case 'counter':
        return this.i18n.t('log.counter', { name: firstName })
      case 'fell':
        return this.i18n.t('log.fell', { name: firstName })
      case 'burn':
        return `${this.i18n.t(statusDefinitions.burning.labelKey)}: ${firstName} -${second}`
      default:
        return code
    }
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
}
