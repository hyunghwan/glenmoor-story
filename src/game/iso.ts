import type { GridPoint } from './types'
import { normalizeQuarterTurns } from './battle-camera'

export const TILE_WIDTH = 68
export const TILE_HEIGHT = 34
export const HEIGHT_STEP = 22
export const BOARD_ORIGIN = { x: 538, y: 124 }

export interface ProjectionOptions {
  rotationQuarterTurns?: number
  mapWidth?: number
  mapHeight?: number
  origin?: { x: number; y: number }
}

export function rotateGridPoint(
  point: GridPoint,
  mapWidth: number,
  mapHeight: number,
  rotationQuarterTurns = 0,
): GridPoint {
  const turns = normalizeQuarterTurns(rotationQuarterTurns)

  if (turns === 0 || mapWidth <= 0 || mapHeight <= 0) {
    return { x: point.x, y: point.y }
  }

  switch (turns) {
    case 1:
      return { x: mapHeight - 1 - point.y, y: point.x }
    case 2:
      return { x: mapWidth - 1 - point.x, y: mapHeight - 1 - point.y }
    case 3:
      return { x: point.y, y: mapWidth - 1 - point.x }
    default:
      return { x: point.x, y: point.y }
  }
}

export function tileToWorld(
  point: GridPoint,
  height = 0,
  options: ProjectionOptions = {},
): { x: number; y: number } {
  const origin = options.origin ?? BOARD_ORIGIN
  const rotated = rotateGridPoint(
    point,
    options.mapWidth ?? 0,
    options.mapHeight ?? 0,
    options.rotationQuarterTurns ?? 0,
  )

  return {
    x: origin.x + (rotated.x - rotated.y) * (TILE_WIDTH / 2),
    y: origin.y + (rotated.x + rotated.y) * (TILE_HEIGHT / 2) - height * HEIGHT_STEP,
  }
}

export function tileDiamond(
  point: GridPoint,
  height = 0,
  options: ProjectionOptions = {},
): { x: number; y: number }[] {
  const center = tileToWorld(point, height, options)

  return [
    { x: center.x, y: center.y - TILE_HEIGHT / 2 },
    { x: center.x + TILE_WIDTH / 2, y: center.y },
    { x: center.x, y: center.y + TILE_HEIGHT / 2 },
    { x: center.x - TILE_WIDTH / 2, y: center.y },
  ]
}

export function resolveBoardOrigin(args: {
  viewportWidth: number
  viewportHeight: number
  rotationQuarterTurns: number
  mapWidth: number
  mapHeight: number
  heights: number[][]
}): { x: number; y: number } {
  let minX = Number.POSITIVE_INFINITY
  let maxX = Number.NEGATIVE_INFINITY
  let minY = Number.POSITIVE_INFINITY
  let maxY = Number.NEGATIVE_INFINITY

  for (let y = 0; y < args.mapHeight; y += 1) {
    for (let x = 0; x < args.mapWidth; x += 1) {
      const height = args.heights[y]?.[x] ?? 0
      const diamond = tileDiamond(
        { x, y },
        height,
        {
          origin: { x: 0, y: 0 },
          mapWidth: args.mapWidth,
          mapHeight: args.mapHeight,
          rotationQuarterTurns: args.rotationQuarterTurns,
        },
      )

      for (const point of diamond) {
        minX = Math.min(minX, point.x)
        maxX = Math.max(maxX, point.x)
        minY = Math.min(minY, point.y)
        maxY = Math.max(maxY, point.y + HEIGHT_STEP)
      }
    }
  }

  return {
    x: Math.round(args.viewportWidth / 2 - (minX + maxX) / 2),
    y: Math.round(args.viewportHeight / 2 - (minY + maxY) / 2),
  }
}
