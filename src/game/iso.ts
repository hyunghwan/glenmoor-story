import type { GridPoint } from './types'

export const TILE_WIDTH = 68
export const TILE_HEIGHT = 34
export const HEIGHT_STEP = 22
export const BOARD_ORIGIN = { x: 538, y: 124 }

export function tileToWorld(point: GridPoint, height = 0): { x: number; y: number } {
  return {
    x: BOARD_ORIGIN.x + (point.x - point.y) * (TILE_WIDTH / 2),
    y: BOARD_ORIGIN.y + (point.x + point.y) * (TILE_HEIGHT / 2) - height * HEIGHT_STEP,
  }
}

export function tileDiamond(point: GridPoint, height = 0): { x: number; y: number }[] {
  const center = tileToWorld(point, height)

  return [
    { x: center.x, y: center.y - TILE_HEIGHT / 2 },
    { x: center.x + TILE_WIDTH / 2, y: center.y },
    { x: center.x, y: center.y + TILE_HEIGHT / 2 },
    { x: center.x - TILE_WIDTH / 2, y: center.y },
  ]
}
