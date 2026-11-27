import { expect, test } from '@playwright/test'
import { model, playOne } from './helpers'

// 2 kişilik mod (R-20..R-28): sen ve yapay zekâ, bazarlı, bekleme yok
test('E-8 bota karşı 2 kişi: tek sekmede oyun başlar, yalnız karşı koltuk, bazar sayısı, iki tur biter', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: false })
  const page = await ctx.newPage()
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(String(e)))
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
  await page.goto('/')
  await page.fill('input.name', 'Tek')
  await page.click('button.duo')
  await expect.poll(async () => (await model(page)).screen).toBe('game')
  const m0 = (await model(page)) as unknown as { players: number; boneyard: number; handSizes: number[] }
  expect(m0.players).toBe(2)
  expect(m0.handSizes).toHaveLength(2)
  await expect(page.locator('.seat.rel2')).toBeVisible()
  await expect(page.locator('.seat.rel1')).toBeHidden()
  await expect(page.locator('.seat.rel3')).toBeHidden()
  await expect(page.locator('.hud .meta')).toContainText('Bazar')
  let rounds = 0
  let draws = 0
  for (let i = 0; i < 600 && rounds < 2; i++) {
    const m = await model(page)
    if (m.roundOver) {
      rounds++
      expect(m.roundOver.hands).toHaveLength(2)
      if (rounds < 2) {
        await page.locator('.overlay.show button.primary').click()
        await expect.poll(async () => (await model(page)).roundOver).toBeNull()
      }
      continue
    }
    const before = ((await model(page)) as unknown as { boneyard: number }).boneyard
    if (!(await playOne(page, 'tap'))) await page.waitForTimeout(120)
    const after = ((await model(page)) as unknown as { boneyard: number }).boneyard
    if (after < before) draws++
    // el ekrana sığar (çekişle büyüse de)
    const boxes = await page.locator('.tile.hand').evaluateAll((els) => els.map((e) => e.getBoundingClientRect()).map((r) => [r.left, r.right]))
    for (const [l, r] of boxes) {
      expect(l).toBeGreaterThanOrEqual(-1)
      expect(r).toBeLessThanOrEqual(391)
    }
  }
  expect(rounds).toBe(2)
  expect(errors).toEqual([])
  test.info().annotations.push({ type: 'çekiş', description: String(draws) })
  await ctx.close()
})
