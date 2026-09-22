import { useState, useRef, useCallback, useEffect } from "react";

const WS_URL = import.meta.env.VITE_WS_URL || "wss://domino-ai-backend.onrender.com/ws";

// ── Renk Paleti ───────────────────────────────────────────
const C = {
  bg:       "#1a0f0a",
  wood:     "#3d1f0d",
  woodDark: "#2a1508",
  felt:     "#1e5c38",
  feltDark: "#174d2f",
  gold:     "#c9a84c",
  text:     "#f0e6d3",
  muted:    "#8a7a6a",
  green:    "#4ade80",
  red:      "#f87171",
  yellow:   "#fbbf24",
  agent:    "#a78bfa",
  human:    "#34d399",
  tile:     "#f5f0e0",
  tileDark: "#e8e0c8",
  tileEdge: "#c8b89a",
  dot:      "#1a1008",
};

// ── Nokta pozisyonları ────────────────────────────────────
const DOT_POS = {
  0: [],
  1: [[50,50]],
  2: [[30,30],[70,70]],
  3: [[30,30],[50,50],[70,70]],
  4: [[30,30],[70,30],[30,70],[70,70]],
  5: [[30,30],[70,30],[50,50],[30,70],[70,70]],
  6: [[30,22],[70,22],[30,50],[70,50],[30,78],[70,78]],
};

// ── Nokta SVG ─────────────────────────────────────────────
function Pips({ n, size, color = C.dot }) {
  const r = Math.max(4, size * 0.085);
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" style={{ display:"block" }}>
      {(DOT_POS[n]||[]).map(([x,y],i) => (
        <circle key={i} cx={x} cy={y} r={r*100/size} fill={color}
          style={{ filter:`drop-shadow(0 1px 1px rgba(0,0,0,0.3))` }}
        />
      ))}
    </svg>
  );
}

// ── Gerçekçi Domino Taşı (masa için) ─────────────────────
function BoardTile({ tile, sz = 22, isNew = false }) {
  const [a, b]   = tile;
  const isDouble = a === b;
  const [show, setShow] = useState(!isNew);

  useEffect(() => {
    if (isNew) {
      const t = setTimeout(() => setShow(true), 20);
      return () => clearTimeout(t);
    }
  }, [isNew]);

  const tileStyle = {
    background:   `linear-gradient(135deg, ${C.tile} 0%, ${C.tileDark} 100%)`,
    borderRadius:  Math.max(2, sz * 0.1),
    boxShadow:    `0 ${sz*0.1}px ${sz*0.2}px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.4)`,
    border:       `1px solid ${C.tileEdge}`,
    padding:       Math.max(1, sz * 0.06),
    flexShrink:    0,
    transition:    isNew ? "all 0.35s cubic-bezier(0.34,1.4,0.64,1)" : "none",
    opacity:       show ? 1 : 0,
    transform:     show ? "scale(1)" : "scale(0.5) translateY(-20px)",
  };

  const divider = {
    background:   C.tileEdge,
    flexShrink:    0,
  };

  if (isDouble) return (
    <div style={{ ...tileStyle, display:"flex", flexDirection:"column", alignItems:"center", margin:"0 1px" }}>
      <Pips n={a} size={sz} />
      <div style={{ ...divider, width:sz*0.8, height:1, margin:`${sz*0.04}px 0` }} />
      <Pips n={b} size={sz} />
    </div>
  );

  return (
    <div style={{ ...tileStyle, display:"flex", flexDirection:"row", alignItems:"center", margin:"0 1px" }}>
      <Pips n={a} size={sz} />
      <div style={{ ...divider, height:sz*0.8, width:1, margin:`0 ${sz*0.04}px` }} />
      <Pips n={b} size={sz} />
    </div>
  );
}

