import Phaser from 'phaser'
import { buildCombatStepLines } from '../combat-text'
import { classDefinitions } from '../content'
import { I18n } from '../i18n'
import type {
  CombatPresentation,
  CombatPresentationUnitSnapshot,
  CombatResolution,
  StatusInstance,
} from '../types'

interface DisplayUnitState {
  hp: number
  statuses: StatusInstance[]
  position: { x: number; y: number }
  defeated: boolean
}

interface CombatantCard {
  panel: Phaser.GameObjects.Rectangle
  glow: Phaser.GameObjects.Rectangle
  token: Phaser.GameObjects.Arc
  nameText: Phaser.GameObjects.Text
  classText: Phaser.GameObjects.Text
  hpText: Phaser.GameObjects.Text
  statusText: Phaser.GameObjects.Text
}

export class DuelScene extends Phaser.Scene {
  private resolution?: CombatResolution
  private presentation?: CombatPresentation
  private readonly i18n: I18n
  private readonly uiBus: Phaser.Events.EventEmitter
  private stepIndex = 0
  private stepElapsedMs = 0
  private fastMode = false
  private skipHandler?: () => void
  private advanceHandler?: (ms: number) => void
  private cards = new Map<string, CombatantCard>()
  private displayUnits = new Map<string, DisplayUnitState>()
  private actionText?: Phaser.GameObjects.Text
  private stepText?: Phaser.GameObjects.Text
  private subtitleText?: Phaser.GameObjects.Text
  private detailText?: Phaser.GameObjects.Text

  constructor(uiBus: Phaser.Events.EventEmitter, i18n: I18n) {
    super('duel')
    this.uiBus = uiBus
    this.i18n = i18n
  }

  init(data: { resolution: CombatResolution }): void {
    this.resolution = data.resolution
    this.presentation = data.resolution.presentation
    this.stepIndex = 0
    this.stepElapsedMs = 0
    this.fastMode = false
    this.cards.clear()
    this.displayUnits.clear()
  }

  create(): void {
    if (!this.resolution || !this.presentation || this.presentation.steps.length === 0) {
      this.finish()
      return
    }

    const { width, height } = this.scale
    const panelY = height / 2

    this.add.rectangle(width / 2, height / 2, width, height, 0x071018, 0.96)
    this.add.rectangle(width / 2, panelY, width - 120, 420, 0x13202b, 0.96).setStrokeStyle(2, 0xd8c08a)
    this.add.rectangle(width / 2, 128, width - 280, 86, 0x0d171f, 0.88).setStrokeStyle(1, 0x4d6578)
    this.add.rectangle(width / 2, 330, width - 360, 110, 0x0c141a, 0.92).setStrokeStyle(1, 0x3a5568)

    this.add.text(width / 2, 78, this.i18n.t('duel.vs'), {
      fontFamily: 'Cinzel',
      fontSize: '18px',
      color: '#d6c189',
      letterSpacing: 6,
    }).setOrigin(0.5)

    this.stepText = this.add.text(width / 2, 108, '', {
      fontFamily: 'Outfit',
      fontSize: '15px',
      color: '#b8c8d6',
      fontStyle: '600',
    }).setOrigin(0.5)

    this.actionText = this.add.text(width / 2, 162, '', {
      fontFamily: 'Outfit',
      fontSize: '34px',
      color: '#f4efe3',
      fontStyle: '700',
    }).setOrigin(0.5)

    this.subtitleText = this.add.text(width / 2, 214, '', {
      fontFamily: 'Outfit',
      fontSize: '20px',
      color: '#b8c8d6',
      align: 'center',
    }).setOrigin(0.5)

    this.detailText = this.add.text(width / 2, 330, '', {
      fontFamily: 'Outfit',
      fontSize: '23px',
      color: '#edf4fb',
      align: 'center',
      lineSpacing: 8,
      wordWrap: { width: width - 460 },
    }).setOrigin(0.5)

    const [leftUnit, rightUnit] = this.presentation.units
    const leftX = 300
    const rightX = width - 300

    if (leftUnit) {
      this.cards.set(leftUnit.unitId, this.createCombatantCard(leftUnit, leftX, panelY + 34, '#8fc1ff'))
    }

    if (rightUnit) {
      const unit = this.resolution.state.units[rightUnit.unitId]
      this.cards.set(
        rightUnit.unitId,
        this.createCombatantCard(rightUnit, rightX, panelY + 34, unit?.team === 'allies' ? '#8fc1ff' : '#ff8d73'),
      )
    }

    const skip = this.add.text(width - 140, height - 68, this.i18n.t('duel.skip'), {
      fontFamily: 'Outfit',
      fontSize: '18px',
      color: '#f9f2dc',
      backgroundColor: '#203445',
      padding: { x: 14, y: 8 },
    })
    skip.setInteractive({ useHandCursor: true }).on('pointerdown', () => this.finish())

    const fast = this.add.text(width - 260, height - 68, this.i18n.t('duel.fast'), {
      fontFamily: 'Outfit',
      fontSize: '18px',
      color: '#f9f2dc',
      backgroundColor: '#3d2b24',
      padding: { x: 14, y: 8 },
    })
    fast.setInteractive({ useHandCursor: true }).on('pointerdown', () => {
      this.fastMode = !this.fastMode
      fast.setText(this.fastMode ? `${this.i18n.t('duel.fast')} x3` : this.i18n.t('duel.fast'))
      this.emitTelemetry()
    })

    this.input.keyboard?.on('keydown-SPACE', this.finish, this)
    this.input.keyboard?.on('keydown-SHIFT', () => {
      this.fastMode = !this.fastMode
      fast.setText(this.fastMode ? `${this.i18n.t('duel.fast')} x3` : this.i18n.t('duel.fast'))
      this.emitTelemetry()
    })

    this.skipHandler = () => this.finish()
    this.advanceHandler = (ms: number) => this.advanceTimeline(ms)
    this.uiBus.on('duel:fast-forward', this.skipHandler)
    this.uiBus.on('duel:advance', this.advanceHandler)

    this.applyStepPresentation()
  }

