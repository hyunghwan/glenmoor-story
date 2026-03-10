import type {
  BattleDefinition,
  PresentationProfile,
  TerrainDefinition,
} from './types'
import aiProfilesData from './data/ai-profiles.json'
import classDefinitionsData from './data/class-definitions.json'
import glenmoorPassScenarioData from './data/glenmoor-pass.scenario.json'
import skillDefinitionsData from './data/skill-definitions.json'
import statusDefinitionsData from './data/status-definitions.json'
import {
  loadAIProfiles,
  loadClassDefinitions,
  loadSkillDefinitions,
  loadStatusDefinitions,
  validateContentDefinitions,
} from './content-loader'
import { loadBattleDefinition, validateBattleDefinitionContent } from './scenario-loader'

function presentation(
  fxCueId: string,
  telegraphStyle: PresentationProfile['telegraphStyle'],
  castMs: number,
  impactMs: number,
  cameraCue: PresentationProfile['cameraCue'],
  matterProfile: PresentationProfile['matterProfile'],
  tone: PresentationProfile['tone'],
): PresentationProfile {
  return {
    fxCueId,
    telegraphStyle,
    castMs,
    impactMs,
    cameraCue,
    matterProfile,
    tone,
  }
}

export const terrainDefinitions: Record<string, TerrainDefinition> = {
  grass: {
    id: 'grass',
    labelKey: 'terrain.grass',
    moveCost: 1,
    passable: true,
    defenseBonus: 0,
    resistanceBonus: 0,
    tint: 0x71885d,
    sideTint: 0x4d5d3b,
    overlayTint: 0x89a76d,
  },
  road: {
    id: 'road',
    labelKey: 'terrain.road',
    moveCost: 1,
    passable: true,
    defenseBonus: 0,
    resistanceBonus: 0,
    tint: 0x8d7350,
    sideTint: 0x5f4b34,
    overlayTint: 0xaa8b60,
  },
  forest: {
    id: 'forest',
    labelKey: 'terrain.forest',
    moveCost: 2,
    passable: true,
    defenseBonus: 1,
    resistanceBonus: 0,
    tint: 0x48674a,
    sideTint: 0x2f4533,
    overlayTint: 0x5f8456,
  },
  water: {
    id: 'water',
    labelKey: 'terrain.water',
    moveCost: 99,
    passable: false,
    defenseBonus: 0,
    resistanceBonus: 0,
    tint: 0x2c5d7c,
    sideTint: 0x183649,
    overlayTint: 0x4a7b9a,
  },
  stone: {
    id: 'stone',
    labelKey: 'terrain.stone',
    moveCost: 1,
    passable: true,
    defenseBonus: 1,
    resistanceBonus: 1,
    tint: 0x7a7d84,
    sideTint: 0x53565b,
    overlayTint: 0x969aa1,
  },
  bridge: {
    id: 'bridge',
    labelKey: 'terrain.bridge',
    moveCost: 1,
    passable: true,
    defenseBonus: 0,
    resistanceBonus: 0,
    tint: 0x8a6841,
    sideTint: 0x60482e,
    overlayTint: 0xac8151,
  },
  ruins: {
    id: 'ruins',
    labelKey: 'terrain.ruins',
    moveCost: 2,
    passable: true,
    defenseBonus: 1,
    resistanceBonus: 1,
    tint: 0x66605a,
    sideTint: 0x46403c,
    overlayTint: 0x817b74,
  },
}

export const attackPresentationDefinitions: Record<string, PresentationProfile> = {
  vanguardStrike: presentation('attack.vanguardStrike', 'attack', 170, 210, 'impact-heavy', 'shock-ring', 'steel'),
  rangerShot: presentation('attack.rangerShot', 'attack', 220, 180, 'impact-light', 'arrow-streak', 'wind'),
  arcanistBolt: presentation('attack.arcanistBolt', 'attack', 250, 200, 'impact-light', 'magic-bolt', 'radiant'),
  wardenGuard: presentation('attack.wardenGuard', 'attack', 180, 200, 'impact-heavy', 'shock-ring', 'steel'),
  skirmisherSlash: presentation('attack.skirmisherSlash', 'attack', 150, 200, 'impact-heavy', 'dash-burst', 'shadow'),
  clericChant: presentation('attack.clericChant', 'support', 240, 170, 'support-pulse', 'light-shards', 'radiant'),
}

const loadedContentDefinitions = validateContentDefinitions(
  {
    statusDefinitions: loadStatusDefinitions(statusDefinitionsData, 'status-definitions.json'),
    skillDefinitions: loadSkillDefinitions(skillDefinitionsData, 'skill-definitions.json'),
    classDefinitions: loadClassDefinitions(classDefinitionsData, 'class-definitions.json'),
    aiProfiles: loadAIProfiles(aiProfilesData, 'ai-profiles.json'),
  },
  {
    attackPresentationIds: Object.keys(attackPresentationDefinitions),
  },
)

export const statusDefinitions = loadedContentDefinitions.statusDefinitions

export const skillDefinitions = loadedContentDefinitions.skillDefinitions

export const classDefinitions = loadedContentDefinitions.classDefinitions

export const aiProfiles = loadedContentDefinitions.aiProfiles

export const battleDefinition: BattleDefinition = validateBattleDefinitionContent(
  loadBattleDefinition(glenmoorPassScenarioData, 'glenmoor-pass.scenario.json'),
  {
    classIds: Object.keys(classDefinitions),
    aiProfileIds: Object.keys(aiProfiles),
  },
)
