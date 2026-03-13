import Phaser from 'phaser'
import type { CombatRole, UnitIconId } from './types'

export interface CombatRolePalette {
  tint: number
  glowTint: number
  ink: string
  stroke: string
}

const rolePalettes: Record<CombatRole, CombatRolePalette> = {
  tank: {
    tint: 0xb88b52,
    glowTint: 0xe3c28f,
    ink: '#fff4de',
    stroke: '#f7e7bf',
  },
  damage: {
    tint: 0xc75a52,
    glowTint: 0xf29a91,
    ink: '#ffe5df',
    stroke: '#ffd0c8',
  },
  support: {
    tint: 0x3f9d93,
    glowTint: 0x7dd8cd,
    ink: '#e3fffb',
    stroke: '#c6fff6',
  },
  healer: {
    tint: 0x63ad6c,
    glowTint: 0xa0e6a8,
    ink: '#ebffed',
    stroke: '#dbffe0',
  },
}

export function getCombatRolePalette(role: CombatRole): CombatRolePalette {
  return rolePalettes[role]
}

function shieldIconSvg(): string {
  return `
    <path d="M12 3.5L18 6.2V11c0 4.2-2.8 7.8-6 9.5C8.8 18.8 6 15.2 6 11V6.2L12 3.5Z" />
  `
}

function bowIconSvg(): string {
  return `
    <path d="M8 4.5c5.2 4.1 5.2 10.9 0 15" />
    <path d="M8 4.5L8 19.5" />
    <path d="M10.5 12H18.5" />
    <path d="M15.8 9.3L18.5 12L15.8 14.7" />
  `
}

function orbIconSvg(): string {
  return `
    <circle cx="12" cy="12.5" r="4.3" />
    <path d="M12 4.5V6.7" />
    <path d="M19.2 12.5H17" />
    <path d="M12 20.5V18.3" />
    <path d="M4.8 12.5H7" />
  `
}

function wallIconSvg(): string {
  return `
    <path d="M5 18V10.5H19V18" />
    <path d="M7 10.5V7.5H9.2V10.5" />
    <path d="M10.9 10.5V7.5H13.1V10.5" />
    <path d="M14.8 10.5V7.5H17V10.5" />
  `
}

function daggerIconSvg(): string {
  return `
    <path d="M15.8 4.8L18.6 7.6L12.8 13.4L10.2 10.8L15.8 4.8Z" />
    <path d="M10.2 10.8L7.7 13.3" />
    <path d="M7.7 13.3L6.2 18.2L11.1 16.7" />
  `
}

function staffIconSvg(): string {
  return `
    <path d="M8 18.5L14.7 11.8" />
    <circle cx="16.6" cy="9.9" r="2.6" />
    <path d="M6.8 19.7L9.2 17.3" />
    <path d="M17.9 7.4L19.1 6.2" />
  `
}

function iconSvg(iconId: UnitIconId): string {
  switch (iconId) {
    case 'shield':
      return shieldIconSvg()
    case 'bow':
      return bowIconSvg()
    case 'orb':
      return orbIconSvg()
    case 'wall':
      return wallIconSvg()
    case 'dagger':
      return daggerIconSvg()
    case 'staff':
      return staffIconSvg()
  }
}

export function renderUnitIconSvg(
  unitIconId: UnitIconId,
  combatRole: CombatRole,
  size = 18,
): string {
  const palette = getCombatRolePalette(combatRole)

  return `
    <span class="hud-unit-icon is-${combatRole}" aria-hidden="true">
      <svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="${palette.stroke}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
        ${iconSvg(unitIconId)}
      </svg>
    </span>
  `
}

export function drawBattlefieldUnitIcon(args: {
  graphics: Phaser.GameObjects.Graphics
  combatRole: CombatRole
  unitIconId: UnitIconId
  x: number
  y: number
  size: number
}): void {
  const { graphics, combatRole, unitIconId, x, y, size } = args
  const palette = getCombatRolePalette(combatRole)
  const radius = size / 2
  const left = x - radius
  const top = y - radius
  const right = x + radius
  const bottom = y + radius
  const midX = x
  const midY = y

  graphics.fillStyle(palette.tint, 1)
  graphics.fillCircle(x, y, radius + 2)
  graphics.lineStyle(1.6, palette.glowTint, 1)

  switch (unitIconId) {
    case 'shield':
      graphics.beginPath()
      graphics.moveTo(midX, top + 1)
      graphics.lineTo(right - 2, top + 4)
      graphics.lineTo(right - 2, midY - 1)
      graphics.lineTo(midX, bottom - 1)
      graphics.lineTo(left + 2, midY - 1)
      graphics.lineTo(left + 2, top + 4)
      graphics.closePath()
      graphics.strokePath()
      break
    case 'bow':
      graphics.beginPath()
      graphics.arc(midX - 1, midY, radius - 1, Phaser.Math.DegToRad(300), Phaser.Math.DegToRad(60), false)
      graphics.strokePath()
      graphics.lineBetween(midX - 1, top + 2, midX - 1, bottom - 2)
      graphics.lineBetween(midX + 1, midY, right - 1, midY)
      graphics.lineBetween(right - 3, midY - 2, right - 1, midY)
      graphics.lineBetween(right - 3, midY + 2, right - 1, midY)
      break
    case 'orb':
      graphics.strokeCircle(midX, midY, radius - 2)
      graphics.lineBetween(midX, top + 1, midX, top + 4)
      graphics.lineBetween(right - 1, midY, right - 4, midY)
      graphics.lineBetween(midX, bottom - 1, midX, bottom - 4)
      graphics.lineBetween(left + 1, midY, left + 4, midY)
      break
    case 'wall':
      graphics.strokeRoundedRect(left + 2, midY - 1, size - 4, 5, 1)
      graphics.strokeRect(left + 3, top + 2, 3, 4)
      graphics.strokeRect(midX - 1, top + 2, 3, 4)
      graphics.strokeRect(right - 6, top + 2, 3, 4)
      break
    case 'dagger':
      graphics.beginPath()
      graphics.moveTo(right - 2, top + 3)
      graphics.lineTo(midX + 1, midY)
      graphics.lineTo(midX - 2, midY + 3)
      graphics.lineTo(right - 5, bottom - 3)
      graphics.closePath()
      graphics.strokePath()
      graphics.lineBetween(midX - 2, midY + 3, left + 3, bottom - 2)
      graphics.lineBetween(left + 3, bottom - 2, left + 5, midY + 2)
      break
    case 'staff':
      graphics.lineBetween(left + 4, bottom - 3, midX + 2, top + 5)
      graphics.strokeCircle(midX + 4, top + 3, 3)
      graphics.lineBetween(midX + 6, top + 1, right - 1, top - 2 + 4)
      break
  }
}
