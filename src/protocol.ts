// Backend mesaj protokolü (domino-ai-backend main.py / game.py, D-26, D-32). Yalnız genişletilir, alanlar değişmez.

export type Tile = [number, number]

export interface MoveDict {
  tile: Tile
  to_left: boolean
  is_pass: boolean
}

export interface MatchPublic {
  score: [number, number]
  pending: [number, number]
  unlocked: [boolean, boolean]
  round_no: number
  target: number
}

export interface GameStateMsg {
  type: 'game_state'
  board: Tile[]
  your_hand: Tile[]
  your_index: number
  current_player: number
  is_your_turn: boolean
  legal_moves: MoveDict[]
  left_val: number
  right_val: number
  hand_sizes: number[]
  pass_count: number
  is_game_over: boolean
  team_scores: [number, number]
  players: Record<string, string>
  missing_numbers: boolean[][]
  match: MatchPublic
}

export interface GameOverMsg {
  type: 'game_over'
  team_a_score: number
  team_b_score: number
  winner: string
  hands: Tile[][]
  reason: 'out' | 'blocked' | string
  round_winner_team: 0 | 1 | null
  match: MatchPublic
  match_winner: 0 | 1 | null
}

export interface MoveMsg {
  type: 'agent_move' | 'human_move'
  player: number
  name?: string
  move: MoveDict
  board: Tile[]
}

export type ServerMsg =
  | { type: 'joined'; room_id: string; slot: number; token?: string; resumed?: boolean; message: string; waiting: boolean }
  | { type: 'room_full'; message: string }
  | { type: 'game_started'; message: string; players: Record<string, string> }
  | GameStateMsg
  | GameOverMsg
  | MoveMsg
  | { type: 'agent_thinking'; player: number; message: string }
  | { type: 'player_left'; message: string; slot?: number; grace?: number }
  | { type: 'player_back'; message: string; slot: number }
  | { type: 'error'; message: string }
  | { type: 'pong' }

export type ClientMsg =
  | ({ type: 'move' } & MoveDict)
  | { type: 'rematch' }
  | { type: 'ping' }

/** Taş kimliği: yönden bağımsız, "küçük-büyük". */
export const tileId = (t: readonly number[]): string => (t[0] <= t[1] ? `${t[0]}-${t[1]}` : `${t[1]}-${t[0]}`)
export const isDouble = (t: readonly number[]): boolean => t[0] === t[1]
export const HUMAN_SEATS = [0, 2]
export const teamOf = (p: number): 0 | 1 => (p % 2 === 0 ? 0 : 1)
