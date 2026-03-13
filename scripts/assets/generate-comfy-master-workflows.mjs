import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'

const cwd = process.cwd()
const batchRoot = path.join(cwd, 'docs/assets/comfy-batch')
const workflowRoot = path.join(cwd, 'docs/assets/comfy-workflows')

function boundsFromNodes(nodes, padding = 40) {
  const xs = []
  const ys = []
  const x2s = []
  const y2s = []
  for (const node of nodes) {
    const [x, y] = node.pos
    const [w, h] = node.size
    xs.push(x)
    ys.push(y)
    x2s.push(x + w)
    y2s.push(y + h)
  }
  return [
    Math.min(...xs) - padding,
    Math.min(...ys) - padding,
    Math.max(...x2s) - Math.min(...xs) + padding * 2,
    Math.max(...y2s) - Math.min(...ys) + padding * 2,
  ]
}

function fitViewport(nodes, viewWidth = 1800, viewHeight = 1000, margin = 80) {
  const [minX, minY, width, height] = boundsFromNodes(nodes, 0)
  const safeWidth = Math.max(1, viewWidth - margin * 2)
  const safeHeight = Math.max(1, viewHeight - margin * 2)
  const scale = Math.max(0.08, Math.min(1, Math.min(safeWidth / width, safeHeight / height)))
  const centerX = minX + width / 2
  const centerY = minY + height / 2
  return {
    scale,
    offset: [
      viewWidth / 2 - centerX * scale,
      viewHeight / 2 - centerY * scale,
    ],
  }
}

class WorkflowBuilder {
  constructor(info) {
    this.info = info
    this.lastNodeId = 0
    this.lastLinkId = 0
    this.lastGroupId = 0
    this.nodes = []
    this.links = []
    this.groups = []
  }

  addNode(node) {
    const id = ++this.lastNodeId
    const normalized = {
      id,
      flags: {},
      order: this.nodes.length,
      mode: 0,
      inputs: [],
      outputs: [],
      properties: {},
      widgets_values: [],
      ...node,
    }
    this.nodes.push(normalized)
    return normalized
  }

  connect(originNode, originSlot, targetNode, targetSlot, type) {
    const id = ++this.lastLinkId
    const link = {
      id,
      origin_id: originNode.id,
      origin_slot: originSlot,
      target_id: targetNode.id,
      target_slot: targetSlot,
      type,
    }
    this.links.push(link)
    originNode.outputs[originSlot].links.push(id)
    targetNode.inputs[targetSlot].link = id
    return link
  }

  addGroup(title, nodes, color = '#3f789e', fontSize = 24) {
    this.groups.push({
      id: ++this.lastGroupId,
      title,
      bounding: boundsFromNodes(nodes),
      color,
      font_size: fontSize,
      flags: {},
    })
  }

  toJSON() {
    const ds = fitViewport(this.nodes)
    return {
      version: 1,
      state: {
        lastNodeId: this.lastNodeId,
        lastLinkId: this.lastLinkId,
        lastGroupid: this.lastGroupId,
        lastRerouteId: 0,
      },
      nodes: this.nodes,
      links: this.links,
      groups: this.groups,
      config: {},
      extra: {
        ds,
        info: this.info,
      },
    }
  }
}

function checkpointNode(builder, pos, ckptName) {
  return builder.addNode({
    type: 'CheckpointLoaderSimple',
    pos,
    size: [315, 98],
    outputs: [
      { localized_name: 'MODEL', name: 'MODEL', type: 'MODEL', slot_index: 0, links: [] },
      { localized_name: 'CLIP', name: 'CLIP', type: 'CLIP', slot_index: 1, links: [] },
      { localized_name: 'VAE', name: 'VAE', type: 'VAE', slot_index: 2, links: [] },
    ],
    properties: { 'Node name for S&R': 'CheckpointLoaderSimple', cnr_id: 'comfy-core', ver: '0.3.64' },
    widgets_values: [ckptName],
  })
}

