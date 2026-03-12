import type {
  BattleDefinition,
  CameraCue,
  ImpactWeight,
  MatterProfile,
  PresentationProfile,
  PresentationTone,
  TerrainDefinition,
  TerrainReactionId,
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
  sfxCueId: string,
  telegraphStyle: PresentationProfile['telegraphStyle'],
  impactWeight: PresentationProfile['impactWeight'],
  castMs: number,
  impactMs: number,
  hitStopMs: number,
  lingerMs: number,
  cameraCue: PresentationProfile['cameraCue'],
  matterProfile: PresentationProfile['matterProfile'],
  tone: PresentationProfile['tone'],
): PresentationProfile {
  return {
    fxCueId,
    sfxCueId,
    telegraphStyle,
    impactWeight,
    castMs,
    impactMs,
    hitStopMs,
    lingerMs,
    cameraCue,
    matterProfile,
    tone,
  }
}

interface TerrainReactionDefinition {
  id: TerrainReactionId
  labelKey: string
  fxCueId: string
  sfxCueId: string
  impactWeight: ImpactWeight
  hitStopMs: number
  durationMs: number
  cameraCue: CameraCue
  matterProfile: MatterProfile
  tone: PresentationTone
}

function terrainReaction(
  id: TerrainReactionId,
  labelKey: string,
  fxCueId: string,
  sfxCueId: string,
  impactWeight: ImpactWeight,
  hitStopMs: number,
  durationMs: number,
  cameraCue: CameraCue,
  matterProfile: MatterProfile,
  tone: PresentationTone,
): TerrainReactionDefinition {
  return {
    id,
    labelKey,
    fxCueId,
    sfxCueId,
    impactWeight,
    hitStopMs,
    durationMs,
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
  vanguardStrike: presentation(
    'attack.vanguardStrike',
    'melee-heavy',
    'attack',
    'heavy',
    180,
    220,
    42,
    160,
    'impact-heavy',
    'shock-ring',
    'steel',
  ),
  rangerShot: presentation(
    'attack.rangerShot',
    'ranged-shot',
    'attack',
    'light',
    210,
    170,
    14,
    120,
    'impact-light',
    'arrow-streak',
    'wind',
  ),
  arcanistBolt: presentation(
    'attack.arcanistBolt',
    'magic-cast',
    'attack',
    'medium',
    240,
    210,
    18,
    140,
    'impact-light',
    'magic-bolt',
    'radiant',
  ),
  wardenGuard: presentation(
    'attack.wardenGuard',
    'melee-heavy',
    'attack',
    'heavy',
    190,
    215,
    34,
    150,
    'impact-heavy',
    'shock-ring',
    'steel',
  ),
  skirmisherSlash: presentation(
    'attack.skirmisherSlash',
    'melee-heavy',
    'attack',
    'heavy',
    150,
    190,
    28,
    130,
    'impact-heavy',
    'dash-burst',
    'shadow',
  ),
  clericChant: presentation(
    'attack.clericChant',
    'heal',
    'support',
    'medium',
    220,
    180,
    12,
    160,
    'support-pulse',
    'light-shards',
    'radiant',
  ),
}

export const terrainReactionDefinitions: Record<TerrainReactionId, TerrainReactionDefinition> = {
  'forest-kindling': terrainReaction(
    'forest-kindling',
    'terrainReaction.forestKindling',
    'terrain.forestKindling',
    'magic-cast',
    'medium',
    18,
    280,
    'impact-light',
    'ember-plume',
    'ember',
  ),
  'ruins-echo': terrainReaction(
    'ruins-echo',
    'terrainReaction.ruinsEcho',
    'terrain.ruinsEcho',
    'heal',
    'medium',
    10,
    280,
    'support-pulse',
    'ward-orbit',
    'ward',
  ),
  'bridge-drop': terrainReaction(
    'bridge-drop',
    'terrainReaction.bridgeDrop',
    'terrain.bridgeDrop',
    'kill-confirm',
    'finisher',
    64,
    360,
    'defeat-drop',
    'shock-ring',
    'hazard',
  ),
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