// ── Gerçekçi El Taşı (sürüklenebilir) ────────────────────
function HandTile({ tile, disabled, legal, sendMove, addMsg, boardRef }) {
  const [a, b]  = tile;
  const sz      = 54;
  const ref     = useRef(null);
  const [dragging, setDragging] = useState(false);
  const [flying,   setFlying]   = useState(false);
  const [pos,      setPos]      = useState({ x:0, y:0 });
  const startPos   = useRef(null);
  const isDragging = useRef(false);

  const isPlayable = !disabled && legal.some(m =>
    !m.is_pass && ((m.tile[0]===a&&m.tile[1]===b)||(m.tile[0]===b&&m.tile[1]===a))
  );

  const tryMove = (clientX, clientY) => {
    const board = boardRef?.current;
    if (!board) return false;
    const rect = board.getBoundingClientRect();
    const inBoard = clientX >= rect.left && clientX <= rect.right &&
                    clientY >= rect.top  && clientY <= rect.bottom;
    if (!inBoard) return false;

    const toLeft = clientX < rect.left + rect.width / 2;
    const move = legal.find(m =>
      !m.is_pass &&
      ((m.tile[0]===a&&m.tile[1]===b)||(m.tile[0]===b&&m.tile[1]===a)) &&
      m.to_left === toLeft
    ) || legal.find(m =>
      !m.is_pass &&
      ((m.tile[0]===a&&m.tile[1]===b)||(m.tile[0]===b&&m.tile[1]===a))
    );

    if (move) {
      const tx = rect.left + rect.width  / 2 - sz/2;
      const ty = rect.top  + rect.height / 2 - sz/2;
      setPos({ x: tx, y: ty });
      setFlying(true);
      setTimeout(() => { setDragging(false); setFlying(false); sendMove(move); }, 280);
      return true;
    }
    return false;
  };

  const onMouseDown = (e) => {
    if (!isPlayable) return;
    e.preventDefault();
    const rect = ref.current.getBoundingClientRect();
    startPos.current = { x: e.clientX, y: e.clientY, ox: e.clientX - rect.left, oy: e.clientY - rect.top };
    isDragging.current = false;

    const onMove = (ev) => {
      const dx = ev.clientX - startPos.current.x;
      const dy = ev.clientY - startPos.current.y;
      if (!isDragging.current && Math.sqrt(dx*dx+dy*dy) > 6) {
        isDragging.current = true;
        setDragging(true);
      }
      if (isDragging.current) {
        setPos({ x: ev.clientX - startPos.current.ox, y: ev.clientY - startPos.current.oy });
      }
    };

    const onUp = (ev) => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      isDragging.current = false;
      if (!dragging && Math.sqrt((ev.clientX-startPos.current.x)**2+(ev.clientY-startPos.current.y)**2) < 6) {
        setDragging(false);
        return;
      }
      if (!tryMove(ev.clientX, ev.clientY)) {
        setDragging(false);
        if (flying) { setFlying(false); }
      }
    };

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  const onTouchStart = (e) => {
    if (!isPlayable) return;
    const touch = e.touches[0];
    const rect  = ref.current.getBoundingClientRect();
    startPos.current = { x: touch.clientX, y: touch.clientY, ox: touch.clientX - rect.left, oy: touch.clientY - rect.top };
    isDragging.current = false;

    const onMove = (ev) => {
      ev.preventDefault();
      const t = ev.touches[0];
      const dx = t.clientX - startPos.current.x;
      const dy = t.clientY - startPos.current.y;
      if (!isDragging.current && Math.sqrt(dx*dx+dy*dy) > 6) {
        isDragging.current = true;
        setDragging(true);
      }
      if (isDragging.current) {
        setPos({ x: t.clientX - startPos.current.ox, y: t.clientY - startPos.current.oy });
      }
    };

    const onEnd = (ev) => {
      window.removeEventListener("touchmove", onMove);
      window.removeEventListener("touchend", onEnd);
      isDragging.current = false;
      const t = ev.changedTouches[0];
      if (!tryMove(t.clientX, t.clientY)) {
        setDragging(false);
      }
    };

    window.addEventListener("touchmove", onMove, { passive: false });
    window.addEventListener("touchend", onEnd);
  };

  const tileBase = {
    display:      "flex",
    flexDirection:"column",
    alignItems:   "center",
    background:   isPlayable
      ? `linear-gradient(145deg, #faf5e4 0%, ${C.tile} 40%, ${C.tileDark} 100%)`
      : `linear-gradient(145deg, #3a3530 0%, #2a2520 100%)`,
    border:       `1px solid ${isPlayable ? C.tileEdge : "#555"}`,
    borderRadius:  8,
    padding:       5,
    cursor:        isPlayable ? "grab" : "not-allowed",
    userSelect:   "none",
    touchAction:  "none",
    transition:   "box-shadow 0.15s, transform 0.1s",
  };

  return (
    <>
      {/* Orijinal yer */}
      <div
        ref={ref}
        onMouseDown={onMouseDown}
        onTouchStart={onTouchStart}
        style={{
          ...tileBase,
          opacity:   dragging ? 0 : (isPlayable ? 1 : 0.4),
          boxShadow: isPlayable && !dragging
            ? "0 4px 12px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.5)"
            : "none",
          transform: isPlayable && !dragging ? "translateY(0)" : "translateY(2px)",
          margin:    "0 3px",
        }}
      >
        <Pips n={a} size={sz} color={isPlayable ? C.dot : "#666"} />
        <div style={{ width:sz-8, height:2, background: isPlayable ? C.tileEdge : "#444", margin:"3px 0",
          borderRadius:1, boxShadow:"inset 0 1px 0 rgba(255,255,255,0.2)" }} />
        <Pips n={b} size={sz} color={isPlayable ? C.dot : "#666"} />
      </div>

      {/* Sürüklenen kopya */}
      {dragging && (
        <div style={{
          position:    "fixed",
          left:         pos.x,
          top:          pos.y,
          zIndex:       9999,
          pointerEvents:"none",
          ...tileBase,
          opacity:      flying ? 0 : 1,
          transform:    flying
            ? "scale(0.5) rotate(10deg)"
            : "scale(1.12) rotate(-2deg)",
          boxShadow:    flying
            ? "none"
            : "0 16px 40px rgba(0,0,0,0.7), 0 0 0 2px rgba(74,222,128,0.5), inset 0 1px 0 rgba(255,255,255,0.5)",
          transition:   flying ? "all 0.28s cubic-bezier(0.4,0,0.2,1)" : "none",
        }}>
          <Pips n={a} size={sz} />
          <div style={{ width:sz-8, height:2, background:C.tileEdge, margin:"3px 0", borderRadius:1 }} />
          <Pips n={b} size={sz} />
        </div>
      )}
    </>
  );
}

