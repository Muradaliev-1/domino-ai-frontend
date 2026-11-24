import { expect, type Browser, type Page } from '@playwright/test'

export interface Mv { tile: [number, number]; to_left: boolean; is_pass: boolean }
export interface M {
  screen: string
  me: number
  board: [number, number][]
  hand: [number, number][]
  legal: Mv[]
  roundOver: null | { hands: [number, number][][]; match: { round_no: number } }
  match: null | { round_no: number; score: [number, number] }
  pending: unknown
  current: number
}

export const tileId = (t: number[]) => (t[0] <= t[1] ? `${t[0]}-${t[1]}` : `${t[1]}-${t[0]}`)

export async function model(page: Page): Promise<M> {
  return page.evaluate(() => (window as unknown as { __domino: { model: M } }).__domino.model)
}

/** İki oyunculu oda: iki ayrı sekme (sessionStorage sekmeye özel → iki koltuk). */
export async function twoPlayers(
  browser: Browser,
  opts: { viewport?: { width: number; height: number }; hasTouch?: boolean; blockRafB?: boolean } = {},
) {
  const ctx = await browser.newContext({ viewport: opts.viewport ?? { width: 1280, height: 760 }, hasTouch: opts.hasTouch })
  const a = await ctx.newPage()
  const b = await ctx.newPage()
  // tarayıcının "görünür ama rAF durmuş" hâli (gizli panel, örtülü pencere): canlıda bulundu, 2026-11-24
  if (opts.blockRafB) await b.addInitScript(() => { window.requestAnimationFrame = () => 0 })
  const errors: string[] = []
  for (const p of [a, b]) {
    p.on('pageerror', (e) => errors.push(String(e)))
    p.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
  }
  // yanlış backend'e bağlanmayı yakala (adres VITE_WS_URL ile test sunucusuna verilir)
  a.on('websocket', (ws) => { if (!ws.url().includes(':5199') && !ws.url().includes(':8765')) errors.push(`yanlış ws: ${ws.url()}`) })
  await a.goto('/')
  await a.fill('input.name', 'Ayla')
  await a.click('button.primary')
  await expect(a.locator('.waiting')).toBeVisible()
  await b.goto('/')
  await b.fill('input.name', 'Bora')
  await b.click('button.primary')
  for (const p of [a, b]) await expect.poll(async () => (await model(p)).screen).toBe('game')
  return { ctx, a, b, errors }
}

function rnd(n: number) {
  return Math.floor(Math.random() * n)
}

export type Mode = 'drag' | 'tap' | 'touch'

/** Sıra bu sekmedeyse gerçek arayüzle bir hamle yap (sürükle ya da dokun). Hamle yapıldıysa true. */
export async function playOne(page: Page, mode: Mode = 'drag'): Promise<boolean> {
  const m = await model(page)
  if (!m.legal.length || m.roundOver || m.pending) return false
  if (m.legal.every((x) => x.is_pass)) {
    await page.locator('.passbtn.show').click()
    await expect.poll(async () => (await model(page)).legal.length).toBe(0)
    return true
  }
  const opts = m.legal.filter((x) => !x.is_pass)
  const mv = opts[rnd(opts.length)]
  const id = tileId(mv.tile)
  const side = mv.to_left ? 'L' : 'R'
  const tile = page.locator(`.tile.hand[data-id="${id}"]`)
  const box = (await tile.boundingBox())!
  const cx = box.x + box.width / 2
  const cy = box.y + box.height / 2
  const sameTile = opts.filter((x) => tileId(x.tile) === id)
  if (mode === 'drag') {
    await page.mouse.move(cx, cy)
    await page.mouse.down()
    await page.mouse.move(cx + 3, cy - 20, { steps: 3 })
    const ghost = page.locator(`.ghost[data-side="${side}"]`).first()
    await ghost.waitFor({ timeout: 3000 })
    const g = (await ghost.boundingBox())!
    await page.mouse.move(g.x + g.width / 2, g.y + g.height / 2, { steps: 10 })
    await expect(page.locator('.ghost.hot')).toHaveCount(1)
    await page.mouse.up()
  } else if (mode === 'touch') {
    await touchDrag(page, cx, cy, async () => {
      const g = (await page.locator(`.ghost[data-side="${side}"]`).first().boundingBox())!
      return { x: g.x + g.width / 2, y: g.y + g.height / 2 }
    })
  } else {
    await tile.click()
    if (sameTile.length > 1) await page.locator(`.ghost[data-side="${side}"]`).click()
  }
  await expect.poll(async () => (await model(page)).legal.length).toBe(0)
  return true
}

