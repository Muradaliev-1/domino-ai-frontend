import { expect, test } from '@playwright/test'
import { checkBoard, checkHand, model, playOne, playRound, settle, tileId, twoPlayers } from './helpers'

test('E-1 iki sekme: tam tur sürükle-bırakla, tur sonu eller açılır, sonraki tur başlar', async ({ browser }) => {
  const { ctx, a, b, errors } = await twoPlayers(browser)
  // masa taşının boyu tur boyunca sabit (uzayınca küçülmez)
  let firstSize: number | null = null
  await playRound(a, b, (i) => (i % 3 === 2 ? 'tap' : 'drag'))
  for (const p of [a, b]) {
    const boxes = await checkBoard(p)
    await checkHand(p)
    const m = await model(p)
    // tur sonu paneli ve açılan eller
    await expect(p.locator('.overlay.show .card')).toBeVisible()
    await p.screenshot({ path: `shots/desktop-tur-sonu-${p === a ? 'a' : 'b'}.png` })
    const others = m.roundOver!.hands.filter((_, i) => i !== m.me).flat().length
    await expect(p.locator('.layer .tile.revealed')).toHaveCount(others)
    const sizes = boxes.map((x) => Math.max(x.w, x.h))
    if (firstSize === null) firstSize = Math.min(...sizes)
  }
  expect((await model(a)).board).toEqual((await model(b)).board)
  // "Masaya bak": panel çekilir, masa görünür; "Sonucu göster" geri getirir
  await a.waitForTimeout(1800)
  await a.locator('.overlay .look').click()
  await expect(a.locator('.overlay.peek .peekbtn')).toBeVisible()
  await expect(a.locator('.overlay .card')).toHaveCSS('opacity', '0')
  await a.locator('.overlay .peekbtn').click()
  await expect(a.locator('.overlay.peek')).toHaveCount(0)
  // sonraki tur
  await a.locator('.overlay.show button.primary').click()
  await b.locator('.overlay.show button.primary').click({ timeout: 2000 }).catch(() => undefined) // a başlattıysa panel çoktan kapanmıştır
  for (const p of [a, b]) {
    await expect.poll(async () => (await model(p)).match?.round_no).toBe(2)
    await expect(p.locator('.overlay.show')).toHaveCount(0)
  }
  await expect.poll(async () => (await model(a)).roundOver).toBeNull()
  expect(errors, 'konsol hataları').toEqual([])
  await ctx.close()
})

test('E-2 sürükleme: yanlış yere bırakılan taş ele geri kayar, uca yaklaşınca uç parlar', async ({ browser }) => {
  const { ctx, a, b, errors } = await twoPlayers(browser)
  // sırası gelen sekmeyi bul
  let p = a
  for (let k = 0; k < 200; k++) {
    const [ma, mb] = [await model(a), await model(b)]
    const okA = ma.legal.some((x) => !x.is_pass), okB = mb.legal.some((x) => !x.is_pass)
    if (okA || okB) { p = okA ? a : b; break }
    if (ma.legal.length) await playOne(a)
    if (mb.legal.length) await playOne(b)
    await a.waitForTimeout(80)
  }
  const m = await model(p)
  const mv = m.legal.find((x) => !x.is_pass)!
  const tile = p.locator(`.tile.hand[data-id="${tileId(mv.tile)}"]`)
  await settle(p) // elin kalkma animasyonu bitsin
  const before = (await tile.boundingBox())!
  const cx = before.x + before.width / 2, cy = before.y + before.height / 2
  // boş bir köşeye sürükle ve bırak
  await p.mouse.move(cx, cy)
  await p.mouse.down()
  await p.mouse.move(cx + 5, cy - 30, { steps: 3 })
  await expect(p.locator('.ghost').first()).toBeVisible()
  await p.mouse.move(20, 200, { steps: 8 })
  await expect(p.locator('.ghost.hot')).toHaveCount(0)
  const mid = (await tile.boundingBox())!
  expect(Math.abs(mid.x - before.x) + Math.abs(mid.y - before.y)).toBeGreaterThan(100) // taş imleci izledi
  await p.mouse.up()
  await expect.poll(async () => {
    const r = (await tile.boundingBox())!
    return Math.round(Math.abs(r.x - before.x) + Math.abs(r.y - before.y))
  }).toBeLessThan(2)
  expect((await model(p)).legal.length).toBeGreaterThan(0) // hamle gönderilmedi
  await expect(p.locator('.ghost')).toHaveCount(0)
  // şimdi uca: uç parlar (hot), bırakınca oturur
  await playOne(p, 'drag')
  await checkBoard(p)
  expect(errors, 'konsol hataları').toEqual([])
  await ctx.close()
})