function clipTextNode(builder, pos, text) {
  return builder.addNode({
    type: 'CLIPTextEncode',
    pos,
    size: [430, 220],
    inputs: [
      { localized_name: 'clip', name: 'clip', type: 'CLIP', link: null },
    ],
    outputs: [
      {
        localized_name: 'CONDITIONING',
        name: 'CONDITIONING',
        type: 'CONDITIONING',
        slot_index: 0,
        links: [],
      },
    ],
    properties: { 'Node name for S&R': 'CLIPTextEncode', cnr_id: 'comfy-core', ver: '0.3.73' },
    widgets_values: [text],
  })
}

function latentNode(builder, pos, width, height, batchSize = 1) {
  return builder.addNode({
    type: 'EmptyLatentImage',
    pos,
    size: [315, 106],
    outputs: [
      { localized_name: 'LATENT', name: 'LATENT', type: 'LATENT', slot_index: 0, links: [] },
    ],
    properties: { 'Node name for S&R': 'EmptyLatentImage', cnr_id: 'comfy-core', ver: '0.3.64' },
    widgets_values: [width, height, batchSize],
  })
}

function vaeEncodeNode(builder, pos) {
  return builder.addNode({
    type: 'VAEEncode',
    pos,
    size: [210, 46],
    inputs: [
      { localized_name: 'pixels', name: 'pixels', type: 'IMAGE', link: null },
      { localized_name: 'vae', name: 'vae', type: 'VAE', link: null },
    ],
    outputs: [
      { localized_name: 'LATENT', name: 'LATENT', type: 'LATENT', slot_index: 0, links: [] },
    ],
    properties: { 'Node name for S&R': 'VAEEncode', cnr_id: 'comfy-core', ver: '0.3.64' },
    widgets_values: [],
  })
}

function samplerNode(builder, pos, seed, steps, cfg, samplerName, scheduler, denoise = 1) {
  return builder.addNode({
    type: 'KSampler',
    pos,
    size: [315, 262],
    inputs: [
      { localized_name: 'model', name: 'model', type: 'MODEL', link: null },
      { localized_name: 'positive', name: 'positive', type: 'CONDITIONING', link: null },
      { localized_name: 'negative', name: 'negative', type: 'CONDITIONING', link: null },
      { localized_name: 'latent_image', name: 'latent_image', type: 'LATENT', link: null },
    ],
    outputs: [
      { localized_name: 'LATENT', name: 'LATENT', type: 'LATENT', slot_index: 0, links: [] },
    ],
    properties: { 'Node name for S&R': 'KSampler', cnr_id: 'comfy-core', ver: '0.3.64' },
    widgets_values: [seed, 'fixed', steps, cfg, samplerName, scheduler, denoise],
  })
}

function decodeNode(builder, pos) {
  return builder.addNode({
    type: 'VAEDecode',
    pos,
    size: [210, 46],
    inputs: [
      { localized_name: 'samples', name: 'samples', type: 'LATENT', link: null },
      { localized_name: 'vae', name: 'vae', type: 'VAE', link: null },
    ],
    outputs: [
      { localized_name: 'IMAGE', name: 'IMAGE', type: 'IMAGE', slot_index: 0, links: [] },
    ],
    properties: { 'Node name for S&R': 'VAEDecode', cnr_id: 'comfy-core', ver: '0.3.64' },
    widgets_values: [],
  })
}

function imageScaleNode(builder, pos, upscaleMethod, width, height, crop = 'center') {
  return builder.addNode({
    type: 'ImageScale',
    pos,
    size: [315, 130],
    inputs: [
      { localized_name: 'image', name: 'image', type: 'IMAGE', link: null },
    ],
    outputs: [
      { localized_name: 'IMAGE', name: 'IMAGE', type: 'IMAGE', slot_index: 0, links: [] },
    ],
    properties: { 'Node name for S&R': 'ImageScale', cnr_id: 'comfy-core', ver: '0.3.64' },
    widgets_values: [upscaleMethod, width, height, crop],
  })
}

function saveNode(builder, pos, prefix) {
  return builder.addNode({
    type: 'SaveImage',
    pos,
    size: [320, 78],
    inputs: [
      { localized_name: 'images', name: 'images', type: 'IMAGE', link: null },
    ],
    outputs: [],
    properties: { 'Node name for S&R': 'SaveImage', cnr_id: 'comfy-core', ver: '0.3.65' },
    widgets_values: [prefix],
  })
}

