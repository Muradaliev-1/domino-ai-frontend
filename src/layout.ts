// Masa dizilimi: saf fonksiyonlar (DOM yok), birim testli (tests/layout.test.ts).
// Birim u = taşın kısa kenarı. Taşın temel duruşu yatay 2u × 1u, `a` solda, `b` sağda.
// Açılış taşı (anchor) merkezde; sağ zincir sağa gider, kenarda aşağı döner, sonra sola, ... (yılan);
// sol zincir aynalı: sola gider, kenarda yukarı döner. Çift taşlar her zaman gidiş yönüne enine durur.
// Yerleşmiş bir taşın konumu sonradan eklenen taşlarla değişmez (uzayınca küçülmez).

import { isDouble, type Tile } from './protocol'

export interface Place {
  x: number // merkez, u biriminde (0,0 = açılış taşının merkezi)
  y: number
  rot: number // derece; 0 = yatay (a solda)
}

export const GAP = 0.08
/** Köşeden sonraki çift taş sınırı en çok bu kadar (u) aşar; X bu payla küçültülür, taş alandan çıkmaz. */
export const OVERFLOW = 1.5 + 2 * GAP

/** Taşın kapladığı yarı genişlik/yükseklik (u). */
export function halfExtent(p: Place): [number, number] {
  const vertical = Math.abs(Math.round(p.rot / 90)) % 2 === 1
  return vertical ? [0.5, 1] : [1, 0.5]
}

function chain(tiles: Tile[], side: 1 | -1, startX: number, X: number, g: number): Place[] {
  const out: Place[] = []
  let h: number = side // yatay gidiş yönü
  const v: number = side // satır değiştirme yönü (sağ zincir aşağı, sol zincir yukarı)
  let cx = startX // serbest ucun kenarı (x)
  let y = 0 // satırın orta çizgisi
  let afterCorner = false
  let cornerX = 0
  let cornerEndY = 0
  const angleOf = (dx: number, dy: number) => (dx > 0 ? 0 : dx < 0 ? 180 : dy > 0 ? 90 : -90)
  for (const t of tiles) {
    const d = isDouble(t)
    // gidiş yönü θ için dönüş: sağ zincirde a girişte (θ), sol zincirde b girişte (θ+180), çift enine (θ+90)
    const rotFor = (theta: number) => (d ? theta + 90 : side === 1 ? theta : theta + 180)
    if (afterCorner) {
      // köşe taşının ucuna uç uca, yeni satır ters yönde
      const rowY = cornerEndY + v * (g + 0.5)
      if (d) {
        out.push({ x: cornerX, y: rowY, rot: rotFor(angleOf(0, v)) })
        cx = cornerX - h * 1
      } else {
        out.push({ x: cornerX - h * 0.5, y: rowY, rot: rotFor(angleOf(-h, 0)) })
        cx = cornerX - h * 1.5
      }
      y = rowY
      h = -h
      afterCorner = false
      continue
    }
    const L = d ? 1 : 2
    const end = cx + h * (g + L)
    const reserve = 1 + g // köşe taşı için ayrılan sütun
    if (h * end <= X - reserve || d) {
      // satırda. Çift taş her zaman satırda kalır (köşe olmaz): ayrılan sütuna sığar, en kötü durumda 1u taşar
      out.push({ x: cx + h * (g + L / 2), y, rot: rotFor(angleOf(h, 0)) })
      cx = end
    } else {
      // köşe: dikey taş, ilk yarısı son ucun yanında, satır değiştirme yönüne uzanır
      const ccx = cx + h * (g + 0.5)
      out.push({ x: ccx, y: y + v * 0.5, rot: rotFor(angleOf(0, v)) })
      cornerX = ccx
      cornerEndY = y + v * 1.5
      afterCorner = true
    }
  }
  return out
}

/**
 * board: soldan sağa yönlü taşlar (backend biçimi). anchor: açılış taşının board içindeki indeksi
 * (= sola eklenen taş sayısı). X: yatay yarı genişlik sınırı (u).
 */
