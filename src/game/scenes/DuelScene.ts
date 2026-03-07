import Phaser from 'phaser'
import { classDefinitions } from '../content'
import { I18n } from '../i18n'
import type { CombatResolution } from '../types'

export class DuelScene extends Phaser.Scene {
  private resolution?: CombatResolution
  private readonly i18n: I18n
  private readonly uiBus: Phaser.Events.EventEmitter
  private elapsedMs = 0
  private durationMs = 1200
  private fastMode = false
  private skipHandler?: () => void

  constructor(uiBus: Phaser.Events.EventEmitter, i18n: I18n) {
    super('duel')
    this.uiBus = uiBus
    this.i18n = i18n
  }

  init(data: { resolution: CombatResolution }): void {
    this.resolution = data.resolution
    this.elapsedMs = 0
    this.fastMode = false
  }

  create(): void {
    if (!this.resolution) {
      this.finish()
      return
    }

    const { width, height } = this.scale
    const attacker = this.resolution.state.units[this.resolution.action.actorId]
    const targetId = this.resolution.action.targetId
    const target = targetId ? this.resolution.state.units[targetId] : undefined
    const panelY = height / 2

    this.add.rectangle(width / 2, height / 2, width, height, 0x0b141b, 0.92)
    this.add.rectangle(width / 2, panelY, width - 180, 300, 0x1b2733, 0.95).setStrokeStyle(2, 0xd8c08a)
    this.add.rectangle(width / 2, panelY, width - 280, 180, 0x111b23, 1).setStrokeStyle(1, 0x57728d)

    this.add.text(width / 2, 110, this.i18n.t('duel.vs'), {
      fontFamily: 'Cinzel',
      fontSize: '18px',
      color: '#d6c189',
      letterSpacing: 6,
    }).setOrigin(0.5)

    const leftX = 260
    const rightX = width - 260

    this.drawCombatant(leftX, panelY, attacker.nameKey, attacker.classId, '#9bc4ff')

    if (target) {
      this.drawCombatant(rightX, panelY, target.nameKey, target.classId, target.team === 'allies' ? '#9bc4ff' : '#ff9982')
    }

    const actionLabel = this.resolution.primary?.labelKey
      ? this.i18n.t(this.resolution.primary.labelKey)
      : this.resolution.action.kind === 'wait'
        ? this.i18n.t('hud.action.wait')
        : this.i18n.t('hud.none')

    this.add.text(width / 2, 184, actionLabel, {
      fontFamily: 'Outfit',
      fontSize: '30px',
      color: '#f4efe3',
      fontStyle: '700',
    }).setOrigin(0.5)

    const summaryLines = this.buildSummaryLines()
    this.add.text(width / 2, 280, summaryLines.join('\n'), {
      align: 'center',
      fontFamily: 'Outfit',
      fontSize: '22px',
      color: '#dce6ef',
      lineSpacing: 8,
    }).setOrigin(0.5)

    const flash = this.add.rectangle(width / 2, panelY, 8, 200, 0xd9b86c, 0.75)
    this.tweens.add({
      targets: flash,
      width: width - 300,
      alpha: 0,
      duration: 440,
      ease: 'Cubic.easeOut',
      yoyo: false,
    })

    const skip = this.add.text(width - 140, height - 68, this.i18n.t('duel.skip'), {
      fontFamily: 'Outfit',
      fontSize: '18px',
      color: '#f9f2dc',
      backgroundColor: '#203445',
      padding: { x: 14, y: 8 },
    })
    skip.setInteractive({ useHandCursor: true }).on('pointerdown', () => this.finish())

    const fast = this.add.text(width - 250, height - 68, this.i18n.t('duel.fast'), {
      fontFamily: 'Outfit',
      fontSize: '18px',
      color: '#f9f2dc',
      backgroundColor: '#3d2b24',
      padding: { x: 14, y: 8 },
    })
    fast.setInteractive({ useHandCursor: true }).on('pointerdown', () => {
      this.fastMode = !this.fastMode
      fast.setText(this.fastMode ? `${this.i18n.t('duel.fast')} x4` : this.i18n.t('duel.fast'))
    })

    this.input.keyboard?.on('keydown-SPACE', this.finish, this)
    this.input.keyboard?.on('keydown-SHIFT', () => {
      this.fastMode = !this.fastMode
      fast.setText(this.fastMode ? `${this.i18n.t('duel.fast')} x4` : this.i18n.t('duel.fast'))
    })

    this.skipHandler = () => this.finish()
    this.uiBus.on('duel:fast-forward', this.skipHandler)
  }

  update(_time: number, delta: number): void {
    this.elapsedMs += this.fastMode ? delta * 4 : delta

    if (this.elapsedMs >= this.durationMs) {
      this.finish()
    }
  }

  private buildSummaryLines(): string[] {
    const lines: string[] = []

    if (this.resolution?.primary) {
      const primary = this.resolution.primary
      const label = primary.kind === 'heal' ? this.i18n.t('hud.heal') : this.i18n.t('hud.damage')
      lines.push(`${label}: ${primary.amount}`)

      if (primary.appliedStatuses.length > 0) {
        lines.push(
          primary.appliedStatuses
            .map((status) => `${this.i18n.t(`status.${status.statusId}`)} x${status.stacks}`)
            .join(' / '),
        )
      }

      if (primary.push?.attempted) {
        lines.push(primary.push.succeeded ? this.i18n.t('log.push', { target: '' }) : this.i18n.t('log.pushBlocked', { target: '' }))
      }
    }

    if (this.resolution?.counter) {
      lines.push(`${this.i18n.t('duel.counter')}: ${this.resolution.counter.amount}`)
    } else {
      lines.push(this.i18n.t('duel.noCounter'))
    }

    return lines
  }

  private drawCombatant(x: number, y: number, nameKey: string, classId: string, glow: string): void {
    const className = this.i18n.t(classDefinitions[classId].nameKey)
    const token = this.add.container(x, y)

    token.add(this.add.ellipse(0, 86, 110, 28, 0x091117, 0.55))
    token.add(this.add.circle(0, 0, 60, Phaser.Display.Color.HexStringToColor(glow).color, 0.92))
    token.add(this.add.circle(0, -6, 40, 0x0e1620, 0.4))
    token.add(
      this.add.text(0, -4, className.slice(0, 2).toUpperCase(), {
        fontFamily: 'Cinzel',
        fontSize: '26px',
        color: '#f8f0d9',
        fontStyle: '700',
      }).setOrigin(0.5),
    )
    token.add(
      this.add.text(0, 92, this.i18n.t(nameKey), {
        fontFamily: 'Outfit',
        fontSize: '24px',
        color: '#ffffff',
        fontStyle: '700',
      }).setOrigin(0.5),
    )
    token.add(
      this.add.text(0, 122, className, {
        fontFamily: 'Outfit',
        fontSize: '16px',
        color: '#c5d2dc',
      }).setOrigin(0.5),
    )
  }

  private finish(): void {
    if (!this.scene.isActive()) {
      return
    }

    if (this.skipHandler) {
      this.uiBus.off('duel:fast-forward', this.skipHandler)
      this.skipHandler = undefined
    }

    this.uiBus.emit('duel:complete')
    this.scene.stop()
  }
}