function buildUnitPrompts(manifest, unit) {
  const teamTone = unit.team === 'allies' ? 'allied disciplined battlefield unit' : 'enemy roughened battlefield unit'
  const classTone = manifest.classTones[unit.classId]
  return {
    reference: [
      manifest.promptBlocks.globalPositive,
      unit.identity,
      classTone,
      teamTone,
      `palette of ${unit.palette}`,
      `silhouette anchored by ${unit.silhouette}`,
      unit.mood,
      manifest.promptBlocks.referenceDirective,
    ].join(', '),
    portrait: [
      manifest.promptBlocks.globalPositive,
      unit.identity,
      classTone,
      `palette of ${unit.palette}`,
      unit.mood,
      manifest.promptBlocks.portraitDirective,
    ].join(', '),
    atlas: [
      manifest.promptBlocks.globalPositive,
      unit.identity,
      classTone,
      teamTone,
      `palette of ${unit.palette}`,
      `silhouette anchored by ${unit.silhouette}`,
      unit.atlasEmphasis,
      manifest.promptBlocks.atlasDirective,
    ].join(', '),
  }
}

function buildTerrainBlockPrompt(manifest, terrain, variant) {
  return [
    manifest.promptBlocks.globalPositive,
    `${terrain.label.toLowerCase()} terrain family`,
    variant.descriptor,
    manifest.promptBlocks.blockDirective,
  ].join(', ')
}

function buildTerrainOverlayPrompt(manifest, terrain) {
  return [
    manifest.promptBlocks.globalPositive,
    `${terrain.label.toLowerCase()} terrain overlay`,
    terrain.overlay.descriptor,
    manifest.promptBlocks.overlayDirective,
  ].join(', ')
}

function buildVfxPrompt(manifest, sheet) {
  return [
    manifest.promptBlocks.globalPositive,
    `${sheet.cueId} primary effect`,
    `${sheet.tone} tone family`,
    sheet.descriptor,
    manifest.promptBlocks.sheetDirective,
  ].join(', ')
}

