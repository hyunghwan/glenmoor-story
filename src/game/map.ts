import { terrainDefinitions } from './content'
import type { BattleMapData, TerrainKey, TiledMapData } from './types'

const terrainLegend: Record<number, TerrainKey> = {
  1: 'grass',
  2: 'road',
  3: 'forest',
  4: 'water',
  5: 'stone',
  6: 'bridge',
  7: 'ruins',
}

export function parseTiledMap(id: string, data: TiledMapData): BattleMapData {
  const terrainLayer = data.layers.find((layer) => layer.name === 'terrain')
  const heightLayer = data.layers.find((layer) => layer.name === 'height')

  if (!terrainLayer || !heightLayer) {
    throw new Error(`Map ${id} is missing terrain or height data`)
  }

  const tiles: BattleMapData['tiles'] = []

  for (let y = 0; y < data.height; y += 1) {
    const row = []

    for (let x = 0; x < data.width; x += 1) {
      const index = y * data.width + x
      const terrainId = terrainLegend[terrainLayer.data[index]]

      if (!terrainId || !terrainDefinitions[terrainId]) {
        throw new Error(`Map ${id} has unknown terrain id ${terrainLayer.data[index]} at ${x},${y}`)
      }

      row.push({
        point: { x, y },
        terrainId,
        height: Math.max(0, heightLayer.data[index] - 1),
      })
    }

    tiles.push(row)
  }

  return {
    id,
    width: data.width,
    height: data.height,
    tileWidth: data.tilewidth,
    tileHeight: data.tileheight,
    tiles,
  }
}
