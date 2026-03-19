import { describe, expect, it } from 'vitest'
import {
  getBridgeDropPreviewPoint,
  resolveCueColor,
  resolveImpactScale,
  resolveTerrainReactionColor,
} from '../src/game/scenes/battle/scene-effects'
import type { BattleMapData } from '../src/game/types'

describe('battle scene effects helpers', () => {
  it('finds the water landing tile for bridge-drop previews', () => {
    const map: BattleMapData = {
      id: 'test-map',
      width: 3,
      height: 1,
      tileWidth: 68,
      tileHeight: 34,
      tiles: [[
        { point: { x: 0, y: 0 }, terrainId: 'road', height: 0 },
        { point: { x: 1, y: 0 }, terrainId: 'bridge', height: 0 },
        { point: { x: 2, y: 0 }, terrainId: 'water', height: 0 },
      ]],
    }

    expect(
      getBridgeDropPreviewPoint(map, { x: 0, y: 0 }, { x: 1, y: 0 }),
    ).toEqual({ x: 2, y: 0 })
    expect(
      getBridgeDropPreviewPoint(map, { x: 0, y: 0 }, { x: 0, y: 0 }),
    ).toBeUndefined()
  })

  it('keeps cue and impact palettes stable across extracted helpers', () => {
    expect(resolveCueColor('skill.emberSigil')).toBe(0xf09046)
    expect(resolveTerrainReactionColor('ruins-echo')).toBe(0x8bdcff)
    expect(resolveImpactScale('heavy')).toBe(1.18)
  })
})