function buildUnitWorkflow(manifest) {
  const builder = new WorkflowBuilder({
    name: 'Glenmoor Unit Master Batch',
    description:
      'Master unit workflow generated from docs/assets/comfy-batch/unit-master-batch.manifest.json. One graph emits reference, portrait, and battle atlas outputs for the full named roster.',
    manifest: 'docs/assets/comfy-batch/unit-master-batch.manifest.json',
  })

  const checkpoint = checkpointNode(builder, [-1650, 120], manifest.checkpointDefault)
  const negative = clipTextNode(builder, [-1180, 120], manifest.promptBlocks.globalNegative)
  const referenceLatent = latentNode(builder, [-1650, 420], ...manifest.latentSizes.reference)
  const portraitLatent = latentNode(builder, [-1650, 620], ...manifest.latentSizes.portrait)

  builder.connect(checkpoint, 1, negative, 0, 'CLIP')
  builder.addGroup('Master Setup', [checkpoint, negative, referenceLatent, portraitLatent], '#355b74')

  const teamColors = {
    allies: '#54735c',
    enemies: '#6d4d4d',
  }

  manifest.units.forEach((unit, index) => {
    const prompts = buildUnitPrompts(manifest, unit)
    const col = index % 2
    const row = Math.floor(index / 2)
    const xBase = -450 + col * 1800
    const yBase = row * 1050

    const refClip = clipTextNode(builder, [xBase, yBase], prompts.reference)
    const refSampler = samplerNode(
      builder,
      [xBase + 470, yBase],
      unit.seedFamily + 1,
      manifest.sampling.reference.steps,
      manifest.sampling.reference.cfg,
      manifest.sampling.reference.sampler,
      manifest.sampling.reference.scheduler,
      manifest.sampling.reference.denoise,
    )
    const refDecode = decodeNode(builder, [xBase + 840, yBase + 20])
    const refSave = saveNode(builder, [xBase + 1090, yBase], `unit_${unit.id}_reference`)

    builder.connect(checkpoint, 1, refClip, 0, 'CLIP')
    builder.connect(checkpoint, 0, refSampler, 0, 'MODEL')
    builder.connect(refClip, 0, refSampler, 1, 'CONDITIONING')
    builder.connect(negative, 0, refSampler, 2, 'CONDITIONING')
    builder.connect(referenceLatent, 0, refSampler, 3, 'LATENT')
    builder.connect(refSampler, 0, refDecode, 0, 'LATENT')
    builder.connect(checkpoint, 2, refDecode, 1, 'VAE')
    builder.connect(refDecode, 0, refSave, 0, 'IMAGE')

    const portraitClip = clipTextNode(builder, [xBase, yBase + 280], prompts.portrait)
    const portraitSampler = samplerNode(
      builder,
      [xBase + 470, yBase + 280],
      unit.seedFamily + 2,
      manifest.sampling.portrait.steps,
      manifest.sampling.portrait.cfg,
      manifest.sampling.portrait.sampler,
      manifest.sampling.portrait.scheduler,
      manifest.sampling.portrait.denoise,
    )
    const portraitDecode = decodeNode(builder, [xBase + 840, yBase + 300])
    const portraitScale = imageScaleNode(
      builder,
      [xBase + 1080, yBase + 290],
      'lanczos',
      ...manifest.exportSizes.portrait,
    )
    const portraitSave = saveNode(builder, [xBase + 1340, yBase + 280], `unit_${unit.id}_head`)

    builder.connect(checkpoint, 1, portraitClip, 0, 'CLIP')
    builder.connect(checkpoint, 0, portraitSampler, 0, 'MODEL')
    builder.connect(portraitClip, 0, portraitSampler, 1, 'CONDITIONING')
    builder.connect(negative, 0, portraitSampler, 2, 'CONDITIONING')
    builder.connect(portraitLatent, 0, portraitSampler, 3, 'LATENT')
    builder.connect(portraitSampler, 0, portraitDecode, 0, 'LATENT')
    builder.connect(checkpoint, 2, portraitDecode, 1, 'VAE')
    builder.connect(portraitDecode, 0, portraitScale, 0, 'IMAGE')
    builder.connect(portraitScale, 0, portraitSave, 0, 'IMAGE')

    const atlasPrepScale = imageScaleNode(
      builder,
      [xBase + 1090, yBase + 520],
      'lanczos',
      ...manifest.latentSizes.atlasSource,
      'center',
    )
    const atlasEncode = vaeEncodeNode(builder, [xBase + 1440, yBase + 570])
    const atlasClip = clipTextNode(builder, [xBase, yBase + 600], prompts.atlas)
    const atlasSampler = samplerNode(
      builder,
      [xBase + 470, yBase + 600],
      unit.seedFamily + 3,
      manifest.sampling.atlas.steps,
      manifest.sampling.atlas.cfg,
      manifest.sampling.atlas.sampler,
      manifest.sampling.atlas.scheduler,
      manifest.sampling.atlas.denoise,
    )
    const atlasDecode = decodeNode(builder, [xBase + 840, yBase + 620])
    const atlasExportScale = imageScaleNode(
      builder,
      [xBase + 1090, yBase + 610],
      'lanczos',
      ...manifest.exportSizes.atlas,
      'disabled',
    )
    const atlasSave = saveNode(builder, [xBase + 1360, yBase + 600], `unit_${unit.id}_battle`)

    builder.connect(checkpoint, 1, atlasClip, 0, 'CLIP')
    builder.connect(checkpoint, 0, atlasSampler, 0, 'MODEL')
    builder.connect(atlasClip, 0, atlasSampler, 1, 'CONDITIONING')
    builder.connect(negative, 0, atlasSampler, 2, 'CONDITIONING')
    builder.connect(refDecode, 0, atlasPrepScale, 0, 'IMAGE')
    builder.connect(atlasPrepScale, 0, atlasEncode, 0, 'IMAGE')
    builder.connect(checkpoint, 2, atlasEncode, 1, 'VAE')
    builder.connect(atlasEncode, 0, atlasSampler, 3, 'LATENT')
    builder.connect(atlasSampler, 0, atlasDecode, 0, 'LATENT')
    builder.connect(checkpoint, 2, atlasDecode, 1, 'VAE')
    builder.connect(atlasDecode, 0, atlasExportScale, 0, 'IMAGE')
    builder.connect(atlasExportScale, 0, atlasSave, 0, 'IMAGE')

    builder.addGroup(
      `${unit.displayName} (${unit.team})`,
      [
        refClip,
        refSampler,
        refDecode,
        refSave,
        portraitClip,
        portraitSampler,
        portraitDecode,
        portraitScale,
        portraitSave,
        atlasPrepScale,
        atlasEncode,
        atlasClip,
        atlasSampler,
        atlasDecode,
        atlasExportScale,
        atlasSave,
      ],
      teamColors[unit.team] ?? '#54735c',
    )
  })

  return builder.toJSON()
}

