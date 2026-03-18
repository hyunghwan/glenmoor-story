import type { AtlasFrame } from '../types'

export function clampFrameCursor(frameCursor: number, frameCount: number): number {
  if (frameCount <= 0) {
    return 0
  }

  return Math.min(Math.max(frameCursor, 0), frameCount - 1)
}

export function getFrameAtCursor(frames: AtlasFrame[], frameCursor: number): AtlasFrame | null {
  if (!frames.length) {
    return null
  }

  return frames[clampFrameCursor(frameCursor, frames.length)] ?? null
}

export function getNextFrameCursor(frameCursor: number, frameCount: number): number {
  if (frameCount <= 1) {
    return 0
  }

  return (clampFrameCursor(frameCursor, frameCount) + 1) % frameCount
}
