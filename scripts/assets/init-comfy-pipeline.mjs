import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'

const cwd = process.cwd()
const scenarioPath = path.join(cwd, 'src/game/data/glenmoor-pass.scenario.json')
const classDefsPath = path.join(cwd, 'src/game/data/class-definitions.json')
const skillDefsPath = path.join(cwd, 'src/game/data/skill-definitions.json')
const outputRoot = path.join(cwd, 'output/comfy')
const workflowTemplateRoot = path.join(cwd, 'docs/assets/comfy-workflows')
const batchManifestRoot = path.join(cwd, 'docs/assets/comfy-batch')

const terrainIds = ['grass', 'road', 'forest', 'water', 'stone', 'bridge', 'ruins']
const vfxCueIds = ['impact-flash', 'cast-burst', 'status-pulse', 'projectile-burst']
const pilotUnits = new Set(['rowan', 'elira', 'hexbinder'])
const atlasDirections = ['north', 'east', 'south', 'west']
const atlasAnimations = [
  ['idle', 2],
  ['move', 6],
  ['attack', 5],
  ['cast', 5],
  ['hit', 2],
  ['defeat', 4],
]

const classVisuals = {
  vanguard: {
    silhouette: 'shield-forward frontline silhouette with a one-handed blade',
    palette: 'weathered steel, muted blue cloth, leather brown',
    prompt: 'practical knight armor, shield and sword, grounded frontline stance',
  },
  ranger: {
    silhouette: 'lean bow-user silhouette with readable cloak and longbow arc',
    palette: 'moss green, ash brown, faded tan, worn bronze',
    prompt: 'field archer gear, layered leather and cloth, disciplined travel silhouette',
  },
  arcanist: {
    silhouette: 'caster silhouette with staff or focus-hand read and layered robe massing',
    palette: 'charcoal, ember orange, dim gold, muted robe accents',
    prompt: 'battle mage robes, controlled sigils, readable hands and staff silhouette',
  },
  warden: {
    silhouette: 'defensive guardian silhouette with broad shield or ward focus',
    palette: 'tempered steel, slate, muted ivory, ward-lit accents',
    prompt: 'protector armor, defensive posture, sturdy grounded silhouette',
  },
  skirmisher: {
    silhouette: 'fast duelist silhouette with compact cloak or belts and agile stance',
    palette: 'smoked leather, dark plum, charcoal, muted crimson',
    prompt: 'agile melee gear, light armor, clean line of action',
  },
  cleric: {
    silhouette: 'support caster silhouette with prayer sash or ritual focus',
    palette: 'linen white, soft gold, desaturated blue-gray, warm parchment',
    prompt: 'battlefield support robes, ritual accents, calm readable posture',
  },
}

const unitOverrides = {
  rowan: {
    displayName: 'Rowan',
    brief: 'allied veteran vanguard in a worn steel-blue surcoat with heater shield and straight longsword',
    palette: 'steel blue, parchment cream, weathered iron, leather brown',
    silhouette: 'broad shield, squared stance, disciplined sword arm',
  },
  elira: {
    displayName: 'Elira',
    brief: 'allied ranger in a moss-green cloak with yew longbow and travel leathers',
    palette: 'moss green, ash brown, faded tan, weathered bronze',
    silhouette: 'longbow arc, light cloak profile, alert archer stance',
  },
  hexbinder: {
    displayName: 'Hexbinder',
    brief: 'enemy arcanist in charred burgundy and soot-black robes with ember sigils and hooked staff',
    palette: 'charred burgundy, soot black, dim gold, ember orange',
    silhouette: 'hooked staff, layered robe hem, hostile casting hand read',
  },
}

function humanizeId(id) {
  return id
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/^./, (char) => char.toUpperCase())
}

function dedupeUnits(units) {
  const seen = new Set()
  return units.filter((unit) => {
    if (seen.has(unit.id)) {
      return false
    }
    seen.add(unit.id)
    return true
  })
}

