import type { DominantColor, ImageMetrics } from '../types'

const ALPHA_THRESHOLD = 10
const GRID_SIZE = 10

function rgbToHex(r: number, g: number, b: number): string {
  return `#${[r, g, b]
    .map((channel) => Math.max(0, Math.min(255, Math.round(channel))).toString(16).padStart(2, '0'))
    .join('')}`
}

function parseHex(hex: string): { r: number; g: number; b: number } {
  const sanitized = hex.replace('#', '')
  return {
    r: Number.parseInt(sanitized.slice(0, 2), 16),
    g: Number.parseInt(sanitized.slice(2, 4), 16),
    b: Number.parseInt(sanitized.slice(4, 6), 16),
  }
}

function getLuminance(r: number, g: number, b: number): number {
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255
}

function getSaturation(r: number, g: number, b: number): number {
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  if (max === 0) {
    return 0
  }
  return (max - min) / max
}

function createCanvas(width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  return canvas
}

function readImageData(image: CanvasImageSource, width: number, height: number): ImageData {
  const canvas = createCanvas(width, height)
  const context = canvas.getContext('2d', { willReadFrequently: true })

  if (!context) {
    throw new Error('Canvas 2D context unavailable')
  }

  context.clearRect(0, 0, width, height)
  context.drawImage(image, 0, 0, width, height)
  return context.getImageData(0, 0, width, height)
}

function calculateContrast(imageData: ImageData): number {
  const luminances: number[] = []

  for (let offset = 0; offset < imageData.data.length; offset += 4) {
    const alpha = imageData.data[offset + 3] ?? 0
    if (alpha <= ALPHA_THRESHOLD) {
      continue
    }

    luminances.push(
      getLuminance(imageData.data[offset] ?? 0, imageData.data[offset + 1] ?? 0, imageData.data[offset + 2] ?? 0),
    )
  }

  if (luminances.length === 0) {
    return 0
  }

  const mean = luminances.reduce((sum, value) => sum + value, 0) / luminances.length
  const variance = luminances.reduce((sum, value) => sum + (value - mean) ** 2, 0) / luminances.length
  return Math.sqrt(variance)
}

function buildDominantColors(buckets: Map<string, number>, opaquePixels: number): DominantColor[] {
  if (opaquePixels === 0) {
    return []
  }

  return [...buckets.entries()]
    .sort((left, right) => right[1] - left[1])
    .slice(0, 5)
    .map(([hex, count]) => ({
      hex,
      ratio: count / opaquePixels,
    }))
}