function buildTerrainWorkflow(manifest) {
  const builder = new WorkflowBuilder({
    name: 'Glenmoor Terrain Catalog Batch',
    description:
      'Master terrain workflow generated from docs/assets/comfy-batch/terrain-catalog-batch.manifest.json. One graph emits every required terrain block and overlay output.',
    manifest: 'docs/assets/comfy-batch/terrain-catalog-batch.manifest.json',
  })

  const checkpoint = checkpointNode(builder, [-1300, 120], manifest.checkpointDefault)
  const negative = clipTextNode(builder, [-830, 120], manifest.promptBlocks.globalNegative)
  const latent = latentNode(builder, [-1300, 420], ...manifest.sourceSize)
  builder.connect(checkpoint, 1, negative, 0, 'CLIP')
  builder.addGroup('Master Setup', [checkpoint, negative, latent], '#355b74')

  manifest.terrains.forEach((terrain, index) => {
    const col = index % 2
    const row = Math.floor(index / 2)
    const xBase = -260 + col * 1820
    const yBase = row * 1050
    const groupNodes = []

    terrain.variants.forEach((variant, variantIndex) => {
      const y = yBase + variantIndex * 250
      const clip = clipTextNode(builder, [xBase, y], buildTerrainBlockPrompt(manifest, terrain, variant))
      const sampler = samplerNode(
        builder,
        [xBase + 470, y],
        510000 + index * 100 + variantIndex,
        manifest.sampling.steps,
        manifest.sampling.cfg,
        manifest.sampling.sampler,
        manifest.sampling.scheduler,
        manifest.sampling.denoise,
      )
      const decode = decodeNode(builder, [xBase + 840, y + 20])
      const scale = imageScaleNode(
        builder,
        [xBase + 1090, y + 5],
        'lanczos',
        ...manifest.exportSize,
        'disabled',
      )
      const save = saveNode(builder, [xBase + 1360, y], `terrain_${terrain.terrainId}_${variant.suffix}_block`)

      builder.connect(checkpoint, 1, clip, 0, 'CLIP')
      builder.connect(checkpoint, 0, sampler, 0, 'MODEL')
      builder.connect(clip, 0, sampler, 1, 'CONDITIONING')
      builder.connect(negative, 0, sampler, 2, 'CONDITIONING')
      builder.connect(latent, 0, sampler, 3, 'LATENT')
      builder.connect(sampler, 0, decode, 0, 'LATENT')
      builder.connect(checkpoint, 2, decode, 1, 'VAE')
      builder.connect(decode, 0, scale, 0, 'IMAGE')
      builder.connect(scale, 0, save, 0, 'IMAGE')
      groupNodes.push(clip, sampler, decode, scale, save)
    })

    if (terrain.overlay) {
      const y = yBase + terrain.variants.length * 250
      const clip = clipTextNode(builder, [xBase, y], buildTerrainOverlayPrompt(manifest, terrain))
      const sampler = samplerNode(
        builder,
        [xBase + 470, y],
        510000 + index * 100 + 90,
        manifest.sampling.steps,
        manifest.sampling.cfg,
        manifest.sampling.sampler,
        manifest.sampling.scheduler,
        manifest.sampling.denoise,
      )
      const decode = decodeNode(builder, [xBase + 840, y + 20])
      const scale = imageScaleNode(
        builder,
        [xBase + 1090, y + 5],
        'lanczos',
        ...manifest.exportSize,
        'disabled',
      )
      const save = saveNode(
        builder,
        [xBase + 1360, y],
        `terrain_${terrain.terrainId}_${terrain.overlay.suffix}_overlay`,
      )

      builder.connect(checkpoint, 1, clip, 0, 'CLIP')
      builder.connect(checkpoint, 0, sampler, 0, 'MODEL')
      builder.connect(clip, 0, sampler, 1, 'CONDITIONING')
      builder.connect(negative, 0, sampler, 2, 'CONDITIONING')
      builder.connect(latent, 0, sampler, 3, 'LATENT')
      builder.connect(sampler, 0, decode, 0, 'LATENT')
      builder.connect(checkpoint, 2, decode, 1, 'VAE')
      builder.connect(decode, 0, scale, 0, 'IMAGE')
      builder.connect(scale, 0, save, 0, 'IMAGE')
      groupNodes.push(clip, sampler, decode, scale, save)
    }

    builder.addGroup(`${terrain.label} Terrain Family`, groupNodes, '#5a6c54')
  })

  return builder.toJSON()
}

