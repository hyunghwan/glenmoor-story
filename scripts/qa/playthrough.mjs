import fs from 'node:fs'
import path from 'node:path'
import { chromium } from 'playwright'

const outputDir = path.resolve('output/web-game/playthrough')
fs.mkdirSync(outputDir, { recursive: true })

const browser = await chromium.launch({ headless: true })
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } })

async function saveState(name) {
  const text = await page.evaluate(() => window.render_game_to_text())
  fs.writeFileSync(path.join(outputDir, `${name}.json`), text)
}

async function saveShot(name) {
  await page.screenshot({ path: path.join(outputDir, `${name}.png`), fullPage: false })
}

async function fastForward() {
  await page.evaluate(() => window.advanceTime(1500))
  await page.waitForTimeout(120)
}

await page.goto('http://127.0.0.1:5173', { waitUntil: 'domcontentloaded' })
await page.waitForFunction(() => Boolean(window.__glenmoorDebug))

await saveShot('01-briefing-en')
await saveState('01-briefing-en')

await page.evaluate(() => window.__glenmoorDebug.command('start-battle'))
await page.waitForFunction(() => JSON.parse(window.render_game_to_text()).hud.phase === 'active')
await saveShot('02-battle-en')
await saveState('02-battle-en')

await page.evaluate(() => window.__glenmoorDebug.locale('ko'))
await page.waitForTimeout(150)
await saveShot('03-battle-ko')
await saveState('03-battle-ko')

await page.evaluate(() => {
  window.__glenmoorDebug.locale('en')
  window.__glenmoorDebug.stage('engagement')
})
await page.waitForTimeout(120)
await saveShot('04-engagement-before')
await saveState('04-engagement-before')

await page.evaluate(() => {
  window.__glenmoorDebug.command('attack')
  window.__glenmoorDebug.tile(7, 7)
})
await page.waitForTimeout(120)
await saveShot('05-engagement-duel')
await fastForward()
await saveShot('06-engagement-after')
await saveState('06-engagement-after')

await page.evaluate(() => window.__glenmoorDebug.stage('skill-demo'))
await page.waitForTimeout(120)
await saveShot('07-skill-before')
await page.evaluate(() => {
  window.__glenmoorDebug.command('skill')
  window.__glenmoorDebug.tile(8, 7)
})
await page.waitForTimeout(120)
await saveShot('08-skill-duel')
await fastForward()
await saveShot('09-skill-after')
await saveState('09-skill-after')

await page.evaluate(() => window.__glenmoorDebug.stage('push-demo'))
await page.waitForTimeout(120)
await page.evaluate(() => {
  window.__glenmoorDebug.command('skill')
  window.__glenmoorDebug.tile(0, 0)
})
await page.waitForTimeout(120)
await saveShot('10-push-duel')
await fastForward()
await saveState('10-push-after')

await page.evaluate(() => window.__glenmoorDebug.stage('victory-demo'))
await page.waitForTimeout(120)
await page.evaluate(() => {
  window.__glenmoorDebug.command('attack')
  window.__glenmoorDebug.tile(7, 7)
})
await page.waitForTimeout(120)
await fastForward()
await saveShot('11-victory')
await saveState('11-victory')

await browser.close()
