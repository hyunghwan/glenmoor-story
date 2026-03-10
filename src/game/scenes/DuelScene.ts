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
  accentColor: number
  tokenBaseX: number
  tokenBaseY: number
}

const FINAL_STEP_HOLD_MS = 260

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
  private fxGraphics?: Phaser.GameObjects.Graphics
  private flashGraphics?: Phaser.GameObjects.Graphics

  private resolveUnitAccent(unitId: string): string {
    const unit = this.resolution?.state.units[unitId]
    return unit?.team === 'enemies' ? '#ff8d73' : '#8fc1ff'
  }

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

    if (this.textures.exists('duel:backdrop')) {
      this.add.image(width / 2, height / 2, 'duel:backdrop').setDisplaySize(width, height).setAlpha(0.22)
    }
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
      this.cards.set(
        leftUnit.unitId,
        this.createCombatantCard(leftUnit, leftX, panelY + 34, this.resolveUnitAccent(leftUnit.unitId)),
      )
    }

    if (rightUnit) {
      this.cards.set(
        rightUnit.unitId,
        this.createCombatantCard(rightUnit, rightX, panelY + 34, this.resolveUnitAccent(rightUnit.unitId)),
      )
    }

    this.fxGraphics = this.add.graphics()
    this.flashGraphics = this.add.graphics().setBlendMode(Phaser.BlendModes.SCREEN)

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
    this.drawStepFx()
  }

  update(_time: number, delta: number): void {
    this.advanceTimeline(this.fastMode ? delta * 3 : delta)
    this.drawStepFx()
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

      const isFinalStep = this.stepIndex >= this.presentation.steps.length - 1
      const stepDurationWithHold = currentStep.durationMs + (isFinalStep ? FINAL_STEP_HOLD_MS : 0)

      if (isFinalStep && this.stepElapsedMs >= stepDurationWithHold) {
        this.finish()
        return
      }

      const remainingForStep = stepDurationWithHold - this.stepElapsedMs

      if (remaining < remainingForStep) {
        this.stepElapsedMs += remaining
        return
      }

      remaining -= remainingForStep

      if (isFinalStep) {
        this.stepElapsedMs = stepDurationWithHold
        this.emitTelemetry()
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
      step.kind === 'hit' || step.kind === 'counter'
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

    if (step.cameraCue === 'impact-heavy') {
      this.cameras.main.shake(110, 0.0035)
      this.cameras.main.flash(80, 255, 244, 214, false)
    } else if (step.cameraCue === 'impact-light') {
      this.cameras.main.shake(70, 0.002)
      this.cameras.main.flash(55, 210, 230, 255, false)
    } else if (step.cameraCue === 'support-pulse') {
      this.cameras.main.flash(75, 196, 255, 236, false)
    } else if (step.cameraCue === 'counter-jolt') {
      this.cameras.main.shake(90, 0.0028)
      this.cameras.main.flash(60, 255, 222, 210, false)
    } else if (step.cameraCue === 'defeat-drop') {
      this.cameras.main.shake(130, 0.0038)
      this.cameras.main.flash(95, 255, 232, 188, false)
    }

    this.playStepSfx(step)
    this.emitTelemetry()
  }

  private playSfx(key: string, config: Phaser.Types.Sound.SoundConfig = {}): void {
    if (!this.cache.audio.exists(`sfx:${key}`)) {
      return
    }

    this.sound.play(`sfx:${key}`, {
      volume: 0.22,
      ...config,
    })
  }

  private playStepSfx(step: CombatPresentation['steps'][number]): void {
    if (step.kind === 'cast' || step.kind === 'status') {
      this.playSfx('skill', { volume: 0.18 })
      return
    }

    if (step.kind === 'hit' || step.kind === 'counter' || step.kind === 'defeat' || step.kind === 'push') {
      this.playSfx('hit', { volume: 0.18 })
    }
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

      if ((step.kind === 'hit' || step.kind === 'counter') && step.targetId) {
        const target = this.displayUnits.get(step.targetId)

        if (target && step.amount !== undefined) {
          target.hp =
            step.valueKind === 'heal'
              ? target.hp + step.amount
              : Math.max(0, target.hp - step.amount)
        }
      }

      if (step.kind === 'status' && step.targetId) {
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

        }
      }

      if (step.kind === 'push' && step.targetId) {
        const target = this.displayUnits.get(step.targetId)

        if (target && step.push?.succeeded && step.push.destination) {
          target.position = { ...step.push.destination }
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
      accentColor: glowColor,
      tokenBaseX: x,
      tokenBaseY: y - 40,
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

  private resolveCueColor(fxCueId: string): number {
    if (fxCueId.includes('ember') || fxCueId.includes('burning')) {
      return 0xf09046
    }

    if (fxCueId.includes('ward') || fxCueId.includes('hymn') || fxCueId.includes('aegis')) {
      return 0x8bdcff
    }

    if (fxCueId.includes('shadow')) {
      return 0x9a77ff
    }

    if (fxCueId.includes('snare') || fxCueId.includes('slow') || fxCueId.includes('ranger')) {
      return 0x9cd3ff
    }

    if (fxCueId.includes('guard')) {
      return 0xffa37d
    }

    return 0xf5d18c
  }

  private resetCardTransforms(): void {
    for (const [unitId, card] of this.cards) {
      const display = this.displayUnits.get(unitId)
      card.token.setPosition(card.tokenBaseX, card.tokenBaseY)
      card.token.setScale(1)
      card.token.setAlpha(display?.defeated ? 0.34 : 0.92)
    }
  }

  private drawStepFx(): void {
    if (!this.presentation || !this.fxGraphics || !this.flashGraphics) {
      return
    }

    const step = this.presentation.steps[this.stepIndex]

    if (!step) {
      return
    }

    this.resetCardTransforms()
    this.fxGraphics.clear()
    this.flashGraphics.clear()

    const progress = Phaser.Math.Clamp(this.stepElapsedMs / Math.max(step.durationMs, 1), 0, 1)
    const actorCard = this.cards.get(step.actorId)
    const targetCard = step.targetId ? this.cards.get(step.targetId) : undefined
    const actorPos = actorCard
      ? { x: actorCard.tokenBaseX, y: actorCard.tokenBaseY }
      : { x: this.scale.width * 0.3, y: this.scale.height * 0.5 }
    const targetPos = targetCard
      ? { x: targetCard.tokenBaseX, y: targetCard.tokenBaseY }
      : { x: this.scale.width * 0.7, y: this.scale.height * 0.5 }
    const color = this.resolveCueColor(step.fxCueId)

    if (step.kind === 'announce') {
      this.fxGraphics.lineStyle(2, color, 0.26 + (1 - progress) * 0.2)
      this.fxGraphics.lineBetween(actorPos.x, actorPos.y + 30, targetPos.x, targetPos.y + 30)
      return
    }

    if (step.kind === 'cast' && actorCard) {
      const lift = Math.sin(progress * Math.PI) * 12
      actorCard.token.setY(actorCard.tokenBaseY - lift)
      actorCard.token.setScale(1 + Math.sin(progress * Math.PI) * 0.08)
      this.fxGraphics.lineStyle(2, color, 0.3 + progress * 0.3)
      this.fxGraphics.strokeCircle(actorPos.x, actorPos.y + 2, 26 + progress * 16)
      this.fxGraphics.strokeCircle(actorPos.x, actorPos.y + 2, 40 + progress * 22)
      return
    }

    if (step.kind === 'projectile') {
      const projectileX = Phaser.Math.Linear(actorPos.x, targetPos.x, progress)
      const projectileY = Phaser.Math.Linear(actorPos.y, targetPos.y, progress)
      this.fxGraphics.lineStyle(6, color, 0.18)
      this.fxGraphics.lineBetween(actorPos.x, actorPos.y, projectileX, projectileY)
      this.fxGraphics.fillStyle(color, 0.9)
      this.fxGraphics.fillCircle(projectileX, projectileY, 10)
      this.fxGraphics.lineStyle(2, 0xffffff, 0.55)
      this.fxGraphics.strokeCircle(projectileX, projectileY, 15)
      return
    }

    if ((step.kind === 'hit' || step.kind === 'counter') && targetCard) {
      const direction = step.kind === 'counter' ? -1 : 1
      const thrust = Math.sin(progress * Math.PI) * 12 * direction
      targetCard.token.setX(targetCard.tokenBaseX + thrust)
      targetCard.token.setScale(1.08 + (1 - progress) * 0.16)
      this.fxGraphics.fillStyle(color, 0.2)
      this.fxGraphics.fillCircle(targetPos.x, targetPos.y, 22 + Math.sin(progress * Math.PI) * 18)
      this.fxGraphics.lineStyle(3, color, 0.88)
      this.fxGraphics.lineBetween(targetPos.x - 20, targetPos.y, targetPos.x + 20, targetPos.y)
      this.fxGraphics.lineBetween(targetPos.x, targetPos.y - 20, targetPos.x, targetPos.y + 20)
      this.flashGraphics.fillStyle(color, 0.045 + Math.sin(progress * Math.PI) * 0.08)
      this.flashGraphics.fillRect(0, 0, this.scale.width, this.scale.height)
      return
    }

    if (step.kind === 'status' && targetCard) {
      this.fxGraphics.lineStyle(2, color, 0.7)
      this.fxGraphics.strokeCircle(targetPos.x, targetPos.y, 28 + progress * 14)
      this.fxGraphics.strokeCircle(targetPos.x, targetPos.y, 42 + progress * 18)
      for (let index = 0; index < Math.max(3, step.statusChanges.length * 2); index += 1) {
        const angle = progress * Math.PI * 2 + index * ((Math.PI * 2) / Math.max(3, step.statusChanges.length * 2))
        this.fxGraphics.fillStyle(color, 0.6)
        this.fxGraphics.fillCircle(targetPos.x + Math.cos(angle) * 28, targetPos.y + Math.sin(angle) * 18, 4)
      }
      return
    }

    if (step.kind === 'push' && targetCard) {
      const distance = step.push?.succeeded ? 28 : 14
      targetCard.token.setX(targetCard.tokenBaseX + Math.sin(progress * Math.PI) * distance)
      this.fxGraphics.lineStyle(3, color, 0.82)
      this.fxGraphics.lineBetween(targetPos.x - 24, targetPos.y + 22, targetPos.x + 18, targetPos.y + 22)
      this.fxGraphics.lineBetween(targetPos.x + 12, targetPos.y + 16, targetPos.x + 18, targetPos.y + 22)
      this.fxGraphics.lineBetween(targetPos.x + 12, targetPos.y + 28, targetPos.x + 18, targetPos.y + 22)
      return
    }

    if (step.kind === 'defeat' && targetCard) {
      targetCard.token.setY(targetCard.tokenBaseY + progress * 26)
      targetCard.token.setAlpha(0.92 * (1 - progress))
      this.fxGraphics.fillStyle(0xf3d89a, 0.08 + (1 - progress) * 0.12)
      this.fxGraphics.fillCircle(targetPos.x, targetPos.y, 26 + progress * 36)
      this.fxGraphics.lineStyle(2, 0xf3d89a, 0.7 * (1 - progress))
      this.fxGraphics.strokeCircle(targetPos.x, targetPos.y, 40 + progress * 36)
      return
    }

    if (step.kind === 'recover' && actorCard) {
      this.fxGraphics.lineStyle(2, color, 0.5 * (1 - progress))
      this.fxGraphics.strokeCircle(actorPos.x, actorPos.y, 38 + progress * 24)
    }
  }

  private emitTelemetry(): void {
    const step = this.presentation?.steps[this.stepIndex]

    this.uiBus.emit('duel:telemetry', {
      active: true,
      stepIndex: this.stepIndex + 1,
      stepCount: this.presentation?.steps.length ?? 0,
      actionLabel: this.presentation ? this.i18n.t(this.presentation.actionLabelKey) : '',
      fastMode: this.fastMode,
      stepKind: step?.kind,
      fxCueId: step?.fxCueId,
      targetUnitId: step?.targetId,
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
      stepKind: undefined,
      fxCueId: undefined,
      targetUnitId: undefined,
    })
    this.uiBus.emit('duel:complete')
    this.scene.stop()
  }
}