export function snakeLayout(board: Tile[], anchor: number, X: number, g = GAP): Place[] {
  const n = board.length
  if (n === 0) return []
  const k = Math.max(0, Math.min(n - 1, anchor))
  const out: Place[] = new Array(n)
  const open = board[k]
  const half = isDouble(open) ? 0.5 : 1
  out[k] = { x: 0, y: 0, rot: isDouble(open) ? 90 : 0 }
  const right = chain(board.slice(k + 1), 1, half, X, g)
  right.forEach((p, i) => (out[k + 1 + i] = p))
  const left = chain(board.slice(0, k).reverse(), -1, -half, X, g)
  left.forEach((p, i) => (out[k - 1 - i] = p))
  return out
}

export interface BBox {
  minX: number
  maxX: number
  minY: number
  maxY: number
}

export function bbox(places: Place[]): BBox {
  const b: BBox = { minX: 0, maxX: 0, minY: 0, maxY: 0 }
  for (const p of places) {
    const [hx, hy] = halfExtent(p)
    b.minX = Math.min(b.minX, p.x - hx)
    b.maxX = Math.max(b.maxX, p.x + hx)
    b.minY = Math.min(b.minY, p.y - hy)
    b.maxY = Math.max(b.maxY, p.y + hy)
  }
  return b
}

/** İki taşın dikdörtgenleri çakışıyor mu (kenar teması çakışma sayılmaz). */
export function overlaps(a: Place, b: Place, eps = 1e-6): boolean {
  const [ax, ay] = halfExtent(a)
  const [bx, by] = halfExtent(b)
  return Math.abs(a.x - b.x) < ax + bx - eps && Math.abs(a.y - b.y) < ay + by - eps
}

/** Masa alanı W×H piksel için taş birimi: her iki yana `perSide` taş eklenince de alana sığan en büyük u. */
export function fitUnit(W: number, H: number, maxU: number, minU = 12, perSide = 13): { u: number; X: number } {
  const probe: Tile[] = []
  for (let i = 0; i < perSide * 2 + 1; i++) probe.push([1, 2])
  for (let u = Math.floor(maxU); u >= minU; u--) {
    const X = Math.max(2.5, W / (2 * u) - OVERFLOW)
    const b = bbox(snakeLayout(probe, perSide, X))
    if (b.maxX - b.minX <= W / u + 1e-9 && Math.max(b.maxY, -b.minY) * 2 <= H / u + 1e-9) return { u, X }
  }
  return { u: minU, X: Math.max(2.5, W / (2 * minU) - OVERFLOW) }
}

/** Uca bakan yeni taşın yerleşimi (sürükleme hedefi): tahtaya eklenmiş gibi dizilir, mevcut taşlar oynamaz. */
export function ghostPlace(board: Tile[], anchor: number, X: number, tile: Tile, toLeft: boolean, leftVal: number, rightVal: number): Place {
  if (board.length === 0) return snakeLayout([tile], 0, X)[0]
  if (toLeft) {
    const t: Tile = tile[1] === leftVal ? [tile[0], tile[1]] : [tile[1], tile[0]]
    return snakeLayout([t, ...board], anchor + 1, X)[0]
  }
  const t: Tile = tile[0] === rightVal ? [tile[0], tile[1]] : [tile[1], tile[0]]
  const all = snakeLayout([...board, t], anchor, X)
  return all[all.length - 1]
}

/**
 * Açılış indeksini önceki tahtadan çıkar: önceki tahta yenisinin bitişik bir alt dizisidir (taşlar tekil),
 * öndeki kayma kadar sola eklenmiştir. Bulunamazsa null.
 */
export function inferAnchor(prevBoard: Tile[], prevAnchor: number, board: Tile[]): number | null {
  if (board.length === 0) return 0
  if (prevBoard.length === 0) return board.length === 1 ? 0 : null
  const key = (t: Tile) => `${t[0]},${t[1]}`
  const first = key(prevBoard[0])
  const off = board.findIndex((t) => key(t) === first)
  if (off < 0 || off + prevBoard.length > board.length) return null
  for (let i = 0; i < prevBoard.length; i++) if (key(board[off + i]) !== key(prevBoard[i])) return null
  return prevAnchor + off
}
