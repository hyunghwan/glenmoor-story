import type { RotationQuarterTurns } from '../../battle-camera'
import { tileDiamond, tileToWorld } from '../../iso'
import type { GridPoint, HudAnchor } from '../../types'

export interface BattleSceneProjectionState {
  rotationQuarterTurns: RotationQuarterTurns
  mapWidth?: number
  mapHeight?: number
  origin?: { x: number; y: number }
}

export interface ClientBoundsRect {
  left: number
  top: number
  width: number
  height: number
  right: number
  bottom: number
}

export interface ProjectWorldPointToClientArgs {
  world: { x: number; y: number }
  cameraScrollX: number
  cameraScrollY: number
  cameraZoom: number
  cameraWidth: number
  cameraHeight: number
  canvasBounds: ClientBoundsRect
}

export interface ProjectGridPointToClientArgs
  extends Omit<ProjectWorldPointToClientArgs, 'world'> {
  point: GridPoint
  tileHeight?: number
  projection: BattleSceneProjectionState
}

export interface BuildUnitAnchorArgs
  extends Omit<ProjectWorldPointToClientArgs, 'world'> {
  point: GridPoint
  tileHeight?: number
  projection: BattleSceneProjectionState
  preferredPlacement: HudAnchor['preferredPlacement']
  offset: { x: number; y: number }
  margin?: number
}

export interface ComputeCameraFocusScrollArgs {
  point: GridPoint
  tileHeight?: number
  projection: BattleSceneProjectionState
  cameraWidth: number
  cameraHeight: number
  cameraZoom: number
  cameraBounds: {
    x: number
    y: number
    width: number
    height: number
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

export function buildProjectionOptions(
  state: BattleSceneProjectionState,
): BattleSceneProjectionState {
  return {
    rotationQuarterTurns: state.rotationQuarterTurns,
    mapWidth: state.mapWidth,
    mapHeight: state.mapHeight,
    origin: state.origin,
  }
}

export function projectTilePoint(
  point: GridPoint,
  height = 0,
  projection: BattleSceneProjectionState,
): { x: number; y: number } {
  return tileToWorld(point, height, buildProjectionOptions(projection))
}

export function projectTileDiamond(
  point: GridPoint,
  height = 0,
  projection: BattleSceneProjectionState,
): { x: number; y: number }[] {
  return tileDiamond(point, height, buildProjectionOptions(projection))
}

export function projectWorldPointToClient(
  args: ProjectWorldPointToClientArgs,
): { clientX: number; clientY: number; bounds: ClientBoundsRect } | undefined {
  if (!args.canvasBounds.width || !args.canvasBounds.height) {
    return undefined
  }

  return {
    clientX:
      args.canvasBounds.left +
      (args.world.x - args.cameraScrollX) *
        args.cameraZoom *
        (args.canvasBounds.width / args.cameraWidth),
    clientY:
      args.canvasBounds.top +
      (args.world.y - args.cameraScrollY) *
        args.cameraZoom *
        (args.canvasBounds.height / args.cameraHeight),
    bounds: args.canvasBounds,
  }
}

export function projectGridPointToClient(
  args: ProjectGridPointToClientArgs,
): { clientX: number; clientY: number } | undefined {
  const world = projectTilePoint(args.point, args.tileHeight ?? 0, args.projection)
  const clientPoint = projectWorldPointToClient({
    world,
    cameraScrollX: args.cameraScrollX,
    cameraScrollY: args.cameraScrollY,
    cameraZoom: args.cameraZoom,
    cameraWidth: args.cameraWidth,
    cameraHeight: args.cameraHeight,
    canvasBounds: args.canvasBounds,
  })

  if (!clientPoint) {
    return undefined
  }

  return {
    clientX: clientPoint.clientX,
    clientY: clientPoint.clientY,
  }
}

export function buildUnitAnchor(args: BuildUnitAnchorArgs): HudAnchor | undefined {
  const world = projectTilePoint(args.point, args.tileHeight ?? 0, args.projection)
  const clientPoint = projectWorldPointToClient({
    world: {
      x: world.x + args.offset.x,
      y: world.y + args.offset.y,
    },
    cameraScrollX: args.cameraScrollX,
    cameraScrollY: args.cameraScrollY,
    cameraZoom: args.cameraZoom,
    cameraWidth: args.cameraWidth,
    cameraHeight: args.cameraHeight,
    canvasBounds: args.canvasBounds,
  })

  if (!clientPoint) {
    return undefined
  }

  const margin = args.margin ?? 18

  return {
    clientX: clamp(
      clientPoint.clientX,
      clientPoint.bounds.left + margin,
      clientPoint.bounds.right - margin,
    ),
    clientY: clamp(
      clientPoint.clientY,
      clientPoint.bounds.top + margin,
      clientPoint.bounds.bottom - margin,
    ),
    preferredPlacement: args.preferredPlacement,
  }
}

export function computeCameraFocusScroll(
  args: ComputeCameraFocusScrollArgs,
): { x: number; y: number } {
  const world = projectTilePoint(args.point, args.tileHeight ?? 0, args.projection)
  const visibleWidth = args.cameraWidth / args.cameraZoom
  const visibleHeight = args.cameraHeight / args.cameraZoom
  const maxScrollX = Math.max(
    args.cameraBounds.x,
    args.cameraBounds.x + args.cameraBounds.width - visibleWidth,
  )
  const maxScrollY = Math.max(
    args.cameraBounds.y,
    args.cameraBounds.y + args.cameraBounds.height - visibleHeight,
  )

  return {
    x: clamp(world.x - visibleWidth / 2, args.cameraBounds.x, maxScrollX),
    y: clamp(world.y - visibleHeight / 2, args.cameraBounds.y, maxScrollY),
  }
}
