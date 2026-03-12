import { describe, expect, it } from 'vitest'
import glenmoorPassScenarioData from '../src/game/data/glenmoor-pass.scenario.json'
import { aiProfiles, classDefinitions } from '../src/game/content'
import { loadBattleDefinition, validateBattleDefinitionContent } from '../src/game/scenario-loader'

describe('Scenario loader', () => {
  it('loads the Glenmoor Pass scenario from external JSON', () => {
    const definition = loadBattleDefinition(glenmoorPassScenarioData, 'glenmoor-pass.scenario.json')

    expect(definition.id).toBe('glenmoorPass')
    expect(definition.mapId).toBe('glenmoor-pass')
    expect(definition.objectivePhases?.map((phase) => phase.id)).toEqual(['break-the-line', 'hunt-the-captain'])
    expect(definition.objectivePhases?.[1]?.announcementCueId).toBe('phase-shift')
    expect(definition.events?.[0]).toMatchObject({
      id: 'shieldbearer-falls',
      trigger: {
        type: 'unit-defeated',
        unitId: 'shieldbearer',
      },
    })
  })

  it('validates external scenario references against known class and AI ids', () => {
    const definition = loadBattleDefinition(glenmoorPassScenarioData, 'glenmoor-pass.scenario.json')

    expect(() =>
      validateBattleDefinitionContent(definition, {
        classIds: Object.keys(classDefinitions),
        aiProfileIds: Object.keys(aiProfiles),
      }),
    ).not.toThrow()
  })

  it('rejects unit references to unknown class ids during content validation', () => {
    const broken = structuredClone(glenmoorPassScenarioData) as typeof glenmoorPassScenarioData
    broken.allies[0].classId = 'missing-class'

    const definition = loadBattleDefinition(broken, 'broken-scenario.json')

    expect(() =>
      validateBattleDefinitionContent(definition, {
        classIds: Object.keys(classDefinitions),
        aiProfileIds: Object.keys(aiProfiles),
      }),
    ).toThrow(/Unknown classId "missing-class"/)
  })

  it('rejects scripted phase references that are not declared', () => {
    const broken = structuredClone(glenmoorPassScenarioData) as typeof glenmoorPassScenarioData
    broken.events[0].effects[0] = {
      type: 'set-objective-phase',
      objectivePhaseId: 'missing-phase',
    }

    expect(() => loadBattleDefinition(broken, 'broken-scenario.json')).toThrow(/Unknown objective phase "missing-phase"/)
  })

  it('allows objective phases without announcementCueId', () => {
    const variant = structuredClone(glenmoorPassScenarioData) as typeof glenmoorPassScenarioData
    delete (variant.objectivePhases[1] as Record<string, unknown>).announcementCueId

    expect(() => loadBattleDefinition(variant, 'variant-scenario.json')).not.toThrow()
  })
})
