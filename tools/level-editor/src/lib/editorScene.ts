import Phaser from 'phaser'
import { classDefinitions, terrainDefinitions } from '../../../../src/game/content'
import { resolveBoardOrigin } from '../../../../src/game/iso'
import { projectTileDiamond, projectTilePoint } from '../../../../src/game/scenes/battle/scene-camera'
import type { LevelBundleV1 } from '../../../../src/game/level-bundle'
import type { GridPoint, Team } from '../../../../src/game/types'
import type {
  EditorCanvasAction,
  EditorLayerVisibility,
  EditorSelection,
  EditorTool,
  UnitStampPreset,
} from '../types'
import { enumerateBrushPoints, findStartingUnitAtPoint } from './editorState'

export interface EditorViewportSnapshot {
  bundle: LevelBundleV1
  tool: EditorTool
  selection: EditorSelection
  layers: EditorLayerVisibility
  brushSize: number
  terrainBrush: string
  heightDelta: number
  unitPreset: UnitStampPreset
}

interface SceneCallbacks {
  onAction: (action: EditorCanvasAction) => void
}

interface CameraDragState {
  pointerId: number
  originX: number
  originY: number
  scrollX: number
  scrollY: number
}

function colorForTeam(team: Team): number {
  return team === 'allies' ? 0xa8d4ff : 0xf4a79c
}

class LevelEditorScene extends Phaser.Scene {
  private readonly callbacks: SceneCallbacks
  private snapshot?: EditorViewportSnapshot
  private terrainGraphics?: Phaser.GameObjects.Graphics
  private overlayGraphics?: Phaser.GameObjects.Graphics
  private unitGraphics?: Phaser.GameObjects.Graphics
  private labelLayer?: Phaser.GameObjects.Container
  private hoverPoint?: GridPoint
  private cameraDragState?: CameraDragState
  private lastPaintKey?: string
  private marqueeStart?: GridPoint
  private ready = false
  private cameraInteracted = false
  private mapSignature?: string
  private readonly handleResize = () => {
    this.draw()
  }

  constructor(callbacks: SceneCallbacks) {
    super('level-editor')
    this.callbacks = callbacks
  }

  create(): void {
    this.ready = true
    this.cameras.main.setBackgroundColor('#1a1a18')
    this.terrainGraphics = this.add.graphics()
    this.overlayGraphics = this.add.graphics()
    this.unitGraphics = this.add.graphics()
    this.labelLayer = this.add.container(0, 0)
    this.input.on('pointermove', this.handlePointerMove, this)
    this.input.on('pointerup', this.handlePointerUp, this)
    this.input.on('wheel', this.handleWheel, this)
    this.input.on('pointerdown', this.handlePointerDown, this)
    this.scale.on(Phaser.Scale.Events.RESIZE, this.handleResize)

    if (this.snapshot) {
      this.draw()
    }
  }

  shutdown(): void {
    this.ready = false
    this.input.off('pointermove', this.handlePointerMove, this)
    this.input.off('pointerup', this.handlePointerUp, this)
    this.input.off('wheel', this.handleWheel, this)
    this.input.off('pointerdown', this.handlePointerDown, this)
    this.scale.off(Phaser.Scale.Events.RESIZE, this.handleResize)
  }

  sync(snapshot: EditorViewportSnapshot): void {
    const nextSignature = `${snapshot.bundle.slug}:${snapshot.bundle.map.width}x${snapshot.bundle.map.height}`

    if (nextSignature !== this.mapSignature) {
      this.mapSignature = nextSignature
      this.cameraInteracted = false
    }

    this.snapshot = snapshot

    if (this.ready) {
      this.draw()
    }
  }

  private fitCameraToBoard(minX: number, maxX: number, minY: number, maxY: number): void {
    const camera = this.cameras.main
    const boardWidth = Math.max(1, maxX - minX + 92)
    const boardHeight = Math.max(1, maxY - minY + 108)
    const zoom = Phaser.Math.Clamp(
      Math.min((camera.width - 28) / boardWidth, (camera.height - 28) / boardHeight) * 1.06,
      0.8,
      1.75,
    )

    camera.setZoom(zoom)
    camera.centerOn((minX + maxX) / 2, (minY + maxY) / 2)
  }

