// Uygulama durumu: sunucu mesajlarından saf indirgeme (reduce). Ekran yalnız bu modelden çizilir (render.ts).

import { inferAnchor } from './layout'
import type { GameOverMsg, GameStateMsg, MatchPublic, MoveDict, ServerMsg, Tile } from './protocol'
import { tileId } from './protocol'

export type Screen = 'lobby' | 'waiting' | 'game'

export interface LastAction {
  player: number
  kind: 'tile' | 'pass'
  tile?: string // tileId
  seq: number
}

export interface Model {
  screen: Screen
  me: number
  names: Record<number, string> // koltuk → insan adı
  board: Tile[]
  anchor: number
  hand: Tile[] // sunucunun son gönderdiği el (tahtadakiler render'da düşülür)
  handSizes: number[]
  current: number
  legal: MoveDict[]
  ends: [number, number]
  match: MatchPublic | null
  roundOver: GameOverMsg | null
  last: LastAction | null
  seq: number
  thinking: number | null
  notice: string | null
  noticeSeq: number
  partnerAway: boolean
  /** iyimser hamle: sunucu onaylayana kadar önceki durum (hata gelirse geri dönülür) */
  pending: { move: MoveDict; snapshot: Model } | null
  roomId: string | null
}

export function initialModel(): Model {
  return {
    screen: 'lobby', me: 0, names: {}, board: [], anchor: 0, hand: [], handSizes: [7, 7, 7, 7], current: -1,
    legal: [], ends: [-1, -1], match: null, roundOver: null, last: null, seq: 0, thinking: null,
    notice: null, noticeSeq: 0, partnerAway: false, pending: null, roomId: null,
  }
}

const sameTile = (a: Tile, b: Tile) => tileId(a) === tileId(b)

function withBoard(m: Model, board: Tile[]): Model {
  if (board.length <= 1) return { ...m, board, anchor: 0 }
  const a = inferAnchor(m.board, m.anchor, board)
  return { ...m, board, anchor: a ?? Math.floor(board.length / 2) }
}

function noted(m: Model, text: string): Model {
  return { ...m, notice: text, noticeSeq: m.noticeSeq + 1 }
}

/** Tahtaya iyimser olarak taş ekle (sunucunun motoru ile aynı yönlendirme). */
export function applyLocal(board: Tile[], mv: MoveDict): Tile[] {
  if (mv.is_pass) return board
  const [a, b] = mv.tile
  if (board.length === 0) return [[a, b]]
  if (mv.to_left) {
    const lv = board[0][0]
    return [b === lv ? [a, b] : [b, a], ...board]
  }
  const rv = board[board.length - 1][1]
  return [...board, a === rv ? [a, b] : [b, a]]
}

