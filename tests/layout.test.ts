import { describe, expect, it } from 'vitest'
import { bbox, fitUnit, ghostPlace, GAP, halfExtent, inferAnchor, overlaps, snakeLayout, type Place } from '../src/layout'
import type { Tile } from '../src/protocol'

// Rastgele ama kurala uygun tahta üret (iki uçtan), açılış indeksini takip et
function randomBoard(seed: number, n: number): { board: Tile[]; anchor: number } {
  let s = seed
  const rnd = () => ((s = (s * 1103515245 + 12345) % 2147483648) / 2147483648)
  const all: Tile[] = []
  for (let a = 0; a <= 6; a++) for (let b = a; b <= 6; b++) all.push([a, b])
  const pool = [...all].sort(() => rnd() - 0.5)
  const board: Tile[] = [pool.pop()!]
  let anchor = 0
  while (board.length < n) {
    const L = board[0][0], R = board[board.length - 1][1]
    const opts: Array<[Tile, boolean]> = []
    for (const t of pool) {
      if (t[0] === L || t[1] === L) opts.push([t, true])
      if (t[0] === R || t[1] === R) opts.push([t, false])
    }
    if (!opts.length) break
    const [t, left] = opts[Math.floor(rnd() * opts.length)]
    pool.splice(pool.indexOf(t), 1)
    if (left) { board.unshift(t[1] === L ? [t[0], t[1]] : [t[1], t[0]]); anchor++ }
    else board.push(t[0] === R ? [t[0], t[1]] : [t[1], t[0]])
  }
  return { board, anchor }
}

const rotate = (p: Place, dx: number): [number, number] => {
  const r = (p.rot * Math.PI) / 180
  return [p.x + dx * Math.cos(r), p.y + dx * Math.sin(r)]
}
const halfCenter = (p: Place, t: Tile, which: 'a' | 'b'): [number, number] =>
  t[0] === t[1] ? [p.x, p.y] : rotate(p, which === 'a' ? -0.5 : 0.5)
const dist = (a: [number, number], b: [number, number]) => Math.hypot(a[0] - b[0], a[1] - b[1])

describe('snakeLayout', () => {
  const widths = [4.5, 6, 7.5, 9, 12, 16]
  it('L-1 hiçbir iki taş çakışmaz (çok sayıda rastgele tahta, farklı genişlikler)', () => {
    for (let seed = 1; seed <= 300; seed++) {
      const { board, anchor } = randomBoard(seed, 28)
      for (const X of widths) {
        const pl = snakeLayout(board, anchor, X)
        for (let i = 0; i < pl.length; i++)
          for (let j = i + 1; j < pl.length; j++)
            expect(overlaps(pl[i], pl[j]), `seed ${seed} X ${X} ${i}/${j}`).toBe(false)
      }
    }
  })
  it('L-2 komşu taşların eşleşen yarıları bitişik (yön doğru, yanlış yarı daha uzak)', () => {
    for (let seed = 1; seed <= 300; seed++) {
      const { board, anchor } = randomBoard(seed, 28)
      for (const X of widths) {
        const pl = snakeLayout(board, anchor, X)
        for (let i = 0; i + 1 < board.length; i++) {
          const b = halfCenter(pl[i], board[i], 'b'), a = halfCenter(pl[i + 1], board[i + 1], 'a')
          const d = dist(a, b)
          const dbl = board[i][0] === board[i][1] || board[i + 1][0] === board[i + 1][1]
          expect(Math.abs(d - (1 + GAP)) < 1e-9 || (dbl && Math.abs(d - (1.5 + GAP)) < 1e-9), `seed ${seed} X ${X} i ${i} d ${d}`).toBe(true)
          if (!dbl) { // eşleşen yarı, eşleşmeyen yarıdan yakın
            const wrong = dist(halfCenter(pl[i], board[i], 'a'), halfCenter(pl[i + 1], board[i + 1], 'b'))
            expect(wrong).toBeGreaterThan(d)
          }
        }
      }
    }
  })
  it('L-3 yerleşmiş taşlar yeni taş eklenince yer değiştirmez (uzayınca küçülmez)', () => {
    for (let seed = 1; seed <= 100; seed++) {
      const { board, anchor } = randomBoard(seed, 28)
      // önek tahtalar: açılış indeksi etrafında büyüyen pencereler
      for (let l = 0; l <= anchor; l++) for (let r = anchor; r < board.length; r += 3) {
        const sub = board.slice(l, r + 1)
        const p1 = snakeLayout(sub, anchor - l, 7)
        const full = snakeLayout(board, anchor, 7)
        sub.forEach((_, i) => expect(p1[i]).toEqual(full[l + i]))
      }
    }
  })
  it('L-4 çift taş gidişe enine, açılış merkezde', () => {
    const pl = snakeLayout([[2, 5], [5, 5], [5, 1]], 0, 20)
    expect(pl[0]).toEqual({ x: 0, y: 0, rot: 0 })
    expect(Math.abs(pl[1].rot) % 180).toBe(90)
    expect(snakeLayout([[3, 3]], 0, 20)[0].rot).toBe(90)
  })
  it('L-5 dar alanda yılan kenarda döner (sınır ±1u içinde kalır)', () => {
    for (let seed = 1; seed <= 200; seed++) {
      const { board, anchor } = randomBoard(seed, 28)
      const X = 7
      const b = bbox(snakeLayout(board, anchor, X))
      expect(b.maxX).toBeLessThanOrEqual(X + 1.5 + 2 * GAP + 1e-9)
      expect(b.minX).toBeGreaterThanOrEqual(-X - 1.5 - 2 * GAP - 1e-9)
    }
  })
})