function buildVfxWorkflow(manifest) {
  const builder = new WorkflowBuilder({
    name: 'Glenmoor VFX Master Batch',
    description:
      'Master VFX workflow generated from docs/assets/comfy-batch/vfx-master-batch.manifest.json. One graph emits every required primary combat effect sheet.',
    manifest: 'docs/assets/comfy-batch/vfx-master-batch.manifest.json',
  })

  const checkpoint = checkpointNode(builder, [-1100, 120], manifest.checkpointDefault)
  const negative = clipTextNode(builder, [-650, 120], manifest.promptBlocks.globalNegative)
  const latent = latentNode(builder, [-1100, 420], ...manifest.sourceSize)
  builder.connect(checkpoint, 1, negative, 0, 'CLIP')
  builder.addGroup('Master Setup', [checkpoint, negative, latent], '#355b74')

  manifest.primarySheets.forEach((sheet, index) => {
    const col = index % 2
    const row = Math.floor(index / 2)
    const xBase = -180 + col * 1780
    const yBase = row * 420

    const clip = clipTextNode(builder, [xBase, yBase], buildVfxPrompt(manifest, sheet))
    const sampler = samplerNode(
      builder,
      [xBase + 470, yBase],
      610000 + index,
      manifest.sampling.steps,
      manifest.sampling.cfg,
      manifest.sampling.sampler,
      manifest.sampling.scheduler,
      manifest.sampling.denoise,
    )
    const decode = decodeNode(builder, [xBase + 840, yBase + 20])
    const scale = imageScaleNode(
      builder,
      [xBase + 1090, yBase + 5],
      'lanczos',
      ...manifest.exportSize,
      'disabled',
    )
    const save = saveNode(builder, [xBase + 1360, yBase], `vfx_${sheet.cueId}_${sheet.tone}_${sheet.variant}`)

    builder.connect(checkpoint, 1, clip, 0, 'CLIP')
    builder.connect(checkpoint, 0, sampler, 0, 'MODEL')
    builder.connect(clip, 0, sampler, 1, 'CONDITIONING')
    builder.connect(negative, 0, sampler, 2, 'CONDITIONING')
    builder.connect(latent, 0, sampler, 3, 'LATENT')
    builder.connect(sampler, 0, decode, 0, 'LATENT')
    builder.connect(checkpoint, 2, decode, 1, 'VAE')
    builder.connect(decode, 0, scale, 0, 'IMAGE')
    builder.connect(scale, 0, save, 0, 'IMAGE')

    builder.addGroup(`${sheet.cueId} / ${sheet.tone}`, [clip, sampler, decode, scale, save], '#7a5b54')
  })

  return builder.toJSON()
}

async function loadJson(name) {
  return JSON.parse(await readFile(path.join(batchRoot, name), 'utf8'))
}

async function writeWorkflow(name, payload) {
  await mkdir(workflowRoot, { recursive: true })
  await writeFile(path.join(workflowRoot, name), JSON.stringify(payload, null, 2) + '\n')
}

async function main() {
  const unitManifest = await loadJson('unit-master-batch.manifest.json')
  const terrainManifest = await loadJson('terrain-catalog-batch.manifest.json')
  const vfxManifest = await loadJson('vfx-master-batch.manifest.json')

  await writeWorkflow('unit-master-batch.ui-workflow.json', buildUnitWorkflow(unitManifest))
  await writeWorkflow('terrain-catalog-batch.ui-workflow.json', buildTerrainWorkflow(terrainManifest))
  await writeWorkflow('vfx-master-batch.ui-workflow.json', buildVfxWorkflow(vfxManifest))

  console.log(`Generated Comfy master workflows in ${workflowRoot}`)
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