  private getProjection() {
    if (!this.snapshot) {
      return undefined
    }

    const viewportWidth = this.cameras.main?.width ?? this.game.canvas?.width ?? 0
    const viewportHeight = this.cameras.main?.height ?? this.game.canvas?.height ?? 0

    if (viewportWidth <= 0 || viewportHeight <= 0) {
      return undefined
    }

    return {
      rotationQuarterTurns: 0 as const,
      mapWidth: this.snapshot.bundle.map.width,
      mapHeight: this.snapshot.bundle.map.height,
      origin: resolveBoardOrigin({
        viewportWidth,
        viewportHeight,
        rotationQuarterTurns: 0,
        mapWidth: this.snapshot.bundle.map.width,
        mapHeight: this.snapshot.bundle.map.height,
        heights: this.snapshot.bundle.map.elevation,
      }),
    }
  }

  private getTileHeight(point: GridPoint): number {
    return this.snapshot?.bundle.map.elevation[point.y]?.[point.x] ?? 0
  }

  private draw(): void {
    if (!this.snapshot) {
      return
    }

    const projection = this.getProjection()

    if (!projection) {
      return
    }

    const terrainGraphics = this.terrainGraphics
    const overlayGraphics = this.overlayGraphics
    const unitGraphics = this.unitGraphics
    const labelLayer = this.labelLayer

    if (!terrainGraphics || !overlayGraphics || !unitGraphics || !labelLayer) {
      return
    }

    let minX = Number.POSITIVE_INFINITY
    let maxX = Number.NEGATIVE_INFINITY
    let minY = Number.POSITIVE_INFINITY
    let maxY = Number.NEGATIVE_INFINITY

    terrainGraphics.clear()
    overlayGraphics.clear()
    unitGraphics.clear()
    labelLayer.removeAll(true)

    for (let y = 0; y < this.snapshot.bundle.map.height; y += 1) {
      for (let x = 0; x < this.snapshot.bundle.map.width; x += 1) {
        const point = { x, y }
        const terrainId = this.snapshot.bundle.map.terrain[y]![x]!
        const diamond = projectTileDiamond(point, this.getTileHeight(point), projection)
        const terrain = terrainDefinitions[terrainId]!
        const fill = Phaser.Display.Color.ValueToColor(terrain.tint)
          .darken(Math.max(0, 16 - this.getTileHeight(point) * 2))
          .color
        const selected =
          this.snapshot.selection?.kind === 'tile' &&
          this.snapshot.selection.point.x === x &&
          this.snapshot.selection.point.y === y

        if (this.snapshot.layers.terrain) {
          terrainGraphics.fillStyle(fill, 1)
          terrainGraphics.beginPath()
          terrainGraphics.moveTo(diamond[0]!.x, diamond[0]!.y)
          diamond.slice(1).forEach((vertex) => terrainGraphics.lineTo(vertex.x, vertex.y))
          terrainGraphics.closePath()
          terrainGraphics.fillPath()
        }

        terrainGraphics.lineStyle(
          selected ? 3 : 1,
          selected ? 0xcead66 : 0x2f2f2f,
          selected ? 1 : 0.7,
        )
        terrainGraphics.strokePoints(diamond, true)

        if (this.snapshot.layers.height) {
          const world = projectTilePoint(point, this.getTileHeight(point), projection)
          const label = this.add
            .text(world.x, world.y - 4, String(this.getTileHeight(point)), {
              fontFamily: '"JetBrains Mono", "IBM Plex Mono", monospace',
              fontSize: '10px',
              color: '#cfc6af',
            })
            .setOrigin(0.5)
          labelLayer.add(label)
        }

        diamond.forEach((vertex) => {
          minX = Math.min(minX, vertex.x)
          maxX = Math.max(maxX, vertex.x)
          minY = Math.min(minY, vertex.y)
          maxY = Math.max(maxY, vertex.y)
        })
      }
    }

    if (this.snapshot.layers.overlays && this.hoverPoint) {
      const hoverDiamond = projectTileDiamond(this.hoverPoint, this.getTileHeight(this.hoverPoint), projection)
      overlayGraphics.lineStyle(2, 0xffffff, 0.95)
      overlayGraphics.strokePoints(hoverDiamond, true)
    }

    if (this.snapshot.layers.overlays && this.marqueeStart && this.hoverPoint) {
      const start = projectTilePoint(this.marqueeStart, this.getTileHeight(this.marqueeStart), projection)
      const end = projectTilePoint(this.hoverPoint, this.getTileHeight(this.hoverPoint), projection)
      overlayGraphics.lineStyle(1, 0xcead66, 0.85)
      overlayGraphics.strokeRect(
        Math.min(start.x, end.x),
        Math.min(start.y, end.y),
        Math.abs(end.x - start.x),
        Math.abs(end.y - start.y),
      )
    }

    for (const team of ['allies', 'enemies'] as const) {
      if (!this.snapshot.layers[team]) {
        continue
      }

      for (const unit of this.snapshot.bundle.units[team]) {
        const world = projectTilePoint(unit.position, this.getTileHeight(unit.position), projection)
        const selected =
          this.snapshot.selection?.kind === 'unit' &&
          this.snapshot.selection.team === team &&
          this.snapshot.selection.unitId === unit.id
        const ringColor = selected ? 0xcead66 : colorForTeam(team)
        unitGraphics.fillStyle(0x0f1010, 0.96)
        unitGraphics.lineStyle(selected ? 3 : 2, ringColor, 1)
        unitGraphics.fillCircle(world.x, world.y - 20, selected ? 18 : 15)
        unitGraphics.strokeCircle(world.x, world.y - 20, selected ? 18 : 15)
        unitGraphics.lineStyle(2, ringColor, 0.9)
        const facingOffset =
          unit.facing === 'north'
            ? { x: 0, y: -12 }
            : unit.facing === 'south'
              ? { x: 0, y: 12 }
              : unit.facing === 'east'
              ? { x: 12, y: 0 }
              : { x: -12, y: 0 }
        unitGraphics.lineBetween(
          world.x,
          world.y - 20,
          world.x + facingOffset.x,
          world.y - 20 + facingOffset.y,
        )
        const initials = classDefinitions[unit.classId]?.nameKey.split('.').at(-1)?.slice(0, 2).toUpperCase() ?? 'UN'
        const label = this.add
          .text(world.x, world.y - 20, initials, {
            fontFamily: '"JetBrains Mono", "IBM Plex Mono", monospace',
            fontSize: '10px',
              color: '#efe5d0',
            })
            .setOrigin(0.5)
        labelLayer.add(label)
      }
    }

    const cameraBounds = this.cameras.main
    cameraBounds.setBounds(
      minX - 240,
      minY - 220,
      Math.max(720, maxX - minX + 480),
      Math.max(640, maxY - minY + 440),
    )

    if (!this.cameraInteracted) {
      this.fitCameraToBoard(minX, maxX, minY, maxY)
    }
  }

