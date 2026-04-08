import { describe, expect, it } from 'vitest'
import seedBundleJson from '../public/data/levels/glenmoor-pass.level.json'
import { aiProfiles, classDefinitions } from '../src/game/content'
import {
  compileLevelBundle,
  loadLevelBundle,
  validateLevelBundleContent,
} from '../src/game/level-bundle'
import { BattleRuntime } from '../src/game/runtime'

describe('Level bundle', () => {
  it('loads and compiles the Glenmoor seed bundle', () => {
    const bundle = loadLevelBundle(seedBundleJson, 'glenmoor-pass.level.json')
    validateLevelBundleContent(bundle, {
      classIds: Object.keys(classDefinitions),
      aiProfileIds: Object.keys(aiProfiles),
    })

    const compiled = compileLevelBundle(bundle)

    expect(compiled.battleDefinition.id).toBe('glenmoorPass')
    expect(compiled.mapData.width).toBe(16)
    expect(compiled.battleDefinition.objectivePhases?.map((phase) => phase.id)).toEqual([
      'break-the-line',
      'hunt-the-captain',
    ])
    expect(compiled.localeOverlay.ko?.['level.glenmoor-pass.title']).toBe('글렌무어 협곡 전투')
    expect(compiled.localeOverlay.en?.['level.glenmoor-pass.unit.brigand-captain.name']).toBe('Captain Veyr')
  })

  it('rejects terrain matrix dimension mismatches', () => {
    const broken = structuredClone(seedBundleJson)
    broken.map.terrain = broken.map.terrain.slice(1)
    const bundle = loadLevelBundle(broken, 'broken.level.json')

    expect(() =>
      validateLevelBundleContent(bundle, {
        classIds: Object.keys(classDefinitions),
        aiProfileIds: Object.keys(aiProfiles),
      }),
    ).toThrow(/Expected 16 rows/)
  })

  it('rejects out-of-bounds units', () => {
    const broken = structuredClone(seedBundleJson)
    broken.units.allies[0].position.x = 999
    const bundle = loadLevelBundle(broken, 'broken.level.json')

    expect(() =>
      validateLevelBundleContent(bundle, {
        classIds: Object.keys(classDefinitions),
        aiProfileIds: Object.keys(aiProfiles),
      }),
    ).toThrow(/out of bounds/)
  })

  it('preserves authored facing when the runtime boots from a compiled bundle', () => {
    const customized = structuredClone(seedBundleJson)
    customized.units.allies[0].facing = 'west'
    const bundle = loadLevelBundle(customized, 'custom.level.json')
    validateLevelBundleContent(bundle, {
      classIds: Object.keys(classDefinitions),
      aiProfileIds: Object.keys(aiProfiles),
    })

    const compiled = compileLevelBundle(bundle)
    const runtime = new BattleRuntime(compiled.mapData, compiled.battleDefinition)

    expect(runtime.getUnit('rowan')?.facing).toBe('west')
  })
})
