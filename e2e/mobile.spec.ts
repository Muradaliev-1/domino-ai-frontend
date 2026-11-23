import { expect, test } from '@playwright/test'
import { checkBoard, checkHand, model, playRound, twoPlayers } from './helpers'

for (const vp of [{ width: 390, height: 844, name: 'telefon dikey' }, { width: 844, height: 390, name: 'telefon yatay' }]) {
  test(`E-6 ${vp.name}: dokunmatik sürükleme ve dokunarak tam tur`, async ({ browser }) => {
    const { ctx, a, b, errors } = await twoPlayers(browser, { viewport: { width: vp.width, height: vp.height }, hasTouch: true })
    await checkHand(a)
    await playRound(a, b, (i) => (i % 2 ? 'touch' : 'tap'))
    for (const p of [a, b]) {
      await checkBoard(p)
      await expect(p.locator('.overlay.show .card')).toBeVisible()
      await p.waitForTimeout(2600) // panel animasyonu
      await p.screenshot({ path: `shots/${vp.width}x${vp.height}-${p === a ? 'a' : 'b'}.png` })
      const card = (await p.locator('.overlay.show .card').boundingBox())!
      expect(card.x).toBeGreaterThanOrEqual(0)
      expect(card.x + card.width).toBeLessThanOrEqual(vp.width)
    }
    // sayfa yatay kaymıyor
    expect(await a.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
    expect((await model(a)).roundOver).not.toBeNull()
    expect(errors, 'konsol hataları').toEqual([])
    await ctx.close()
  })
}