function buildUnitBrief(unit, classDef, skillDef) {
  const classVisual = classVisuals[unit.classId]
  const override = unitOverrides[unit.id]
  const displayName = override?.displayName ?? humanizeId(unit.id)
  const roleTone = unit.team === 'allies' ? 'allied disciplined battlefield kit' : 'enemy roughened battlefield kit'

  return `# ${displayName} Reference Sheet

- Unit ID: \`${unit.id}\`
- Team: \`${unit.team}\`
- Class ID: \`${unit.classId}\`
- Signature skill: \`${skillDef.id}\`
- Pilot slice: \`${pilotUnits.has(unit.id) ? 'yes' : 'no'}\`
- Prototype assumption:
  ${override?.brief ?? `same role family as ${humanizeId(unit.classId)}, with one unit-specific accessory or trim detail to avoid duplicate silhouettes`}
- Locked silhouette:
  ${override?.silhouette ?? classVisual.silhouette}
- Locked palette:
  ${override?.palette ?? classVisual.palette}
- Role framing:
  ${roleTone}, ${classVisual.prompt}
- Gameplay role:
  max HP ${classDef.stats.maxHp}, move ${classDef.stats.move}, speed ${classDef.stats.speed}
- Production order:
  master workflow reference -> portrait -> battle atlas -> fixed JSON manifest
- QA reminders:
  keep feet readable in the atlas, keep portrait eyes and brow readable at 32x32, keep weapon design stable across all directions
`
}

function buildUnitRunLog(unit) {
  return JSON.stringify(
    {
      unitId: unit.id,
      pilotSlice: pilotUnits.has(unit.id),
      workflow: 'docs/assets/comfy-workflows/unit-master-batch.ui-workflow.json',
      batchManifest: 'docs/assets/comfy-batch/unit-master-batch.manifest.json',
      expectedOutputs: {
        reference: `unit_${unit.id}_reference_00001_.png`,
        portrait: `unit_${unit.id}_head_00001_.png`,
        battleAtlas: `unit_${unit.id}_battle_00001_.png`,
        battleManifest: `output/comfy/manifests/battle-json/unit_${unit.id}_battle.json`,
      },
      reviewNotes: [],
    },
    null,
    2,
  )
}

function buildTerrainRunSheet(terrainId) {
  return `# ${humanizeId(terrainId)} Terrain Run Sheet

- Terrain ID: \`${terrainId}\`
- Master workflow:
  \`docs/assets/comfy-workflows/terrain-catalog-batch.ui-workflow.json\`
- Batch manifest:
  \`docs/assets/comfy-batch/terrain-catalog-batch.manifest.json\`
- Run model:
  one queue run emits every terrain family; review this terrain family's files under \`output/comfy/terrain/${terrainId}/\`
- Expected outputs:
  block variants and optional overlay files using the locked filename contract
`
}

function buildVfxRunSheet(cueId) {
  return `# ${humanizeId(cueId)} VFX Run Sheet

- Cue ID: \`${cueId}\`
- Master workflow:
  \`docs/assets/comfy-workflows/vfx-master-batch.ui-workflow.json\`
- Batch manifest:
  \`docs/assets/comfy-batch/vfx-master-batch.manifest.json\`
- Run model:
  one queue run emits every primary VFX sheet; review this cue family's files under \`output/comfy/vfx/${cueId}/\`
- Expected outputs:
  primary 256x256 transparent sheet files using the locked filename contract
`
}

function buildStyleBibleShotList() {
  return `# Style Bible Shot List

Use \`docs/assets/comfy-pilot-prompt-pack.md\` for the debug lookdev prompts.

- grass battlefield mood
- road battlefield mood
- forest battlefield mood
- bridge battlefield mood
- Rowan key art
- Elira key art
- Hexbinder key art
- zoom combat mood A
- zoom combat mood B

This is the optional debug lookdev path. Main production now starts from the three master batch workflows.
`
}