export async function analyzeImageFile(file: File): Promise<ImageMetrics> {
  const bitmap = await createImageBitmap(file)

  try {
    const imageData = readImageData(bitmap, bitmap.width, bitmap.height)
    const { data, width, height } = imageData
    const totalPixels = width * height
    const edgePixels = Math.max(1, width * 2 + height * 2 - 4)
    const buckets = new Map<string, number>()
    const alphaGrid = Array.from({ length: GRID_SIZE }, () => Array.from({ length: GRID_SIZE }, () => 0))
    let opaquePixels = 0
    let edgeOpaquePixels = 0
    let magentaPixels = 0
    let luminanceSum = 0
    let saturationSum = 0
    let redSum = 0
    let greenSum = 0
    let blueSum = 0
    let weightedX = 0
    let weightedY = 0
    let minX = Number.POSITIVE_INFINITY
    let minY = Number.POSITIVE_INFINITY
    let maxX = Number.NEGATIVE_INFINITY
    let maxY = Number.NEGATIVE_INFINITY

    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const offset = (y * width + x) * 4
        const r = data[offset] ?? 0
        const g = data[offset + 1] ?? 0
        const b = data[offset + 2] ?? 0
        const alpha = data[offset + 3] ?? 0

        if (alpha <= ALPHA_THRESHOLD) {
          continue
        }

        opaquePixels += 1
        if (x === 0 || y === 0 || x === width - 1 || y === height - 1) {
          edgeOpaquePixels += 1
        }

        if (r === 255 && g === 0 && b === 255) {
          magentaPixels += 1
        }

        redSum += r
        greenSum += g
        blueSum += b
        luminanceSum += getLuminance(r, g, b)
        saturationSum += getSaturation(r, g, b)
        weightedX += x
        weightedY += y
        minX = Math.min(minX, x)
        minY = Math.min(minY, y)
        maxX = Math.max(maxX, x)
        maxY = Math.max(maxY, y)

        const quantizedHex = rgbToHex(Math.round(r / 32) * 32, Math.round(g / 32) * 32, Math.round(b / 32) * 32)
        buckets.set(quantizedHex, (buckets.get(quantizedHex) ?? 0) + 1)

        const gridX = Math.min(GRID_SIZE - 1, Math.floor((x / Math.max(1, width)) * GRID_SIZE))
        const gridY = Math.min(GRID_SIZE - 1, Math.floor((y / Math.max(1, height)) * GRID_SIZE))
        const row = alphaGrid[gridY]
        if (row) {
          row[gridX] = (row[gridX] ?? 0) + 1
        }
      }
    }

    const contrast38 = calculateContrast(readImageData(bitmap, 38, 38))
    const contrast32 = calculateContrast(readImageData(bitmap, 32, 32))
    const normalizedGrid = alphaGrid.map((row) => row.map((count) => count / Math.max(1, totalPixels / (GRID_SIZE * GRID_SIZE))))
    const centerX = opaquePixels === 0 ? width / 2 : weightedX / opaquePixels
    const centerY = opaquePixels === 0 ? height / 2 : weightedY / opaquePixels
    const centerDistance = Math.sqrt(
      ((centerX - width / 2) / Math.max(1, width / 2)) ** 2 +
        ((centerY - height / 2) / Math.max(1, height / 2)) ** 2,
    )

    return {
      width,
      height,
      opaqueRatio: opaquePixels / Math.max(1, totalPixels),
      transparentRatio: 1 - opaquePixels / Math.max(1, totalPixels),
      edgeOpaqueRatio: edgeOpaquePixels / edgePixels,
      magentaRatio: magentaPixels / Math.max(1, opaquePixels),
      meanLuminance: luminanceSum / Math.max(1, opaquePixels),
      meanSaturation: saturationSum / Math.max(1, opaquePixels),
      averageColor: {
        r: redSum / Math.max(1, opaquePixels),
        g: greenSum / Math.max(1, opaquePixels),
        b: blueSum / Math.max(1, opaquePixels),
      },
      centerOfMass: {
        x: centerX,
        y: centerY,
      },
      centerOfMassDistance: centerDistance,
      silhouetteMass: opaquePixels / Math.max(1, totalPixels),
      contrast38,
      contrast32,
      alphaGrid: normalizedGrid,
      dominantColors: buildDominantColors(buckets, opaquePixels),
      bounds:
        opaquePixels === 0
          ? null
          : {
              minX,
              minY,
              maxX,
              maxY,
            },
    }
  } finally {
    bitmap.close?.()
  }
}

export function compareImageMetrics(target: ImageMetrics, reference: ImageMetrics): {
  paletteDrift: number
  luminanceDrift: number
  saturationDrift: number
  silhouetteMassDiff: number
  dominantColorOverlap: number
  centerDrift: number
} {
  const targetColor = target.averageColor
  const referenceColor = reference.averageColor
  const paletteDrift =
    Math.sqrt(
      (targetColor.r - referenceColor.r) ** 2 +
        (targetColor.g - referenceColor.g) ** 2 +
        (targetColor.b - referenceColor.b) ** 2,
    ) / Math.sqrt(255 ** 2 * 3)

  const targetDominant = new Map(target.dominantColors.map((entry) => [entry.hex, entry.ratio]))
  const referenceDominant = new Map(reference.dominantColors.map((entry) => [entry.hex, entry.ratio]))
  const keys = new Set([...targetDominant.keys(), ...referenceDominant.keys()])

  let intersection = 0
  let union = 0
  for (const key of keys) {
    const targetValue = targetDominant.get(key) ?? 0
    const referenceValue = referenceDominant.get(key) ?? 0
    intersection += Math.min(targetValue, referenceValue)
    union += Math.max(targetValue, referenceValue)
  }

  return {
    paletteDrift,
    luminanceDrift: Math.abs(target.meanLuminance - reference.meanLuminance),
    saturationDrift: Math.abs(target.meanSaturation - reference.meanSaturation),
    silhouetteMassDiff: Math.abs(target.silhouetteMass - reference.silhouetteMass),
    dominantColorOverlap: union === 0 ? 1 : intersection / union,
    centerDrift: Math.sqrt(
      ((target.centerOfMass.x / Math.max(1, target.width)) -
        reference.centerOfMass.x / Math.max(1, reference.width)) **
        2 +
        ((target.centerOfMass.y / Math.max(1, target.height)) -
          reference.centerOfMass.y / Math.max(1, reference.height)) **
          2,
    ),
  }
}

export function mixDominantColorHexes(colors: DominantColor[]): string {
  if (colors.length === 0) {
    return '#000000'
  }

  let red = 0
  let green = 0
  let blue = 0

  for (const color of colors) {
    const parsed = parseHex(color.hex)
    red += parsed.r * color.ratio
    green += parsed.g * color.ratio
    blue += parsed.b * color.ratio
  }

  return rgbToHex(red, green, blue)
}