// ── Kapalı Taş (diğer oyuncular için) ────────────────────
function ClosedTile({ horizontal = true }) {
  const w = horizontal ? 38 : 19;
  const h = horizontal ? 19 : 38;
  return (
    <div style={{
      width:h, height:w,
      background:   "linear-gradient(135deg, #2d1f10 0%, #1a1008 100%)",
      border:       "1px solid #4a3520",
      borderRadius:  3,
      margin:        2,
      boxShadow:    "0 2px 6px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.1)",
      flexShrink:    0,
    }} />
  );
}

// ── Masa Alanı ────────────────────────────────────────────
function BoardArea({ board, boardRef }) {
  const count    = board.length;
  const tileSize = Math.max(16, Math.min(26, 26 - Math.max(0, count - 6) * 0.7));

  return (
    <div
      ref={boardRef}
      style={{
        width:"100%", minHeight:70,
        display:"flex", alignItems:"center", justifyContent:"center",
        flexWrap:"nowrap", gap:1, padding:"6px 4px",
      }}
    >
      {count === 0
        ? <span style={{ color:"rgba(255,255,255,0.2)", fontSize:14, fontStyle:"italic" }}>
            (1|1) ile açıldı
          </span>
        : board.map((t, i) => (
            <BoardTile key={`${i}-${t[0]}-${t[1]}`} tile={t} sz={tileSize} isNew={i === count-1} />
          ))
      }
    </div>
  );
}

