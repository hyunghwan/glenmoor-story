import type { ViewportProfile } from './types'

export interface DuelLayoutSnapshot {
  frameWidth: number
  frameHeight: number
  headerWidth: number
  detailWidth: number
  panelY: number
  headerY: number
  detailY: number
  actionY: number
  subtitleY: number
  leftX: number
  rightX: number
  leftY: number
  rightY: number
  skipX: number
  fastX: number
  controlsY: number
  cardWidth: number
  cardHeight: number
  glowWidth: number
  glowHeight: number
  tokenRadius: number
  tokenOffsetY: number
  statusWrapWidth: number
}

export function resolveDuelLayout(args: {
  width: number
  height: number
  viewportProfile: ViewportProfile
}): DuelLayoutSnapshot {
  const { width, height, viewportProfile } = args
  const isMobile = viewportProfile.layoutMode !== 'desktop'
  const isPortraitMobile = viewportProfile.layoutMode === 'mobile-portrait'
  const safeTop = viewportProfile.safeArea.top
  const safeBottom = viewportProfile.safeArea.bottom

  if (isPortraitMobile) {
    return {
      frameWidth: width - 24,
      frameHeight: height - safeTop - safeBottom - 132,
      headerWidth: width - 42,
      detailWidth: width - 42,
      panelY: height / 2 + 12,
      headerY: safeTop + 86,
      detailY: safeTop + 232,
      actionY: safeTop + 134,
      subtitleY: safeTop + 180,
      leftX: width / 2,
      rightX: width / 2,
      leftY: Math.min(height * 0.44, safeTop + 350),
      rightY: Math.min(height * 0.72, height - safeBottom - 154),
      skipX: width - 76,
      fastX: width - 182,
      controlsY: height - safeBottom - 36,
      cardWidth: Math.min(width - 54, 280),
      cardHeight: 148,
      glowWidth: Math.min(width - 34, 300),
      glowHeight: 164,
      tokenRadius: 36,
      tokenOffsetY: -18,
      statusWrapWidth: Math.min(width - 110, 212),
    }
  }

  const sideInset = Math.max(isMobile ? 132 : 160, width * (isMobile ? 0.2 : 0.24))

  return {
    frameWidth: width - (isMobile ? 28 : 120),
    frameHeight: isMobile ? height - safeTop - safeBottom - 118 : 420,
    headerWidth: width - (isMobile ? 72 : 280),
    detailWidth: width - (isMobile ? 80 : 360),
    panelY: height / 2,
    headerY: safeTop + 98,
    detailY: isMobile ? height * 0.34 : 330,
    actionY: safeTop + (isMobile ? 148 : 142),
    subtitleY: safeTop + (isMobile ? 194 : 192),
    leftX: sideInset,
    rightX: width - sideInset,
    leftY: height * (isMobile ? 0.68 : 0.56),
    rightY: height * (isMobile ? 0.68 : 0.56),
    skipX: width - 88,
    fastX: width - 198,
    controlsY: height - safeBottom - 36,
    cardWidth: isMobile ? 236 : 270,
    cardHeight: isMobile ? 176 : 210,
    glowWidth: isMobile ? 254 : 290,
    glowHeight: isMobile ? 194 : 230,
    tokenRadius: isMobile ? 42 : 52,
    tokenOffsetY: isMobile ? -28 : -40,
    statusWrapWidth: isMobile ? 188 : 220,
  }
}