  private getPointFromWorld(pointer: Phaser.Input.Pointer): GridPoint | undefined {
    if (!this.snapshot) {
      return undefined
    }

    const projection = this.getProjection()

    if (!projection) {
      return undefined
    }

    const polygon = new Phaser.Geom.Polygon()

    for (let y = this.snapshot.bundle.map.height - 1; y >= 0; y -= 1) {
      for (let x = this.snapshot.bundle.map.width - 1; x >= 0; x -= 1) {
        const point = { x, y }
        const diamond = projectTileDiamond(point, this.getTileHeight(point), projection)
        polygon.setTo(diamond.map((vertex) => [vertex.x, vertex.y]).flat())

        if (Phaser.Geom.Polygon.Contains(polygon, pointer.worldX, pointer.worldY)) {
          return point
        }
      }
    }

    return undefined
  }

  private commitBrush(point: GridPoint): void {
    if (!this.snapshot) {
      return
    }

    const brushPoints = enumerateBrushPoints(
      point,
      this.snapshot.brushSize,
      this.snapshot.bundle.map.width,
      this.snapshot.bundle.map.height,
    )
    const brushKey = `${this.snapshot.tool}:${brushPoints.map((candidate) => `${candidate.x},${candidate.y}`).join('|')}`

    if (brushKey === this.lastPaintKey) {
      return
    }

    this.lastPaintKey = brushKey

    if (this.snapshot.tool === 'terrain-brush') {
      this.callbacks.onAction({ type: 'paint-terrain', points: brushPoints })
      return
    }

    if (this.snapshot.tool === 'height-brush') {
      this.callbacks.onAction({ type: 'paint-height', points: brushPoints })
      return
    }

    if (this.snapshot.tool === 'erase') {
      this.callbacks.onAction({ type: 'erase', point })
    }
  }

