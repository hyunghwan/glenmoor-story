import fs from 'node:fs'
import path from 'node:path'

const mapCache = new Map()

function assert(condition, message) {
  if (!condition) {
    throw new Error(message)
  }
}

function normalizeQuarterTurns(turns) {
  return ((Math.trunc(turns) % 4) + 4) % 4
}

function rotateGridPoint(point, mapWidth, mapHeight, rotationQuarterTurns = 0) {
  const turns = normalizeQuarterTurns(rotationQuarterTurns)

  if (turns === 0 || mapWidth <= 0 || mapHeight <= 0) {
    return { x: point.x, y: point.y }
  }

  switch (turns) {
    case 1:
      return { x: mapHeight - 1 - point.y, y: point.x }
    case 2:
      return { x: mapWidth - 1 - point.x, y: mapHeight - 1 - point.y }
    case 3:
      return { x: point.y, y: mapWidth - 1 - point.x }
    default:
      return { x: point.x, y: point.y }
  }
}

function loadMapHeightData(mapId) {
  if (mapCache.has(mapId)) {
    return mapCache.get(mapId)
  }

  const mapPath = path.resolve('public/data/maps', `${mapId}.json`)
  const mapData = JSON.parse(fs.readFileSync(mapPath, 'utf8'))
  const heightLayer = mapData.layers.find((layer) => layer.name === 'height')

  assert(heightLayer, `Map ${mapId} is missing a height layer`)

  const cached = {
    width: mapData.width,
    height: mapData.height,
    values: heightLayer.data,
  }
  mapCache.set(mapId, cached)
  return cached
}

function resolveTileHeight(mapId, point) {
  const map = loadMapHeightData(mapId)
  const index = point.y * map.width + point.x
  const value = map.values[index]

  assert(Number.isFinite(value), `Missing height value for tile ${point.x},${point.y} on map ${mapId}`)

  return Math.max(0, value - 1)
}

async function readCanvasMetrics(page) {
  return page.locator('canvas').evaluate((canvas) => {
    const rect = canvas.getBoundingClientRect()

    return {
      left: rect.left,
      top: rect.top,
      width: rect.width,
      height: rect.height,
      internalWidth: canvas.width,
      internalHeight: canvas.height,
    }
  })
}

export function getUnitPosition(state, unitId) {
  const unit = state?.telemetry?.units?.find((entry) => entry.id === unitId)
  assert(unit, `Missing telemetry for unit ${unitId}`)
  return unit.position
}

function projectPointWithCanvas(state, point, canvas) {
  const telemetry = state?.telemetry
  const mapId = telemetry?.mapId
  const boardProjection = telemetry?.boardProjection
  const camera = telemetry?.camera

  assert(mapId, 'Missing telemetry.mapId')
  assert(boardProjection, 'Missing telemetry.boardProjection')
  assert(camera, 'Missing telemetry.camera')
  assert(canvas.width > 0 && canvas.height > 0, 'Canvas bounds are not ready')
  assert(canvas.internalWidth > 0 && canvas.internalHeight > 0, 'Canvas resolution is not ready')

  const tileHeight = resolveTileHeight(mapId, point)
  const rotated = rotateGridPoint(
    point,
    boardProjection.mapWidth,
    boardProjection.mapHeight,
    camera.rotationQuarterTurns,
  )
  const world = {
    x: boardProjection.origin.x + (rotated.x - rotated.y) * (boardProjection.tileWidth / 2),
    y:
      boardProjection.origin.y +
      (rotated.x + rotated.y) * (boardProjection.tileHeight / 2) -
      tileHeight * boardProjection.heightStep,
  }
  const screen = {
    x: (world.x - camera.scrollX) * camera.zoom,
    y: (world.y - camera.scrollY) * camera.zoom,
  }

  return {
    point,
    height: tileHeight,
    world,
    screen,
    client: {
      x: canvas.left + screen.x * (canvas.width / canvas.internalWidth),
      y: canvas.top + screen.y * (canvas.height / canvas.internalHeight),
    },
  }
}

export async function projectTileToClient(page, state, point) {
  const canvas = await readCanvasMetrics(page)
  return projectPointWithCanvas(state, point, canvas)
}

export async function projectTilesToClient(page, state, points) {
  const canvas = await readCanvasMetrics(page)
  return points.map((point) => projectPointWithCanvas(state, point, canvas))
}

export async function hoverProjectedTile(page, state, point, pauseMs = 150) {
  const projection = await projectTileToClient(page, state, point)
  await page.mouse.move(projection.client.x, projection.client.y)

  if (pauseMs > 0) {
    await page.waitForTimeout(pauseMs)
  }

  return projection
}

export async function clickProjectedTile(page, state, point, pauseMs = 150) {
  const projection = await projectTileToClient(page, state, point)
  await page.mouse.click(projection.client.x, projection.client.y)

  if (pauseMs > 0) {
    await page.waitForTimeout(pauseMs)
  }

  return projection
}
