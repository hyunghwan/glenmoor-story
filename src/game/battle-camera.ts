export type RotationQuarterTurns = 0 | 1 | 2 | 3

export const DEFAULT_BATTLE_ZOOM = 1
export const MIN_BATTLE_ZOOM = 0.75
export const MAX_BATTLE_ZOOM = 1.6
export const BATTLE_ZOOM_STEP = 0.1
export const BATTLE_DRAG_THRESHOLD_PX = 10

export function normalizeQuarterTurns(turns: number): RotationQuarterTurns {
  const normalized = ((Math.trunc(turns) % 4) + 4) % 4
  return normalized as RotationQuarterTurns
}

export function rotateQuarterTurns(
  current: RotationQuarterTurns,
  delta: number,
): RotationQuarterTurns {
  return normalizeQuarterTurns(current + delta)
}

export function quarterTurnsToDegrees(turns: RotationQuarterTurns): number {
  return normalizeQuarterTurns(turns) * 90
}

export function clampBattleZoom(zoom: number): number {
  const rounded = Math.round(zoom * 100) / 100
  return Math.max(MIN_BATTLE_ZOOM, Math.min(MAX_BATTLE_ZOOM, rounded))
}

export function stepBattleZoom(zoom: number, deltaSteps: number): number {
  return clampBattleZoom(zoom + deltaSteps * BATTLE_ZOOM_STEP)
}
