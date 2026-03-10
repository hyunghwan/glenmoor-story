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
    expect(definitions.skillDefinitions.shieldBash.effects).toHaveLength(3)
    expect(definitions.statusDefinitions.burning.presentation.tone).toBe('ember')
    expect(definitions.aiProfiles.spearhead.aggression).toBe(1.1)
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
})