export function reduce(m: Model, msg: ServerMsg): Model {
  switch (msg.type) {
    case 'joined':
      return {
        ...m,
        roomId: msg.room_id,
        me: msg.slot === 1 ? 2 : 0,
        screen: msg.resumed ? m.screen === 'lobby' ? (msg.waiting ? 'waiting' : 'game') : m.screen : 'waiting',
        ...(msg.resumed ? {} : { board: [], anchor: 0, roundOver: null, match: null, last: null }),
        pending: null,
      }
    case 'room_full':
      return noted(m, 'Oda doldu, oyun başlıyor')
    case 'game_started': {
      const names: Record<number, string> = {}
      for (const [slot, n] of Object.entries(msg.players ?? {})) names[Number(slot) === 1 ? 2 : 0] = n
      return noted({ ...m, screen: 'game', names, board: [], anchor: 0, roundOver: null, last: null, thinking: null, pending: null },
        msg.message)
    }
    case 'game_state': {
      const s: GameStateMsg = msg
      const names: Record<number, string> = {}
      for (const [slot, n] of Object.entries(s.players ?? {})) names[Number(slot) === 1 ? 2 : 0] = n
      const base = withBoard({ ...m, screen: 'game' }, s.board)
      return {
        ...base,
        me: s.your_index,
        names,
        hand: s.your_hand,
        handSizes: s.hand_sizes,
        current: s.current_player,
        legal: s.is_your_turn ? s.legal_moves : [],
        ends: [s.left_val, s.right_val],
        match: s.match,
        thinking: s.is_game_over ? null : m.thinking === s.current_player ? m.thinking : null,
        roundOver: s.is_game_over ? m.roundOver : null,
        pending: null,
      }
    }
    case 'agent_move':
    case 'human_move': {
      // kendi iyimser hamlemizin onayı: tahta zaten aynı
      const seq = m.seq + 1
      const sizes = [...m.handSizes]
      if (!msg.move.is_pass) sizes[msg.player] = Math.max(0, sizes[msg.player] - 1)
      const mine = msg.player === m.me && m.pending !== null
      const base = withBoard(m, msg.board)
      return {
        ...base,
        handSizes: mine ? m.handSizes : sizes,
        thinking: null,
        legal: msg.player === m.me ? [] : m.legal,
        current: (msg.player + 1) % 4,
        last: { player: msg.player, kind: msg.move.is_pass ? 'pass' : 'tile', tile: msg.move.is_pass ? undefined : tileId(msg.move.tile), seq },
        seq,
        pending: mine ? null : m.pending,
      }
    }
    case 'agent_thinking':
      return { ...m, thinking: msg.player, current: msg.player }
    case 'game_over':
      return { ...m, roundOver: msg, match: msg.match, legal: [], thinking: null, pending: null }
    case 'player_left':
      return noted({ ...m, partnerAway: true }, msg.message)
    case 'player_back':
      return noted({ ...m, partnerAway: false }, msg.message)
    case 'error':
      // iyimser hamle reddedildi: önceki duruma dön
      return noted(m.pending ? { ...m.pending.snapshot, noticeSeq: m.noticeSeq } : m, msg.message)
    case 'pong':
      return m
  }
  return m
}

/** Kendi hamlemizi hemen uygula (sunucu cevabını beklemeden), reddedilirse `error` ile geri alınır. */
export function playLocal(m: Model, mv: MoveDict): Model {
  const seq = m.seq + 1
  const sizes = [...m.handSizes]
  if (!mv.is_pass) sizes[m.me] = Math.max(0, sizes[m.me] - 1)
  const base = withBoard(m, applyLocal(m.board, mv))
  return {
    ...base,
    hand: mv.is_pass ? m.hand : m.hand.filter((t) => !sameTile(t, mv.tile)),
    handSizes: sizes,
    legal: [],
    current: (m.me + 1) % 4,
    last: { player: m.me, kind: mv.is_pass ? 'pass' : 'tile', tile: mv.is_pass ? undefined : tileId(mv.tile), seq },
    seq,
    pending: { move: mv, snapshot: m },
  }
}

/** Ekranda gösterilecek el: tahtaya geçmiş taşlar düşülür (hamle mesajı durumdan önce gelir). */
export function visibleHand(m: Model): Tile[] {
  const onBoard = new Set(m.board.map(tileId))
  return m.hand.filter((t) => !onBoard.has(tileId(t)))
}

/**
 * Bir taşın oynanabileceği uçlar. D-18: uçlar eşitken sunucu tek kanonik hamle (sol) verir; sol ve sağ oyun
 * açısından aynı hamlenin iki fiziksel yerleşimidir ve sunucu aynalı sağı da kabul edip gerçekten sağa koyar.
 * İnsan masada istediği uca koyabilsin diye burada aynalı sağ seçenek de sunulur.
 */
export function optionsFor(m: Model, t: Tile): MoveDict[] {
  const opts = m.legal.filter((mv) => !mv.is_pass && sameTile(mv.tile, t))
  const [lv, rv] = m.ends
  if (m.board.length > 0 && lv === rv && opts.length === 1 && opts[0].to_left)
    opts.push({ ...opts[0], to_left: false })
  return opts
}

export const mustPass = (m: Model) => m.legal.length > 0 && m.legal.every((mv) => mv.is_pass)