  update(_time: number, delta: number): void {
    this.advanceTimeline(this.fastMode ? delta * 3 : delta)
  }

  private advanceTimeline(ms: number): void {
    if (!this.presentation || !this.scene.isActive()) {
      return
    }

    let remaining = ms

    while (remaining > 0 && this.scene.isActive()) {
      const currentStep = this.presentation.steps[this.stepIndex]

      if (!currentStep) {
        this.finish()
        return
      }

      const remainingForStep = currentStep.durationMs - this.stepElapsedMs

      if (remaining < remainingForStep) {
        this.stepElapsedMs += remaining
        return
      }

      remaining -= remainingForStep

      if (this.stepIndex >= this.presentation.steps.length - 1) {
        this.finish()
        return
      }

      this.stepIndex += 1
      this.stepElapsedMs = 0
      this.applyStepPresentation()
    }
  }

  private applyStepPresentation(): void {
    if (!this.presentation) {
      return
    }

    this.rebuildDisplayState()

    const step = this.presentation.steps[this.stepIndex]
    const combatText = {
      t: this.i18n.t.bind(this.i18n),
      getUnitName: (unitId: string) => this.i18n.t(this.resolution?.state.units[unitId]?.nameKey ?? unitId),
    }
    const detailLines = buildCombatStepLines(step, combatText)
    const title =
      step.kind === 'counter'
        ? `${this.i18n.t('duel.counter')} · ${this.i18n.t(step.labelKey)}`
        : this.i18n.t(step.labelKey)

    this.stepText?.setText(
      this.i18n.t('duel.step', {
        current: this.stepIndex + 1,
        total: this.presentation.steps.length,
      }),
    )
    this.actionText?.setText(title)
    this.subtitleText?.setText(detailLines[0] ?? '')

    const hpLine =
      step.kind === 'impact' || step.kind === 'counter'
        ? this.buildHpLine(step.targetId ?? '')
        : undefined
    this.detailText?.setText(
      [...detailLines.slice(1), ...(hpLine ? [hpLine] : [])].filter(Boolean).join('\n'),
    )

    for (const [unitId, card] of this.cards) {
      const snapshot = this.getSnapshot(unitId)
      const display = this.displayUnits.get(unitId)

      if (!snapshot || !display) {
        continue
      }

      const isActor = unitId === step.actorId
      const isTarget = unitId === step.targetId || unitId === step.defeat?.unitId
      card.glow.setAlpha(isActor || isTarget ? 0.24 : 0.08)
      card.panel.setStrokeStyle(2, isTarget ? 0xf0b35f : isActor ? 0x8fc1ff : 0x466175)
      card.token.setAlpha(display.defeated ? 0.42 : 0.92)
      card.hpText.setText(`${this.i18n.t('duel.hp')} ${snapshot.hpBefore} -> ${display.hp}`)
      card.statusText.setText(this.formatStatuses(display.statuses))
      card.panel.setAlpha(display.defeated ? 0.68 : 1)
    }

    this.emitTelemetry()
  }