function buildBattleAtlasManifest(unitId) {
  const frames = []
  const frameWidth = 128
  const frameHeight = 128
  const pivotX = 64
  const pivotY = 108

  for (const [directionIndex, direction] of atlasDirections.entries()) {
    const rowA = directionIndex * 2
    const rowB = rowA + 1

    const rowAFrames = [
      ['idle', 0],
      ['idle', 1],
      ...Array.from({ length: 6 }, (_, index) => ['move', index]),
      ...Array.from({ length: 4 }, (_, index) => ['attack', index]),
    ]
    const rowBFrames = [
      ['attack', 4],
      ...Array.from({ length: 5 }, (_, index) => ['cast', index]),
      ...Array.from({ length: 2 }, (_, index) => ['hit', index]),
      ...Array.from({ length: 4 }, (_, index) => ['defeat', index]),
    ]

    for (const [column, [animation, index]] of rowAFrames.entries()) {
      frames.push({
        frameId: `unit_${unitId}_${direction}_${animation}_${String(index).padStart(2, '0')}`,
        direction,
        animation,
        index,
        x: column * frameWidth,
        y: rowA * frameHeight,
        w: frameWidth,
        h: frameHeight,
        pivotX,
        pivotY,
      })
    }

    for (const [column, [animation, index]] of rowBFrames.entries()) {
      frames.push({
        frameId: `unit_${unitId}_${direction}_${animation}_${String(index).padStart(2, '0')}`,
        direction,
        animation,
        index,
        x: column * frameWidth,
        y: rowB * frameHeight,
        w: frameWidth,
        h: frameHeight,
        pivotX,
        pivotY,
      })
    }
  }

  return JSON.stringify(
    {
      unitId,
      atlasFile: `unit_${unitId}_battle.webp`,
      frameWidth,
      frameHeight,
      pivotX,
      pivotY,
      directions: atlasDirections,
      animations: Object.fromEntries(atlasAnimations),
      frames,
    },
    null,
    2,
  )
}

async function ensureDir(dirPath) {
  await mkdir(dirPath, { recursive: true })
}