/** Dokunmatik sürükleme (CDP dokunma olayları → tarayıcı Pointer Events üretir). */
export async function touchDrag(page: Page, x: number, y: number, target: () => Promise<{ x: number; y: number }>) {
  const cdp = await page.context().newCDPSession(page)
  const tp = (px: number, py: number) => [{ x: px, y: py, id: 1, radiusX: 4, radiusY: 4, force: 1 }]
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: tp(x, y) })
  for (let i = 1; i <= 4; i++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: tp(x, y - i * 8) })
  const t = await target()
  // parmak taşın biraz altında: dokunmatikte taş parmağın üstüne kalkar (lift), hedefe parmakla değil taşla varılır
  const steps = 12
  let px = x, py = y - 32
  for (let i = 1; i <= steps; i++) {
    px = x + ((t.x - x) * i) / steps
    py = y - 32 + ((t.y + 40 - (y - 32)) * i) / steps
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: tp(px, py) })
  }
  // mıknatıs alanına girene kadar yaklaş
  for (let k = 0; k < 10 && (await page.locator('.ghost.hot').count()) === 0; k++) {
    py -= 6
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: tp(px, py) })
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  await cdp.detach()
}

/** Tur bitene kadar iki sekmeyi oynat. */
export async function playRound(a: Page, b: Page, mode: Mode | ((i: number) => Mode) = 'drag', limitMs = 120_000) {
  const t0 = Date.now()
  let i = 0
  for (;;) {
    const [ma, mb] = [await model(a), await model(b)]
    if (ma.roundOver && mb.roundOver) return
    if (Date.now() - t0 > limitMs) throw new Error('tur bitmedi')
    const md = typeof mode === 'function' ? mode(i) : mode
    const t1 = Date.now()
    const moved = (await playOne(a, md)) || (await playOne(b, md))
    if (moved) { i++; if (process.env.E2E_DEBUG) console.log(`hamle ${i} ${md} ${Date.now() - t1} ms (toplam ${Date.now() - t0})`) }
    else await a.waitForTimeout(60)
  }
}

/** Ekrandaki masa taşları birbirine binmiyor, ekranın içinde ve modelle aynı sayıda. */
/** Taş animasyonları bitene kadar bekle (ölçüm son kareyi görsün). */
export async function settle(page: Page) {
  // polling: rAF değil (arka plan sekmesi testinde rAF durduruluyor)
  // bekleyen çizim kalmasın (rAF durmuşsa çizim 120 ms zamanlayıcıyla gelir) ve taş animasyonları bitsin
  await page.waitForFunction(() =>
    !(window as unknown as { __domino: { view: { renderPending: boolean } } }).__domino.view.renderPending &&
    document.getAnimations().every((a) => a.playState !== 'running' || !(a.effect as KeyframeEffect | null)?.target?.classList.contains('tile')),
    undefined, { polling: 100 },
  )
}