  private rebuildDisplayState(): void {
    if (!this.presentation) {
      return
    }

    this.displayUnits = new Map(
      this.presentation.units.map((snapshot) => [
        snapshot.unitId,
        {
          hp: snapshot.hpBefore,
          statuses: snapshot.statusesBefore.map((status) => ({ ...status })),
          position: { ...snapshot.positionBefore },
          defeated: false,
        },
      ]),
    )

    for (let index = 0; index <= this.stepIndex; index += 1) {
      const step = this.presentation.steps[index]

      if (!step) {
        continue
      }

      if ((step.kind === 'impact' || step.kind === 'counter') && step.targetId) {
        const target = this.displayUnits.get(step.targetId)

        if (target && step.amount !== undefined) {
          target.hp =
            step.valueKind === 'heal'
              ? target.hp + step.amount
              : Math.max(0, target.hp - step.amount)
        }
      }

      if (step.kind === 'effects' && step.targetId) {
        const target = this.displayUnits.get(step.targetId)

        if (target) {
          for (const statusChange of step.statusChanges) {
            const existing = target.statuses.find((status) => status.id === statusChange.statusId)

            if (existing) {
              existing.stacks = statusChange.stacks
              existing.duration = statusChange.duration
            } else {
              target.statuses.push({
                id: statusChange.statusId,
                stacks: statusChange.stacks,
                duration: statusChange.duration,
              })
            }
          }

          if (step.push?.succeeded && step.push.destination) {
            target.position = { ...step.push.destination }
          }
        }
      }

      if (step.kind === 'defeat' && step.defeat?.unitId) {
        const defeated = this.displayUnits.get(step.defeat.unitId)

        if (defeated) {
          defeated.hp = 0
          defeated.defeated = true
        }
      }
    }
  }

  private createCombatantCard(
    snapshot: CombatPresentationUnitSnapshot,
    x: number,
    y: number,
    accent: string,
  ): CombatantCard {
    const unit = this.resolution?.state.units[snapshot.unitId]
    const className = unit ? this.i18n.t(classDefinitions[unit.classId].nameKey) : ''
    const glowColor = Phaser.Display.Color.HexStringToColor(accent).color

    const glow = this.add.rectangle(x, y, 290, 230, glowColor, 0.08).setStrokeStyle(0, glowColor, 0)
    const panel = this.add.rectangle(x, y, 270, 210, 0x0b151d, 0.96).setStrokeStyle(2, 0x466175)
    const token = this.add.circle(x, y - 40, 52, glowColor, 0.92)
    this.add.circle(x, y - 44, 36, 0x162230, 0.34)
    this.add.text(x, y - 45, className.slice(0, 2).toUpperCase(), {
      fontFamily: 'Cinzel',
      fontSize: '26px',
      color: '#f8f0d9',
      fontStyle: '700',
    }).setOrigin(0.5)

    const nameText = this.add.text(x, y + 30, unit ? this.i18n.t(unit.nameKey) : snapshot.unitId, {
      fontFamily: 'Outfit',
      fontSize: '24px',
      color: '#ffffff',
      fontStyle: '700',
    }).setOrigin(0.5)

    const classText = this.add.text(x, y + 62, className, {
      fontFamily: 'Outfit',
      fontSize: '16px',
      color: '#b7c8d7',
    }).setOrigin(0.5)

    const hpText = this.add.text(x, y + 98, '', {
      fontFamily: 'Outfit',
      fontSize: '18px',
      color: '#f4efe3',
      fontStyle: '600',
    }).setOrigin(0.5)

    const statusText = this.add.text(x, y + 132, '', {
      fontFamily: 'Outfit',
      fontSize: '15px',
      color: '#9eb3c4',
      align: 'center',
      wordWrap: { width: 220 },
    }).setOrigin(0.5)

    return {
      panel,
      glow,
      token,
      nameText,
      classText,
      hpText,
      statusText,
    }
  }

  private getSnapshot(unitId: string): CombatPresentationUnitSnapshot | undefined {
    return this.presentation?.units.find((snapshot) => snapshot.unitId === unitId)
  }

  private buildHpLine(unitId: string): string | undefined {
    const snapshot = this.getSnapshot(unitId)
    const display = this.displayUnits.get(unitId)

    if (!snapshot || !display) {
      return undefined
    }

    return `${this.i18n.t('duel.hp')}: ${snapshot.hpBefore} -> ${display.hp}`
  }

  private formatStatuses(statuses: StatusInstance[]): string {
    if (statuses.length === 0) {
      return this.i18n.t('duel.statusStable')
    }

    return statuses
      .map((status) => `${this.i18n.t(`status.${status.id}`)} x${status.stacks}`)
      .join(' · ')
  }

  private emitTelemetry(): void {
    this.uiBus.emit('duel:telemetry', {
      active: true,
      stepIndex: this.stepIndex + 1,
      stepCount: this.presentation?.steps.length ?? 0,
      actionLabel: this.presentation ? this.i18n.t(this.presentation.actionLabelKey) : '',
      fastMode: this.fastMode,
    })
  }

  private finish(): void {
    if (!this.scene.isActive()) {
      return
    }

    if (this.skipHandler) {
      this.uiBus.off('duel:fast-forward', this.skipHandler)
      this.skipHandler = undefined
    }

    if (this.advanceHandler) {
      this.uiBus.off('duel:advance', this.advanceHandler)
      this.advanceHandler = undefined
    }

    this.uiBus.emit('duel:telemetry', {
      active: false,
      stepIndex: 0,
      stepCount: this.presentation?.steps.length ?? 0,
      actionLabel: this.presentation ? this.i18n.t(this.presentation.actionLabelKey) : '',
      fastMode: this.fastMode,
    })
    this.uiBus.emit('duel:complete')
    this.scene.stop()
  }
}