// ── Oyuncu Paneli ─────────────────────────────────────────
function PlayerPanel({ name, handSize, isAgent, isTurn, position, missing }) {
  const isH  = position === "top" || position === "bottom";
  const color = isAgent ? C.agent : C.human;

  return (
    <div style={{
      display:       "flex",
      flexDirection: isH ? "column" : "row",
      alignItems:    "center",
      gap:            6,
      padding:       "8px 12px",
      background:    isTurn ? `rgba(${isAgent?"167,139,250":"52,211,153"},0.15)` : "rgba(0,0,0,0.4)",
      border:        `1.5px solid ${isTurn ? color : "rgba(255,255,255,0.08)"}`,
      borderRadius:   12,
      backdropFilter:"blur(8px)",
      transition:    "all 0.3s",
      boxShadow:     isTurn ? `0 0 20px ${color}44` : "none",
    }}>
      <div style={{ fontSize:22 }}>{isAgent ? "🤖" : "👤"}</div>
      <div style={{ textAlign:"center" }}>
        <div style={{ color, fontWeight:700, fontSize:13, whiteSpace:"nowrap" }}>{name}</div>
        <div style={{ color:C.muted, fontSize:11 }}>{handSize} taş</div>
        {isTurn && <div style={{ color, fontSize:10, marginTop:2, fontWeight:600 }}>● sıra</div>}
        {missing?.length > 0 && (
          <div style={{ color:C.red, fontSize:10, marginTop:1 }}>✗{missing.join(",")}</div>
        )}
      </div>
      <div style={{
        display:       "flex",
        flexDirection: isH ? "row" : "column",
        flexWrap:      "wrap",
        gap:            2,
        maxWidth:       isH ? 160 : 24,
        maxHeight:      isH ? 24 : 160,
        justifyContent:"center",
      }}>
        {Array.from({ length: Math.min(handSize, 7) }).map((_,i) => (
          <ClosedTile key={i} horizontal={isH} />
        ))}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// ANA UYGULAMA
// ═══════════════════════════════════════════════════════════
export default function App() {
  const [phase,    setPhase]   = useState("lobby");
  const [name,     setName]    = useState("");
  const [roomId,   setRoomId]  = useState("");
  const [slot,     setSlot]    = useState(null);
  const [game,     setGame]    = useState(null);
  const [messages, setMsgs]    = useState([]);
  const [agentThink,setThink]  = useState(false);
  const [result,   setResult]  = useState(null);
  const [players,  setPlayers] = useState({});
  const ws       = useRef(null);
  const boardRef = useRef(null);

  const addMsg = (text, color = C.text) =>
    setMsgs(prev => [...prev.slice(-20), { text, color, id: Date.now()+Math.random() }]);

  const connect = useCallback(() => {
    if (!name.trim()) return;
    const s = new WebSocket(`${WS_URL}/${encodeURIComponent(name.trim())}`);
    ws.current = s;
    s.onopen    = () => addMsg("Bağlandı", C.green);
    s.onerror   = () => addMsg("Bağlantı hatası!", C.red);
    s.onclose   = () => addMsg("Bağlantı kesildi.", C.muted);
    s.onmessage = (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.type === "joined") {
        setRoomId(msg.room_id); setSlot(msg.slot); setPhase("waiting");
        addMsg(msg.message, C.yellow);
      }
      else if (msg.type === "room_full")    { addMsg(msg.message, C.green); if(msg.players) setPlayers(msg.players); }
      else if (msg.type === "game_started") { setPhase("playing"); addMsg(msg.message, C.green); if(msg.players) setPlayers(msg.players); }
      else if (msg.type === "game_state")   { setGame(msg); setThink(false); if(msg.is_game_over) setPhase("gameover"); }
      else if (msg.type === "agent_thinking") { setThink(true); }
      else if (msg.type === "agent_move")   { setThink(false); const m=msg.move; addMsg(`🤖 P${msg.player+1}: ${m.is_pass?"PAS":`(${m.tile[0]}|${m.tile[1]})`}`, C.agent); }
      else if (msg.type === "human_move")   { addMsg(`👤 ${msg.name}: ${msg.move.is_pass?"PAS":`(${msg.move.tile[0]}|${msg.move.tile[1]})`}`, C.human); }
      else if (msg.type === "game_over")    { setResult(msg); setPhase("gameover"); }
      else if (msg.type === "error")        { addMsg(`⚠ ${msg.message}`, C.red); }
      else if (msg.type === "player_left")  { addMsg(msg.message, C.red); }
    };
  }, [name]);

  const sendMove = (move) => {
    if (ws.current?.readyState === WebSocket.OPEN)
      ws.current.send(JSON.stringify({ type:"move", ...move }));
  };

  const myIndex      = slot === 0 ? 0 : 2;
  const partnerIndex = slot === 0 ? 2 : 0;
  const myName       = players[slot]     || name || "Sen";
  const partnerName  = players[1 - slot] || "Arkadaşın";

  const getMissing = (pi) => {
    if (!game) return [];
    return (game.missing_numbers?.[pi] || []).map((v,i)=>v?i:null).filter(v=>v!==null);
  };

  const s = { fontFamily:"'Segoe UI',system-ui,sans-serif", color:C.text };

  // ── Lobi ─────────────────────────────────────────────────
  if (phase === "lobby") return (
    <div style={{ ...s, minHeight:"100vh", background:`radial-gradient(ellipse at center, #2a1508 0%, ${C.bg} 70%)`,
      display:"flex", alignItems:"center", justifyContent:"center" }}>
      <div style={{ background:"rgba(0,0,0,0.6)", backdropFilter:"blur(20px)",
        padding:48, borderRadius:20, minWidth:340,
        border:"1px solid rgba(201,168,76,0.3)",
        boxShadow:"0 24px 80px rgba(0,0,0,0.8)" }}>
        <div style={{ textAlign:"center", marginBottom:32 }}>
          <div style={{ fontSize:48, marginBottom:8 }}>🁣</div>
          <h1 style={{ color:C.gold, margin:0, fontSize:28, fontWeight:700, letterSpacing:1 }}>Domino AI</h1>
          <p style={{ color:C.muted, margin:"8px 0 0", fontSize:13 }}>2 İnsan vs 2 Agent</p>
        </div>
        <input value={name} onChange={e=>setName(e.target.value)}
          onKeyDown={e=>e.key==="Enter"&&connect()}
          placeholder="Adını gir..."
          style={{ width:"100%", padding:"12px 16px", borderRadius:10,
            background:"rgba(255,255,255,0.08)", border:"1px solid rgba(255,255,255,0.15)",
            color:C.text, fontSize:16, boxSizing:"border-box", marginBottom:16, outline:"none" }} />
        <button onClick={connect} disabled={!name.trim()} style={{
          width:"100%", padding:14, borderRadius:10,
          background: name.trim() ? `linear-gradient(135deg, ${C.gold}, #a07830)` : "#333",
          color:"#fff", border:"none", fontSize:16, cursor:"pointer",
          fontWeight:700, letterSpacing:0.5,
          boxShadow: name.trim() ? "0 4px 20px rgba(201,168,76,0.4)" : "none",
          transition:"all 0.2s",
        }}>Oyuna Gir</button>
      </div>
    </div>
  );

  // ── Bekleme ───────────────────────────────────────────────
  if (phase === "waiting") return (
    <div style={{ ...s, minHeight:"100vh", background:`radial-gradient(ellipse at center, #2a1508 0%, ${C.bg} 70%)`,
      display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", gap:20 }}>
      <div style={{ fontSize:56 }}>⏳</div>
      <h2 style={{ color:C.gold, margin:0 }}>Oda: <span style={{ fontFamily:"monospace", letterSpacing:4 }}>{roomId}</span></h2>
      <p style={{ color:C.muted }}>2. oyuncu bekleniyor...</p>
      <p style={{ color:C.green, fontSize:13 }}>Bu kodu arkadaşınla paylaş</p>
    </div>
  );

  // ── Oyun ─────────────────────────────────────────────────
  if (phase === "playing" || phase === "gameover") {
    const g        = game;
    const myHand   = g?.your_hand || [];
    const legal    = g?.legal_moves || [];
    const isMyTurn = g?.is_your_turn && !agentThink;
    const hs       = g?.hand_sizes || [7,7,7,7];
    const cur      = g?.current_player ?? -1;
    const mustPass = legal.length===1 && legal[0].is_pass;

    return (
      <div style={{ ...s, height:"100vh", overflow:"hidden",
        background:`radial-gradient(ellipse at center, #1a0a05 0%, ${C.bg} 100%)`,
        display:"flex", flexDirection:"column" }}>

        {/* Üst bar */}
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center",
          padding:"8px 16px", background:"rgba(0,0,0,0.5)", backdropFilter:"blur(10px)",
          borderBottom:"1px solid rgba(201,168,76,0.2)" }}>
          <span style={{ color:C.gold, fontWeight:700, fontSize:18 }}>🁣 Domino AI</span>
          <div style={{ display:"flex", gap:10 }}>
            {[0,1].map(team => (
              <div key={team} style={{ padding:"5px 14px", borderRadius:8,
                background:`rgba(${team===0?"52,211,153":"167,139,250"},0.15)`,
                border:`1px solid rgba(${team===0?"52,211,153":"167,139,250"},0.4)` }}>
                <span style={{ color: team===0 ? C.human : C.agent, fontSize:12, fontWeight:600 }}>
                  {team===0 ? "Takım A" : "Takım B"}
                </span>
                <span style={{ color:C.text, marginLeft:8, fontWeight:700, fontSize:16 }}>
                  {g?.team_scores?.[team]??0}
                </span>
              </div>
            ))}
          </div>
          <span style={{ color:C.muted, fontSize:11 }}>Oda: {roomId}</span>
        </div>

        {/* Ana alan - grid */}
        <div style={{ flex:1, display:"grid",
          gridTemplateRows:"auto 1fr auto",
          gridTemplateColumns:"auto 1fr auto",
          gap:10, padding:10, minHeight:0 }}>

          {/* Üst - Arkadaş */}
          <div style={{ gridColumn:"2", gridRow:"1", display:"flex", justifyContent:"center" }}>
            <PlayerPanel name={partnerName} handSize={hs[partnerIndex]}
              isAgent={false} isTurn={cur===partnerIndex} position="top"
              missing={getMissing(partnerIndex)} />
          </div>

          {/* Sol - Agent P2 */}
          <div style={{ gridColumn:"1", gridRow:"2", display:"flex", alignItems:"center" }}>
            <PlayerPanel name="Agent P2" handSize={hs[1]}
              isAgent={true} isTurn={cur===1} position="left"
              missing={getMissing(1)} />
          </div>

          {/* Masa */}
          <div style={{ gridColumn:"2", gridRow:"2", position:"relative",
            background:`radial-gradient(ellipse at center, ${C.felt} 60%, ${C.feltDark} 100%)`,
            borderRadius:24,
            border:`6px solid ${C.wood}`,
            outline:`2px solid ${C.woodDark}`,
            boxShadow:`
              0 0 0 8px ${C.woodDark},
              inset 0 2px 20px rgba(0,0,0,0.4),
              0 20px 60px rgba(0,0,0,0.8)
            `,
            display:"flex", flexDirection:"column",
            alignItems:"center", justifyContent:"center",
            overflow:"hidden", minHeight:0,
          }}>
            {/* Masa iç gölge efekti */}
            <div style={{ position:"absolute", inset:0, borderRadius:18,
              background:"radial-gradient(ellipse at 50% 0%, rgba(255,255,255,0.05) 0%, transparent 60%)",
              pointerEvents:"none" }} />

            {/* Agent düşünüyor göstergesi */}
            {agentThink && (
              <div style={{ position:"absolute", top:10, left:"50%", transform:"translateX(-50%)",
                background:"rgba(0,0,0,0.7)", backdropFilter:"blur(8px)",
                border:"1px solid rgba(167,139,250,0.4)",
                padding:"4px 14px", borderRadius:20, zIndex:10,
                color:C.agent, fontSize:12, fontWeight:600, whiteSpace:"nowrap" }}>
                ⏳ Agent düşünüyor...
              </div>
            )}

            {/* Masa taşları */}
            <BoardArea board={g?.board||[]} boardRef={boardRef} />

            {/* Sol/Sağ uç */}
            {g?.board?.length > 0 && (
              <div style={{ fontSize:12, color:"rgba(255,255,255,0.5)", marginTop:4 }}>
                Sol: <b style={{ color:C.yellow }}>{g.left_val}</b>
                &nbsp;—&nbsp;
                Sağ: <b style={{ color:C.yellow }}>{g.right_val}</b>
              </div>
            )}

            {/* Yön seçimi */}
            {(() => {
              if (!isMyTurn || !game) return null;
              return null; // Artık sürükle-bırak kullanıyoruz
            })()}

            {/* Log */}
            <div style={{ position:"absolute", bottom:6, left:8, right:8,
              maxHeight:56, overflowY:"auto", display:"flex", flexDirection:"column", gap:1 }}>
              {messages.slice(-4).map(m => (
                <div key={m.id} style={{ fontSize:10, color:m.color, textAlign:"center",
                  textShadow:"0 1px 3px rgba(0,0,0,0.8)" }}>{m.text}</div>
              ))}
            </div>
          </div>

          {/* Sağ - Agent P4 */}
          <div style={{ gridColumn:"3", gridRow:"2", display:"flex", alignItems:"center" }}>
            <PlayerPanel name="Agent P4" handSize={hs[3]}
              isAgent={true} isTurn={cur===3} position="right"
              missing={getMissing(3)} />
          </div>

          {/* Alt - Ben */}
          <div style={{ gridColumn:"2", gridRow:"3", display:"flex", flexDirection:"column", alignItems:"center", gap:6 }}>
            <div style={{ display:"flex", alignItems:"center", gap:10 }}>
              <span style={{ color:C.human, fontWeight:700 }}>👤 {myName}</span>
              {isMyTurn && (
                <span style={{ color:C.green, fontSize:12, fontWeight:600,
                  background:"rgba(74,222,128,0.15)", padding:"2px 10px", borderRadius:20,
                  border:"1px solid rgba(74,222,128,0.3)" }}>
                  Senin sıran — taşı masaya sürükle
                </span>
              )}
            </div>

            {/* El */}
            <div style={{ display:"flex", flexWrap:"wrap", justifyContent:"center", gap:4,
              padding:"10px 14px",
              background:"rgba(0,0,0,0.5)", backdropFilter:"blur(8px)",
              borderRadius:14,
              border:`2px solid ${isMyTurn ? "rgba(74,222,128,0.4)" : "rgba(255,255,255,0.08)"}`,
              boxShadow: isMyTurn ? "0 0 20px rgba(74,222,128,0.15)" : "none",
              transition:"all 0.3s",
            }}>
              {myHand.map((tile, i) => {
                const [a,b] = tile;
                const isPlayable = legal.some(m => !m.is_pass &&
                  ((m.tile[0]===a&&m.tile[1]===b)||(m.tile[0]===b&&m.tile[1]===a)));
                return (
                  <HandTile key={i} tile={tile}
                    disabled={!isMyTurn || !isPlayable}
                    legal={legal}
                    sendMove={sendMove}
                    addMsg={addMsg}
                    boardRef={boardRef}
                  />
                );
              })}
              {mustPass && isMyTurn && (
                <button onClick={() => sendMove(legal[0])} style={{
                  padding:"10px 24px", borderRadius:10,
                  background:"linear-gradient(135deg, #ef4444, #b91c1c)",
                  color:"#fff", border:"none", cursor:"pointer",
                  fontSize:15, fontWeight:700, alignSelf:"center",
                  boxShadow:"0 4px 12px rgba(239,68,68,0.4)",
                }}>PAS GEÇ</button>
              )}
            </div>
          </div>
        </div>

        {/* Oyun sonu */}
        {phase === "gameover" && result && (
          <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.85)", backdropFilter:"blur(8px)",
            display:"flex", alignItems:"center", justifyContent:"center", zIndex:100 }}>
            <div style={{ background:"rgba(20,10,5,0.95)", padding:48, borderRadius:20,
              textAlign:"center", minWidth:320,
              border:"1px solid rgba(201,168,76,0.4)",
              boxShadow:"0 24px 80px rgba(0,0,0,0.9)" }}>
              <div style={{ fontSize:48, marginBottom:8 }}>
                {result.team_a_score < result.team_b_score ? "🏆" : result.team_b_score < result.team_a_score ? "😔" : "🤝"}
              </div>
              <h2 style={{ color:C.gold, fontSize:26, margin:"0 0 8px" }}>Oyun Bitti!</h2>
              <p style={{ color:C.green, fontSize:17, margin:"0 0 24px" }}>{result.winner}</p>
              <div style={{ display:"flex", gap:24, justifyContent:"center", marginBottom:28 }}>
                {[{label:"Takım A (Siz)", score:result.team_a_score, color:C.human},
                  {label:"Takım B (Agent)", score:result.team_b_score, color:C.agent}].map((t,i) => (
                  <div key={i}>
                    <div style={{ color:t.color, fontSize:12, marginBottom:4 }}>{t.label}</div>
                    <div style={{ color:C.text, fontSize:38, fontWeight:700 }}>{t.score}</div>
                  </div>
                ))}
              </div>
              <button onClick={() => {
                if (ws.current?.readyState===WebSocket.OPEN)
                  ws.current.send(JSON.stringify({type:"rematch"}));
                setResult(null); setPhase("playing");
              }} style={{ padding:"13px 36px", borderRadius:10,
                background:`linear-gradient(135deg, ${C.gold}, #a07830)`,
                color:"#fff", border:"none", cursor:"pointer",
                fontSize:16, fontWeight:700,
                boxShadow:"0 4px 20px rgba(201,168,76,0.4)",
              }}>Tekrar Oyna</button>
            </div>
          </div>
        )}
      </div>
    );
  }

  return null;
}