// Ekran geometrisi: pencere boyutundan koltuk, masa alanı ve el yerleri (piksel). Saf fonksiyon.

import { fitUnit } from './layout'

export interface Pt { x: number; y: number }
export interface Rect { x: number; y: number; w: number; h: number }

export interface Geometry {
  vw: number
  vh: number
  portrait: boolean
  u: number // masa taşı birimi (px)
  X: number // dizilim yarı genişliği (u)
  vertical: boolean // dizilimin ana ekseni dikey (dar/uzun masa alanında daha büyük taş verir)
  board: Rect // masa alanı
  origin: Pt // açılış taşının merkezi (px)
  uHand: number
  handY: number // el taşlarının merkez y'si
  handGap: number
  seats: Record<1 | 2 | 3, Pt> // göreli koltuk (1 = sonraki oyuncu, solda; 2 = partner, üstte; 3 = sağda)
  safeTop: number
  safeBottom: number
}

export function computeGeometry(vw: number, vh: number, safeTop = 0, safeBottom = 0): Geometry {
  const portrait = vh > vw * 1.05
  const handGap = portrait ? 6 : 10
  const uHand = Math.round(Math.max(24, Math.min(46, (vw - 32 - 6 * handGap) / 7, (vh - safeTop - safeBottom) * 0.075)))
  const handY = vh - safeBottom - 16 - uHand
  const handTop = handY - uHand - 14
  let board: Rect
  let seats: Record<1 | 2 | 3, Pt>
  if (portrait) {
    const top = safeTop + 140
    seats = {
      1: { x: 40, y: safeTop + 96 },
      2: { x: vw / 2, y: safeTop + 84 },
      3: { x: vw - 40, y: safeTop + 96 },
    }
    board = { x: 10, y: top, w: vw - 20, h: Math.max(120, handTop - 34 - top) }
  } else {
    const side = Math.min(120, Math.max(84, vw * 0.09))
    const top = safeTop + 118
    seats = {
      1: { x: side / 2 + 6, y: (top + handTop) / 2 },
      2: { x: vw / 2, y: safeTop + 60 },
      3: { x: vw - side / 2 - 6, y: (top + handTop) / 2 },
    }
    board = { x: side + 8, y: top, w: vw - 2 * (side + 8), h: Math.max(120, handTop - 30 - top) }
  }
  // yılanın ana ekseni: hangi yön daha büyük taş veriyorsa (dikey telefonda genelde dikey)
  const maxU = Math.min(44, uHand * 0.95)
  const hz = fitUnit(board.w, board.h, maxU, 10)
  const vt = fitUnit(board.h, board.w, maxU, 10)
  // taş boyu üst sınırda eşitse uzun kenar boyunca diz (satırlar uzun, daha az dönüş)
  const vertical = vt.u > hz.u + 1 || (vt.u >= hz.u && board.h > board.w * 1.15)
  const { u, X } = vertical ? vt : hz
  return {
    vw, vh, portrait, u, X, vertical, board,
    origin: { x: board.x + board.w / 2, y: board.y + board.h / 2 },
    uHand, handY, handGap, seats, safeTop, safeBottom,
  }
}

/** El taşlarının merkezleri (dikey taşlar, ortalanmış sıra). */
export function handSlots(g: Geometry, n: number): Pt[] {
  const w = g.uHand
  // 2 kişilikte bazardan çekişle el 19 taşa çıkabilir: sığmazsa taşlar üst üste biner (adım küçülür)
  const step = n > 1 ? Math.min(w + g.handGap, (g.vw - 16 - w) / (n - 1)) : 0
  const total = w + Math.max(0, n - 1) * step
  const x0 = g.vw / 2 - total / 2 + w / 2
  return Array.from({ length: n }, (_, i) => ({ x: x0 + i * step, y: g.handY }))
}

/** Ekrandaki göreli koltuk. 2 kişilikte rakip karşıda (2). */
export const relSeat = (player: number, me: number, players = 4): 0 | 1 | 2 | 3 =>
  players === 2 ? (player === me ? 0 : 2) : ((((player - me) % 4) + 4) % 4 as 0 | 1 | 2 | 3)
