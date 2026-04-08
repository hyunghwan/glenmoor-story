import { describe, expect, it } from 'vitest'
import seedBundleJson from '../../../../public/data/levels/glenmoor-pass.level.json'
import { loadLevelBundle } from '../../../../src/game/level-bundle'
import {
  applyElevationAtPoints,
  applyTerrainAtPoints,
  moveStartingUnit,
  resizeLevelMap,
  stampUnitAtPoint,
} from '../lib/editorState'

const seedBundle = loadLevelBundle(seedBundleJson, 'glenmoor-pass.level.json')

describe('editor state helpers', () => {
  it('applies terrain brush changes to targeted points', () => {
    const next = applyTerrainAtPoints(seedBundle, [{ x: 0, y: 0 }, { x: 1, y: 0 }], 'road')

    expect(next.map.terrain[0]?.[0]).toBe('road')
    expect(next.map.terrain[0]?.[1]).toBe('road')
    expect(seedBundle.map.terrain[0]?.[0]).toBe('forest')
  })

  it('clamps elevation changes at zero', () => {
    const next = applyElevationAtPoints(seedBundle, [{ x: 0, y: 0 }], -99)

    expect(next.map.elevation[0]?.[0]).toBe(0)
  })

  it('stamps a new unit with a generated id', () => {
    const next = stampUnitAtPoint(seedBundle, { x: 0, y: 0 }, {
      team: 'allies',
      classId: 'cleric',
      aiProfileId: 'cantor',
      facing: 'north',
      startingHp: '',
    })

    expect(next.units.allies.some((unit) => unit.position.x === 0 && unit.position.y === 0)).toBe(true)
    expect(next.units.allies.some((unit) => unit.id.startsWith('ally-cleric-'))).toBe(true)
  })

  it('resizes the map and clamps unit positions into bounds', () => {
    const next = resizeLevelMap(seedBundle, 8, 8)
    const rowan = next.units.allies.find((unit) => unit.id === 'rowan')

    expect(next.map.width).toBe(8)
    expect(next.map.height).toBe(8)
    expect(rowan?.position.x).toBeLessThan(8)
    expect(rowan?.position.y).toBeLessThan(8)
  })

  it('moves a unit onto an empty tile and refuses occupied destinations', () => {
    const moved = moveStartingUnit(seedBundle, 'allies', 'rowan', { x: 5, y: 9 })
    const rowanAfterMove = moved.units.allies.find((unit) => unit.id === 'rowan')
    const blocked = moveStartingUnit(seedBundle, 'allies', 'rowan', { x: 3, y: 10 })
    const rowanAfterBlockedMove = blocked.units.allies.find((unit) => unit.id === 'rowan')

    expect(rowanAfterMove?.position).toEqual({ x: 5, y: 9 })
    expect(rowanAfterBlockedMove?.position).toEqual({ x: 5, y: 10 })
  })
})
