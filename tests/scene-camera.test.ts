import { describe, expect, it } from 'vitest'
import {
  buildUnitAnchor,
  computeCameraFocusScroll,
} from '../src/game/scenes/battle/scene-camera'

describe('battle scene camera helpers', () => {
  it('clamps anchored HUD positions inside the canvas bounds', () => {
    const anchor = buildUnitAnchor({
      point: { x: 0, y: 0 },
      tileHeight: 0,
      projection: {
        rotationQuarterTurns: 0,
        mapWidth: 16,
        mapHeight: 16,
        origin: { x: 0, y: 0 },
      },
      preferredPlacement: 'above-left',
      offset: { x: -220, y: -180 },
      cameraScrollX: 0,
      cameraScrollY: 0,
      cameraZoom: 1,
      cameraWidth: 800,
      cameraHeight: 600,
      canvasBounds: {
        left: 100,
        top: 200,
        width: 800,
        height: 600,
        right: 900,
        bottom: 800,
      },
    })

    expect(anchor).toEqual({
      clientX: 118,
      clientY: 218,
      preferredPlacement: 'above-left',
    })
  })

  it('centers focus scroll and clamps it to the legal camera bounds', () => {
    expect(
      computeCameraFocusScroll({
        point: { x: 15, y: 0 },
        tileHeight: 0,
        projection: {
          rotationQuarterTurns: 0,
          mapWidth: 16,
          mapHeight: 16,
          origin: { x: 0, y: 0 },
        },
        cameraWidth: 400,
        cameraHeight: 300,
        cameraZoom: 1,
        cameraBounds: {
          x: -300,
          y: -100,
          width: 900,
          height: 700,
        },
      }),
    ).toEqual({
      x: 200,
      y: 105,
    })
  })
})
