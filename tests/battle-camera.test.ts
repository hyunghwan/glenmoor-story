import { describe, expect, it } from 'vitest'
import {
  MAX_BATTLE_ZOOM,
  MIN_BATTLE_ZOOM,
  clampBattleZoom,
  quarterTurnsToDegrees,
  rotateQuarterTurns,
  type RotationQuarterTurns,
} from '../src/game/battle-camera'
import { rotateGridPoint, tileToWorld } from '../src/game/iso'

describe('battle camera helpers', () => {
  it('returns a grid point to its original position after four quarter-turns', () => {
    let rotation: RotationQuarterTurns = 0
    let point = { x: 3, y: 6 }

    for (let step = 0; step < 4; step += 1) {
      rotation = rotateQuarterTurns(rotation, 1)
      point = rotateGridPoint(point, 16, 16, 1)
    }

    expect(rotation).toBe(0)
    expect(point).toEqual({ x: 3, y: 6 })
  })

  it('projects stable positions for every quarter-turn', () => {
    const positions = [0, 1, 2, 3].map((rotationQuarterTurns) =>
      tileToWorld(
        { x: 2, y: 5 },
        1,
        {
          mapWidth: 16,
          mapHeight: 16,
          rotationQuarterTurns,
        },
      ),
    )

    expect(new Set(positions.map((position) => `${position.x},${position.y}`)).size).toBe(4)
    expect(
      tileToWorld(
        { x: 2, y: 5 },
        1,
        {
          mapWidth: 16,
          mapHeight: 16,
          rotationQuarterTurns: 4,
        },
      ),
    ).toEqual(positions[0])
  })

  it('clamps zoom and exposes quarter-turn degrees', () => {
    expect(clampBattleZoom(0.1)).toBe(MIN_BATTLE_ZOOM)
    expect(clampBattleZoom(2.4)).toBe(MAX_BATTLE_ZOOM)
    expect(clampBattleZoom(1.13)).toBe(1.13)
    expect(quarterTurnsToDegrees(0)).toBe(0)
    expect(quarterTurnsToDegrees(1)).toBe(90)
    expect(quarterTurnsToDegrees(2)).toBe(180)
    expect(quarterTurnsToDegrees(3)).toBe(270)
  })
})