  private handlePointerDown(pointer: Phaser.Input.Pointer): void {
    const point = this.getPointFromWorld(pointer)
    this.hoverPoint = point

    if (this.snapshot?.tool === 'pan') {
      this.cameraInteracted = true
      this.cameraDragState = {
        pointerId: pointer.id,
        originX: pointer.x,
        originY: pointer.y,
        scrollX: this.cameras.main.scrollX,
        scrollY: this.cameras.main.scrollY,
      }
      return
    }

    if (!point || !this.snapshot) {
      return
    }

    if (this.snapshot.tool === 'select') {
      const occupied = findStartingUnitAtPoint(this.snapshot.bundle, point)
      this.callbacks.onAction(
        occupied
          ? { type: 'select-unit', team: occupied.team, unitId: occupied.unit.id }
          : { type: 'select-tile', point },
      )
      this.draw()
      return
    }

    if (this.snapshot.tool === 'move') {
      const occupied = findStartingUnitAtPoint(this.snapshot.bundle, point)

      if (occupied) {
        this.callbacks.onAction({ type: 'select-unit', team: occupied.team, unitId: occupied.unit.id })
        this.draw()
        return
      }

      if (this.snapshot.selection?.kind === 'unit') {
        this.callbacks.onAction({
          type: 'move-unit',
          team: this.snapshot.selection.team,
          unitId: this.snapshot.selection.unitId,
          point,
        })
      } else {
        this.callbacks.onAction({ type: 'select-tile', point })
      }
      return
    }

    if (this.snapshot.tool === 'unit-stamp') {
      this.callbacks.onAction({ type: 'stamp-unit', point })
      return
    }

    if (this.snapshot.tool === 'eyedropper') {
      const occupied = findStartingUnitAtPoint(this.snapshot.bundle, point)
      this.callbacks.onAction(
        occupied
          ? { type: 'sample-unit', team: occupied.team, unitId: occupied.unit.id }
          : { type: 'sample-tile', point },
      )
      return
    }

    if (this.snapshot.tool === 'zoom') {
      this.cameraInteracted = true
      this.cameras.main.zoomTo(Math.min(2.2, this.cameras.main.zoom + 0.16), 120)
      return
    }

    if (this.snapshot.tool === 'marquee') {
      this.marqueeStart = point
      this.draw()
      return
    }

    this.commitBrush(point)
  }

  private handlePointerMove(pointer: Phaser.Input.Pointer): void {
    if (this.cameraDragState && this.cameraDragState.pointerId === pointer.id) {
      this.cameras.main.scrollX =
        this.cameraDragState.scrollX - (pointer.x - this.cameraDragState.originX) / this.cameras.main.zoom
      this.cameras.main.scrollY =
        this.cameraDragState.scrollY - (pointer.y - this.cameraDragState.originY) / this.cameras.main.zoom
      return
    }

    const point = this.getPointFromWorld(pointer)
    const changed =
      point?.x !== this.hoverPoint?.x ||
      point?.y !== this.hoverPoint?.y ||
      (!point && this.hoverPoint)
    this.hoverPoint = point

    if (!this.snapshot || !point) {
      if (changed) {
        this.draw()
      }
      return
    }

    if (pointer.isDown) {
      if (
        this.snapshot.tool === 'terrain-brush' ||
        this.snapshot.tool === 'height-brush' ||
        this.snapshot.tool === 'erase'
      ) {
        this.commitBrush(point)
      }

      if (this.snapshot.tool === 'marquee') {
        this.draw()
        return
      }
    }

    if (changed) {
      this.draw()
    }
  }

  private handlePointerUp(): void {
    this.cameraDragState = undefined
    this.lastPaintKey = undefined
    this.marqueeStart = undefined
    this.draw()
  }

  private handleWheel(
    _pointer: Phaser.Input.Pointer,
    _gameObjects: Phaser.GameObjects.GameObject[],
    _deltaX: number,
    deltaY: number,
  ): void {
    this.cameraInteracted = true
    const direction = deltaY > 0 ? -0.08 : 0.08
    this.cameras.main.zoom = Phaser.Math.Clamp(this.cameras.main.zoom + direction, 0.55, 2.4)
  }
}

export interface LevelEditorViewportController {
  sync: (snapshot: EditorViewportSnapshot) => void
  destroy: () => void
}

export function createLevelEditorViewport(
  container: HTMLDivElement,
  callbacks: SceneCallbacks,
): LevelEditorViewportController {
  const scene = new LevelEditorScene(callbacks)
  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent: container,
    width: Math.max(1, container.clientWidth),
    height: Math.max(1, container.clientHeight),
    backgroundColor: '#121212',
    scene: [scene],
    scale: {
      mode: Phaser.Scale.RESIZE,
      width: Math.max(1, container.clientWidth),
      height: Math.max(1, container.clientHeight),
    },
  })
  const resizeObserver = new ResizeObserver(() => {
    game.scale.resize(Math.max(1, container.clientWidth), Math.max(1, container.clientHeight))
  })
  resizeObserver.observe(container)

  return {
    sync(snapshot) {
      scene.sync(snapshot)
    },
    destroy() {
      resizeObserver.disconnect()
      game.destroy(true)
    },
  }
}