async function main() {
  const scenario = JSON.parse(await readFile(scenarioPath, 'utf8'))
  const classDefs = JSON.parse(await readFile(classDefsPath, 'utf8'))
  const skillDefs = JSON.parse(await readFile(skillDefsPath, 'utf8'))
  const classMap = Object.fromEntries(classDefs.map((entry) => [entry.id, entry]))
  const skillMap = Object.fromEntries(skillDefs.map((entry) => [entry.id, entry]))

  const units = dedupeUnits([
    ...scenario.allies,
    ...scenario.enemies,
    ...scenario.events.flatMap((event) =>
      event.effects
        .filter((effect) => effect.type === 'deploy-unit')
        .map((effect) => effect.unit),
    ),
  ])

  const manifestsOutputRoot = path.join(outputRoot, 'manifests')
  const battleJsonOutputRoot = path.join(manifestsOutputRoot, 'battle-json')

  await ensureDir(outputRoot)
  await ensureDir(path.join(outputRoot, 'style-bible'))
  await ensureDir(path.join(outputRoot, 'workflows'))
  await ensureDir(manifestsOutputRoot)
  await ensureDir(battleJsonOutputRoot)

  await writeFile(
    path.join(outputRoot, 'README.md'),
    `# Comfy Working Tree

This directory is the local working area for Comfy Cloud asset generation.

- Style bible debug work starts in \`style-bible/\`
- Character review lives in \`units/<unitId>/\`
- Terrain review lives in \`terrain/<terrainId>/\`
- VFX review lives in \`vfx/<cueId>/\`
- Import-ready workflows are copied into \`workflows/\`
- Batch manifests and generated battle JSON files live in \`manifests/\`

Tracked source docs live under:

- \`docs/assets/comfy-cloud-asset-pipeline.md\`
- \`docs/assets/comfy-pilot-prompt-pack.md\`
- \`docs/assets/comfy-batch/\`
- \`docs/assets/comfy-workflows/\`
`,
  )

  await writeFile(path.join(outputRoot, 'style-bible', 'lookdev-shot-list.md'), buildStyleBibleShotList())
  await writeFile(
    path.join(outputRoot, 'style-bible', 'run-log.template.json'),
    JSON.stringify(
      {
        workflow: 'docs/assets/comfy-workflows/style-bible-lookdev.ui-workflow.json',
        shots: [],
      },
      null,
      2,
    ),
  )

  for (const unit of units) {
    const classDef = classMap[unit.classId]
    const skillDef = skillMap[classDef.signatureSkillId]
    const unitRoot = path.join(outputRoot, 'units', unit.id)
    const refsRoot = path.join(unitRoot, 'references')
    const framesRoot = path.join(unitRoot, 'frames')

    await ensureDir(refsRoot)
    await ensureDir(framesRoot)

    await writeFile(
      path.join(refsRoot, 'reference-sheet.md'),
      buildUnitBrief(unit, classDef, skillDef),
    )
    await writeFile(path.join(framesRoot, 'run-log.template.json'), buildUnitRunLog(unit))
    await writeFile(
      path.join(battleJsonOutputRoot, `unit_${unit.id}_battle.json`),
      buildBattleAtlasManifest(unit.id),
    )
  }

  for (const terrainId of terrainIds) {
    const terrainRoot = path.join(outputRoot, 'terrain', terrainId)
    await ensureDir(terrainRoot)
    await writeFile(path.join(terrainRoot, 'run-sheet.md'), buildTerrainRunSheet(terrainId))
    await writeFile(
      path.join(terrainRoot, 'run-log.template.json'),
      JSON.stringify(
        {
          terrainId,
          workflow: 'docs/assets/comfy-workflows/terrain-catalog-batch.ui-workflow.json',
          batchManifest: 'docs/assets/comfy-batch/terrain-catalog-batch.manifest.json',
          reviewedOutputs: [],
        },
        null,
        2,
      ),
    )
  }

  for (const cueId of vfxCueIds) {
    const vfxRoot = path.join(outputRoot, 'vfx', cueId)
    await ensureDir(vfxRoot)
    await writeFile(path.join(vfxRoot, 'run-sheet.md'), buildVfxRunSheet(cueId))
    await writeFile(
      path.join(vfxRoot, 'run-log.template.json'),
      JSON.stringify(
        {
          cueId,
          workflow: 'docs/assets/comfy-workflows/vfx-master-batch.ui-workflow.json',
          batchManifest: 'docs/assets/comfy-batch/vfx-master-batch.manifest.json',
          reviewedOutputs: [],
        },
        null,
        2,
      ),
    )
  }

  const workflowFiles = [
    'style-bible-lookdev.ui-workflow.json',
    'style-bible-lookdev.comfy-workflow-template.json',
    'unit-master-batch.ui-workflow.json',
    'terrain-catalog-batch.ui-workflow.json',
    'vfx-master-batch.ui-workflow.json',
    'unit-variant-img2img-controlnet.comfy-workflow-template.json',
    'terrain-material-to-tile.comfy-workflow-template.json',
    'vfx-burst-plate.comfy-workflow-template.json',
  ]

  for (const fileName of workflowFiles) {
    const source = await readFile(path.join(workflowTemplateRoot, fileName), 'utf8')
    await writeFile(path.join(outputRoot, 'workflows', fileName), source)
  }

  const batchManifestFiles = [
    'unit-master-batch.manifest.json',
    'terrain-catalog-batch.manifest.json',
    'vfx-master-batch.manifest.json',
  ]

  for (const fileName of batchManifestFiles) {
    const source = await readFile(path.join(batchManifestRoot, fileName), 'utf8')
    await writeFile(path.join(manifestsOutputRoot, fileName), source)
  }

  console.log(`Initialized Comfy working tree at ${outputRoot}`)
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
