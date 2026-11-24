import { describe, expect, it } from 'vitest'
import { computeGeometry, handSlots, relSeat } from '../src/geometry'
import { applyLocal, initialModel, optionsFor, playLocal, reduce, visibleHand, type Model } from '../src/model'
import type { GameStateMsg, MoveDict, Tile } from '../src/protocol'

function state(over: Partial<GameStateMsg> = {}): GameStateMsg {
  return {
    type: 'game_state', board: [], your_hand: [[1, 1], [2, 5], [0, 3]], your_index: 0, current_player: 0,
    is_your_turn: true, legal_moves: [{ tile: [1, 1], to_left: false, is_pass: false }], left_val: -1, right_val: -1,
    hand_sizes: [3, 7, 7, 7], pass_count: 0, is_game_over: false, team_scores: [0, 0], players: { 0: 'A', 1: 'B' },
    missing_numbers: [], match: { score: [0, 0], pending: [0, 0], unlocked: [false, false], round_no: 1, target: 101 },
    ...over,
  }
}

describe('model', () => {
  it('M-1 iyimser hamle hemen uygulanır, sunucu hatasında önceki duruma dönülür', () => {
    let m: Model = reduce(initialModel(), state())
    const mv: MoveDict = { tile: [1, 1], to_left: false, is_pass: false }
    m = playLocal(m, mv)
    expect(m.board).toEqual([[1, 1]])
    expect(visibleHand(m).length).toBe(2)
    expect(m.legal).toEqual([])
    m = reduce(m, { type: 'error', message: 'Yasadışı hamle!' })
    expect(m.board).toEqual([])
    expect(visibleHand(m).length).toBe(3)
    expect(m.legal.length).toBe(1)
    expect(m.notice).toBe('Yasadışı hamle!')
  })
  it('M-2 hamle mesajı durumdan önce gelince taş elde ve masada aynı anda görünmez', () => {
    let m = reduce(initialModel(), state())
    m = reduce(m, { type: 'human_move', player: 0, move: { tile: [1, 1], to_left: false, is_pass: false }, board: [[1, 1]] })
    expect(visibleHand(m).map((t) => t.join())).toEqual(['2,5', '0,3'])
  })
  it('M-3 açılış indeksi sola eklemelerle ilerler, atlanan hamlelerden sonra da bulunur', () => {
    let m = reduce(initialModel(), state({ board: [[1, 1]] }))
    const mv = (b: Tile[]) => reduce(m, { type: 'agent_move', player: 1, move: { tile: [0, 1], to_left: true, is_pass: false }, board: b })
    m = mv([[0, 1], [1, 1]])
    expect(m.anchor).toBe(1)
    m = reduce(m, state({ board: [[3, 0], [0, 1], [1, 1], [1, 4]] }))
    expect(m.anchor).toBe(2)
  })
  it('M-4 bot hamlesinde el sayısı düşer, pas düşürmez; tur sonunda yasal hamle kalmaz', () => {
    let m = reduce(initialModel(), state({ is_your_turn: false, legal_moves: [], current_player: 1, board: [[1, 1]] }))
    m = reduce(m, { type: 'agent_move', player: 1, move: { tile: [0, 0], to_left: false, is_pass: true }, board: [[1, 1]] })
    expect(m.handSizes[1]).toBe(7)
    expect(m.last?.kind).toBe('pass')
    m = reduce(m, { type: 'agent_move', player: 2, move: { tile: [1, 6], to_left: false, is_pass: false }, board: [[1, 1], [1, 6]] })
    expect(m.handSizes[2]).toBe(6)
  })
  it('M-5 eşit uçlarda sunucu tek kanonik (sol) hamle verir, arayüz aynalı sağı da sunar (D-18)', () => {
    const m = reduce(initialModel(), state({ board: [[3, 3]], left_val: 3, right_val: 3, legal_moves: [{ tile: [3, 5], to_left: true, is_pass: false }], your_hand: [[3, 5]] }))
    expect(optionsFor(m, [5, 3]).map((x) => x.to_left)).toEqual([true, false])
    // uçlar farklıysa yalnız sunucunun verdiği
    const d = reduce(initialModel(), state({ board: [[3, 4]], left_val: 3, right_val: 4, legal_moves: [{ tile: [3, 5], to_left: true, is_pass: false }], your_hand: [[3, 5]] }))
    expect(optionsFor(d, [3, 5]).length).toBe(1)
    // aynalı sağ yerleşim tahtayı gerçekten sağa uzatır
    const r = playLocal(m, { tile: [3, 5], to_left: false, is_pass: false })
    expect(r.board).toEqual([[3, 3], [3, 5]])
  })
  it('M-6 applyLocal sunucunun yönlendirmesiyle aynı', () => {
    expect(applyLocal([[1, 2]], { tile: [1, 5], to_left: true, is_pass: false })).toEqual([[5, 1], [1, 2]])
    expect(applyLocal([[1, 2]], { tile: [5, 2], to_left: false, is_pass: false })).toEqual([[1, 2], [2, 5]])
  })
  it('M-7 yeniden bağlanma: joined(resumed) masayı silmez, yeni oda siler', () => {
    let m = reduce(initialModel(), state({ board: [[1, 1]] }))
    m = reduce(m, { type: 'joined', room_id: 'r', slot: 0, token: 't', resumed: true, message: '', waiting: false })
    expect(m.board.length).toBe(1)
    expect(m.screen).toBe('game')
    m = reduce(m, { type: 'joined', room_id: 'x', slot: 0, token: 't2', resumed: false, message: '', waiting: true })
    expect(m.board.length).toBe(0)
    expect(m.screen).toBe('waiting')
  })
})

describe('geometry', () => {
  it('G-1 el 7 taşla ekrana sığar, koltuklar göreli', () => {
    for (const [w, h] of [[360, 640], [390, 844], [844, 390], [1280, 720], [1920, 1080]]) {
      const g = computeGeometry(w, h)
      const s = handSlots(g, 7)
      expect(s[0].x - g.uHand / 2).toBeGreaterThanOrEqual(0)
      expect(s[6].x + g.uHand / 2).toBeLessThanOrEqual(w)
      expect(g.handY + g.uHand).toBeLessThanOrEqual(h)
      expect(g.u).toBeGreaterThanOrEqual(10)
    }
    expect(relSeat(3, 0)).toBe(3)
    expect(relSeat(0, 2)).toBe(2)
    expect(relSeat(3, 2)).toBe(1)
  })
  it('G-2 dikey telefonda yılan dikey eksende (daha büyük taş), yatay ekranda yatay', () => {
    const p = computeGeometry(390, 844)
    const l = computeGeometry(1280, 720)
    expect(p.vertical).toBe(true)
    expect(l.vertical).toBe(false)
  })
})
