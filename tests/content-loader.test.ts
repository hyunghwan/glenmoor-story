import { describe, expect, it } from 'vitest'
import aiProfilesData from '../src/game/data/ai-profiles.json'
import classDefinitionsData from '../src/game/data/class-definitions.json'
import skillDefinitionsData from '../src/game/data/skill-definitions.json'
import statusDefinitionsData from '../src/game/data/status-definitions.json'
import {
  loadAIProfiles,
  loadClassDefinitions,
  loadSkillDefinitions,
  loadStatusDefinitions,
  validateContentDefinitions,
} from '../src/game/content-loader'
import { attackPresentationDefinitions } from '../src/game/content'

function loadDefinitions() {
  return {
    statusDefinitions: loadStatusDefinitions(statusDefinitionsData, 'status-definitions.json'),
    skillDefinitions: loadSkillDefinitions(skillDefinitionsData, 'skill-definitions.json'),
    classDefinitions: loadClassDefinitions(classDefinitionsData, 'class-definitions.json'),
    aiProfiles: loadAIProfiles(aiProfilesData, 'ai-profiles.json'),
  }
}

describe('Content loader', () => {
  it('loads external class, skill, status, and AI content and validates references', () => {
    const definitions = loadDefinitions()

    expect(() =>
      validateContentDefinitions(definitions, {
        attackPresentationIds: Object.keys(attackPresentationDefinitions),
      }),
    ).not.toThrow()

    expect(definitions.classDefinitions.vanguard.signatureSkillId).toBe('shieldBash')
    expect(definitions.classDefinitions.vanguard.combatRole).toBe('tank')
    expect(definitions.classDefinitions.cleric.unitIconId).toBe('staff')
    expect(definitions.skillDefinitions.shieldBash.effects).toHaveLength(3)
    expect(definitions.skillDefinitions.shieldBash.presentation.sfxCueId).toBe('melee-heavy')
    expect(definitions.statusDefinitions.burning.presentation.tone).toBe('ember')
    expect(definitions.statusDefinitions.burning.presentation.hitStopMs).toBeGreaterThan(0)
    expect(definitions.aiProfiles.spearhead.aggression).toBe(1.1)
  })

  it('rejects missing presentation cue metadata', () => {
    const brokenStatuses = structuredClone(statusDefinitionsData) as typeof statusDefinitionsData
    delete (brokenStatuses[0].presentation as Record<string, unknown>).sfxCueId

    expect(() => loadStatusDefinitions(brokenStatuses, 'broken-status-definitions.json')).toThrow(
      /Expected non-empty string at broken-status-definitions\.json\[0\]\.presentation\.sfxCueId/,
    )
  })

  it('rejects unknown status ids referenced by skills', () => {
    const brokenSkills = structuredClone(skillDefinitionsData) as typeof skillDefinitionsData
    brokenSkills[0].effects[1] = {
      type: 'status',
      statusId: 'missing-status',
      stacks: 1,
      duration: 2,
    }

    expect(() =>
      validateContentDefinitions(
        {
          statusDefinitions: loadStatusDefinitions(statusDefinitionsData, 'status-definitions.json'),
          skillDefinitions: loadSkillDefinitions(brokenSkills, 'broken-skill-definitions.json'),
          classDefinitions: loadClassDefinitions(classDefinitionsData, 'class-definitions.json'),
          aiProfiles: loadAIProfiles(aiProfilesData, 'ai-profiles.json'),
        },
        {
          attackPresentationIds: Object.keys(attackPresentationDefinitions),
        },
      ),
    ).toThrow(/Unknown skill statusId "missing-status"/)
  })

  it('rejects unknown basic attack presentation ids referenced by classes', () => {
    const brokenClasses = structuredClone(classDefinitionsData) as typeof classDefinitionsData
    brokenClasses[0].basicAttackPresentationId = 'missing-attack-presentation'

    expect(() =>
      validateContentDefinitions(
        {
          statusDefinitions: loadStatusDefinitions(statusDefinitionsData, 'status-definitions.json'),
          skillDefinitions: loadSkillDefinitions(skillDefinitionsData, 'skill-definitions.json'),
          classDefinitions: loadClassDefinitions(brokenClasses, 'broken-class-definitions.json'),
          aiProfiles: loadAIProfiles(aiProfilesData, 'ai-profiles.json'),
        },
        {
          attackPresentationIds: Object.keys(attackPresentationDefinitions),
        },
      ),
    ).toThrow(/Unknown basicAttackPresentationId "missing-attack-presentation"/)
  })

  it('rejects missing combat role metadata on classes', () => {
    const brokenClasses = structuredClone(classDefinitionsData) as typeof classDefinitionsData
    delete (brokenClasses[0] as Record<string, unknown>).combatRole

    expect(() => loadClassDefinitions(brokenClasses, 'broken-class-definitions.json')).toThrow(
      /Expected combat role at broken-class-definitions\.json\[0\]\.combatRole/,
    )
  })

  it('rejects invalid unit icon ids on classes', () => {
    const brokenClasses = structuredClone(classDefinitionsData) as typeof classDefinitionsData
    ;(brokenClasses[0] as Record<string, unknown>).unitIconId = 'banner'

    expect(() => loadClassDefinitions(brokenClasses, 'broken-class-definitions.json')).toThrow(
      /Expected unit icon id at broken-class-definitions\.json\[0\]\.unitIconId/,
    )
  })
})