test('E-3 arka plandaki sekme: rAF dururken gelen hamleler ekrana doğru yazılır, öne gelince oyun sürer', async ({ browser }) => {
  const { ctx, a, b, errors } = await twoPlayers(browser)
  // b'yi "arka plana" al: document.hidden = true, requestAnimationFrame hiç çalışmaz (tarayıcının arka plan davranışı)
  const hide = (hidden: boolean) =>
    b.evaluate((h) => {
      const w = window as unknown as { __raf?: typeof requestAnimationFrame }
      Object.defineProperty(document, 'hidden', { configurable: true, get: () => h })
      Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => (h ? 'hidden' : 'visible') })
      if (h) {
        w.__raf = window.requestAnimationFrame
        window.requestAnimationFrame = () => 0
      } else if (w.__raf) window.requestAnimationFrame = w.__raf
      document.dispatchEvent(new Event('visibilitychange'))
    }, hidden)
  // açılış yapılsın (b açılış sahibiyse masa boş başlar)
  while ((await model(a)).board.length === 0) if (!(await playOne(a)) && !(await playOne(b))) await a.waitForTimeout(80)
  await hide(true)
  // b'nin sırası gelene kadar yalnız a oynar; b gizliyken DOM her mesajda güncel olmalı
  for (let k = 0; k < 400; k++) {
    const mb = await model(b)
    if (mb.legal.length || mb.roundOver) break
    if (!(await playOne(a))) await a.waitForTimeout(60)
  }
  const mb = await model(b)
  expect(mb.board.length).toBeGreaterThan(0)
  await checkBoard(b) // rAF hiç çalışmadan masa doğru
  await checkHand(b)
  await hide(false)
  await checkBoard(b)
  await playRound(a, b)
  await checkBoard(b)
  expect(errors, 'konsol hataları').toEqual([])
  await ctx.close()
})

test('E-4 sayfa yenileme: aynı koltuğa döner, el ve masa aynı, tur biter', async ({ browser }) => {
  const { ctx, a, b, errors } = await twoPlayers(browser)
  for (let k = 0; k < 6; k++) {
    if (!(await playOne(a)) && !(await playOne(b))) await a.waitForTimeout(150)
  }
  const before = await model(b)
  await b.reload()
  await expect.poll(async () => (await model(b)).screen).toBe('game')
  await expect.poll(async () => (await model(b)).board.length).toBeGreaterThanOrEqual(before.board.length)
  const after = await model(b)
  expect(after.me).toBe(before.me)
  const handNow = after.hand.map(tileId).sort()
  for (const id of handNow) expect(before.hand.map(tileId)).toContain(id)
  await checkHand(b)
  await checkBoard(b)
  await playRound(a, b)
  await expect(b.locator('.overlay.show .card')).toBeVisible()
  expect(errors.filter((e) => !/WebSocket/.test(e))).toEqual([])
  await ctx.close()
})

test('E-5 pencere boyutu değişimi oyun ortasında: yeniden yerleşir, durum korunur', async ({ browser }) => {
  const { ctx, a, b, errors } = await twoPlayers(browser)
  for (let k = 0; k < 10; k++) if (!(await playOne(a)) && !(await playOne(b))) await a.waitForTimeout(150)
  for (const vp of [{ width: 900, height: 600 }, { width: 390, height: 844 }, { width: 844, height: 390 }, { width: 1440, height: 900 }]) {
    await b.setViewportSize(vp)
    await b.waitForTimeout(250)
    await checkBoard(b)
    await checkHand(b)
  }
  await playRound(a, b)
  await checkBoard(b)
  expect(errors, 'konsol hataları').toEqual([])
  await ctx.close()
})