export async function checkBoard(page: Page) {
  await settle(page)
  // hiçbir kap kaymamış olmalı (ekran kayarsa her şey yana kayar)
  expect(await page.evaluate(() => [document.documentElement, document.body, document.getElementById('app')!, ...document.querySelectorAll('#app > *')]
    .map((e) => (e as HTMLElement).scrollLeft + (e as HTMLElement).scrollTop).reduce((x, y) => x + y, 0))).toBe(0)
  // model ve DOM aynı anda okunur (oyun sürüyor: ayrı okumalarda arada bot oynayabilir)
  let snap
  for (let k = 0; ; k++) {
  snap = await page.evaluate(() => {
    const d = (window as unknown as { __domino: { model: M; trace: string[] } }).__domino
    const moving = new Set(document.getAnimations().filter((a) => a.playState === 'running')
      .map((a) => ((a.effect as KeyframeEffect | null)?.target as HTMLElement | null)?.dataset?.id).filter(Boolean))
    const boxes = [...document.querySelectorAll<HTMLElement>('.layer .tile:not(.hand):not(.revealed)')].map((el) => {
      const r = el.getBoundingClientRect()
      return { id: el.dataset.id!, x: r.x, y: r.y, w: r.width, h: r.height, moving: moving.has(el.dataset.id) }
    })
    return { board: d.model.board, boxes, trace: d.trace.slice(-12).join(' | '), pending: (d as unknown as { view: { renderPending: boolean } }).view.renderPending }
  })
  if (!snap.pending || k > 30) break
  await page.waitForTimeout(50)
  }
  const boxes = snap.boxes
  expect(boxes.map((b) => b.id).sort(), `masadaki taşlar = model ${snap.trace}`).toEqual(snap.board.map(tileId).sort())
  const vp = page.viewportSize()!
  const still = boxes.filter((b) => !b.moving)
  for (const b of still) {
    expect(b.x).toBeGreaterThanOrEqual(-1)
    expect(b.y).toBeGreaterThanOrEqual(-1)
    expect(b.x + b.w).toBeLessThanOrEqual(vp.width + 1)
    expect(b.y + b.h).toBeLessThanOrEqual(vp.height + 1)
  }
  for (let i = 0; i < still.length; i++)
    for (let j = i + 1; j < still.length; j++) {
      const p = still[i], q = still[j]
      const ox = Math.min(p.x + p.w, q.x + q.w) - Math.max(p.x, q.x)
      const oy = Math.min(p.y + p.h, q.y + q.h) - Math.max(p.y, q.y)
      expect(ox > 1.5 && oy > 1.5, `${p.id} ile ${q.id} çakışıyor`).toBe(false)
    }
  return boxes
}

/** El taşları ekranda, birbirine binmiyor, modeldeki elle aynı. */
export async function checkHand(page: Page) {
  await settle(page)
  let snap
  for (let k = 0; ; k++) {
  snap = await page.evaluate(() => {
    const m = (window as unknown as { __domino: { model: M } }).__domino.model
    const boxes = [...document.querySelectorAll<HTMLElement>('.layer .tile.hand')].map((el) => {
      const r = el.getBoundingClientRect()
      return { id: el.dataset.id!, x: r.x, y: r.y, w: r.width, h: r.height }
    })
    return { board: m.board, hand: m.hand, boxes, pending: (window as unknown as { __domino: { view: { renderPending: boolean } } }).__domino.view.renderPending }
  })
  if (!snap.pending || k > 30) break
  await page.waitForTimeout(50)
  }
  const onBoard = new Set(snap.board.map(tileId))
  const want = snap.hand.map(tileId).filter((id) => !onBoard.has(id)).sort()
  const boxes = snap.boxes
  expect(boxes.map((b) => b.id).sort(), 'eldeki taşlar = model').toEqual(want)
  const vp = page.viewportSize()!
  for (const b of boxes) {
    expect(b.x).toBeGreaterThanOrEqual(0)
    expect(b.x + b.w).toBeLessThanOrEqual(vp.width)
    expect(b.y + b.h).toBeLessThanOrEqual(vp.height)
  }
  const xs = boxes.map((b) => [b.x, b.x + b.w]).sort((p, q) => p[0] - q[0])
  for (let i = 1; i < xs.length; i++) expect(xs[i][0]).toBeGreaterThanOrEqual(xs[i - 1][1] - 0.5)
}