describe('ghostPlace / inferAnchor / fitUnit', () => {
  it('L-6 hayalet hedef, taş gerçekten eklenince aldığı yerle aynı', () => {
    for (let seed = 1; seed <= 100; seed++) {
      const { board, anchor } = randomBoard(seed, 20)
      const more = randomBoard(seed, 21)
      if (more.board.length < 21) continue
      const nb = more.board, na = more.anchor
      const added = na > anchor ? nb[0] : nb[nb.length - 1]
      const toLeft = na > anchor
      // aynı tohum aynı ilk 20 taşı üretir
      expect(nb.slice(toLeft ? 1 : 0, toLeft ? 21 : 20)).toEqual(board)
      const g = ghostPlace(board, anchor, 7, [added[1], added[0]], toLeft, board[0][0], board[board.length - 1][1])
      const real = snakeLayout(nb, na, 7)
      expect(g).toEqual(toLeft ? real[0] : real[real.length - 1])
    }
  })
  it('L-7 açılış indeksi önceki tahtadan çıkarılır (atlanan hamlelerle de)', () => {
    const { board, anchor } = randomBoard(7, 20)
    const prev = board.slice(3, 12)
    expect(inferAnchor(prev, anchor - 3, board)).toBe(anchor)
    expect(inferAnchor([], 0, [[1, 2]])).toBe(0)
    expect(inferAnchor([], 0, board)).toBeNull()
    expect(inferAnchor([[6, 6]], 0, [[1, 2]])).toBeNull()
  })
  it('L-8 fitUnit: 13+13 taşlık yılan alana sığar, alan büyüdükçe u küçülmez', () => {
    for (const [W, H] of [[343, 420], [700, 380], [1200, 600], [390, 300]]) {
      const { u, X } = fitUnit(W, H, 60)
      const probe: [number, number][] = Array.from({ length: 27 }, () => [1, 2])
      const b = bbox(snakeLayout(probe, 13, X))
      expect((b.maxX - b.minX) * u).toBeLessThanOrEqual(W + 1e-6)
      expect(Math.max(b.maxY, -b.minY) * 2 * u).toBeLessThanOrEqual(H + 1e-6)
      expect(fitUnit(W * 1.3, H * 1.3, 60).u).toBeGreaterThanOrEqual(u)
    }
    expect(halfExtent({ x: 0, y: 0, rot: 270 })).toEqual([0.5, 1])
  })
})
