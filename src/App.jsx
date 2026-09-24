import { useState, useRef, useCallback, useEffect } from "react";

const WS_URL = import.meta.env.VITE_WS_URL || "ws://localhost:8000/ws";

const C = {
  bg:       "#0f1a0f",
  felt:     "#1a5c32",
  feltEdge: "#143d22",
  wood:     "#4a2810",
  gold:     "#d4a843",
  text:     "#f0ece0",
  muted:    "#7a8070",
  green:    "#4ade80",
  red:      "#f87171",
  yellow:   "#fbbf24",
  agent:    "#c084fc",
  human:    "#34d399",
  tile:     "#f8f3e3",
  tileBot:  "#ede5c8",
  tileEdge: "#c4aa7a",
  dot:      "#1c1208",
};

// Nokta pozisyonları — daha geniş aralıklı
const PIPS = {
  0: [],
  1: [[50,50]],
  2: [[32,32],[68,68]],
  3: [[32,32],[50,50],[68,68]],
  4: [[32,32],[68,32],[32,68],[68,68]],
  5: [[32,32],[68,32],[50,50],[32,68],[68,68]],
  6: [[32,24],[68,24],[32,50],[68,50],[32,76],[68,76]],
};

// Tek yarı SVG
function Half({ n, size }) {
  const r = size * 0.09; // nokta yarıçapı — boyuta göre ölçeklenir
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" style={{ display:"block", flexShrink:0 }}>
      <rect x="2" y="2" width="96" height="96" rx="6"
        fill={`url(#tileGrad)`} />
      {(PIPS[n]||[]).map(([x,y],i) => (
        <circle key={i} cx={x} cy={y} r={r*100/size}
          fill={C.dot}
          style={{ filter:"drop-shadow(0 1px 1px rgba(0,0,0,0.4))" }}
        />
      ))}
      <defs>
        <radialGradient id="tileGrad" cx="40%" cy="30%">
          <stop offset="0%" stopColor="#fffbf0" />
          <stop offset="100%" stopColor={C.tileBot} />
        </radialGradient>
      </defs>
    </svg>
  );
}

// Masa taşı
function BoardTile({ tile, sz, isNew }) {
  const [a,b]    = tile;
  const isDouble = a === b;
  const [show, setShow] = useState(!isNew);

  useEffect(() => {
    if (isNew) requestAnimationFrame(() => requestAnimationFrame(() => setShow(true)));
  }, []);

  const style = {
    display:      "flex",
    alignItems:   "center",
    background:   `linear-gradient(160deg, ${C.tile}, ${C.tileBot})`,
    border:       `1.5px solid ${C.tileEdge}`,
    borderRadius:  Math.max(3, sz*0.12),
    boxShadow:    "0 3px 8px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.6)",
    flexShrink:   0,
    overflow:     "hidden",
    transition:   isNew ? "opacity 0.3s, transform 0.3s cubic-bezier(0.34,1.5,0.64,1)" : "none",
    opacity:      show ? 1 : 0,
    transform:    show ? "scale(1)" : "scale(0.4)",
  };

  const div = {
    background:  C.tileEdge,
    flexShrink:  0,
    boxShadow:   "1px 0 2px rgba(0,0,0,0.2), -1px 0 1px rgba(255,255,255,0.3)",
  };

  if (isDouble) return (
    <div style={{ ...style, flexDirection:"column", margin:"0 1px" }}>
      <Half n={a} size={sz} />
      <div style={{ ...div, width:"100%", height:2 }} />
      <Half n={b} size={sz} />
    </div>
  );

  return (
    <div style={{ ...style, flexDirection:"row", margin:"0 1px" }}>
      <Half n={a} size={sz} />
      <div style={{ ...div, height:"80%", width:2 }} />
      <Half n={b} size={sz} />
    </div>
  );
}

// El taşı — gerçek zamanlı sürükleme
function HandTile({ tile, disabled, legal, sendMove, addMsg, boardRef }) {
  const [a,b] = tile;
  const sz    = 56; // el taşları büyük
  const ref   = useRef(null);
  const ghost = useRef(null);
  const drag  = useRef({ active:false, ox:0, oy:0 });

  const isPlayable = !disabled && legal.some(m =>
    !m.is_pass && ((m.tile[0]===a&&m.tile[1]===b)||(m.tile[0]===b&&m.tile[1]===a))
  );

  // Pointer events — en akıcı yöntem
  const onPointerDown = (e) => {
    if (!isPlayable) return;
    e.preventDefault();
    ref.current.setPointerCapture(e.pointerId);

    const rect  = ref.current.getBoundingClientRect();
    drag.current = { active:false, ox: e.clientX - rect.left, oy: e.clientY - rect.top };

    // Ghost elementi oluştur
    const g = document.createElement("div");
    g.style.cssText = `
      position:fixed; pointer-events:none; z-index:9999;
      display:flex; flex-direction:column; align-items:center;
      background:linear-gradient(160deg,#fffbf0,${C.tileBot});
      border:2px solid ${C.green}; border-radius:8px; padding:4px;
      box-shadow:0 12px 40px rgba(0,0,0,0.7),0 0 0 3px rgba(74,222,128,0.3);
      transform:none;
      will-change:left,top;
      transition:opacity 0.15s;
      width:${sz*2+8}px;
      left:${e.clientX - drag.current.ox - 4}px;
      top:${e.clientY - drag.current.oy - 4}px;
    `;
    // SVG'leri klonla
    const svgs = ref.current.querySelectorAll("svg");
    const divider = document.createElement("div");
    divider.style.cssText = `width:${sz*2-4}px;height:2px;background:${C.tileEdge};margin:2px 0`;
    if (svgs[0]) g.appendChild(svgs[0].cloneNode(true));
    g.appendChild(divider);
    if (svgs[1]) g.appendChild(svgs[1].cloneNode(true));
    document.body.appendChild(g);
    ghost.current = g;
  };

  const rafId = useRef(null);
  const lastPos = useRef({ x:0, y:0 });

  const onPointerMove = (e) => {
    if (!ghost.current) return;
    e.preventDefault();

    if (!drag.current.active) {
      const dx = e.movementX, dy = e.movementY;
      if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
        drag.current.active = true;
        ref.current.style.opacity = "0.3";
      }
    }

    if (drag.current.active) {
      lastPos.current = { x: e.clientX, y: e.clientY };

      // rAF ile GPU-accelerated pozisyon güncelle
      if (rafId.current) cancelAnimationFrame(rafId.current);
      rafId.current = requestAnimationFrame(() => {
        if (!ghost.current) return;
        const { x, y } = lastPos.current;
        ghost.current.style.left = `${x - drag.current.ox - 4}px`;
        ghost.current.style.top  = `${y - drag.current.oy - 4}px`;

        const board = boardRef?.current;
        if (board) {
          const r    = board.getBoundingClientRect();
          const over = x>=r.left && x<=r.right && y>=r.top && y<=r.bottom;
          ghost.current.style.borderColor = over ? C.green : C.tileEdge;
          ghost.current.style.outline     = over ? `2px solid rgba(74,222,128,0.4)` : "none";
        }
      });
    }
  };

  const onPointerUp = (e) => {
    if (!ghost.current) return;

    // Ghost'u temizle
    ghost.current.style.opacity = "0";
    setTimeout(() => { ghost.current?.remove(); ghost.current = null; }, 150);
    ref.current.style.opacity = "";

    if (!drag.current.active) return;
    drag.current.active = false;

    // Masaya düştü mü?
    const board = boardRef?.current;
    if (!board) return;
    const r = board.getBoundingClientRect();
    const inBoard = e.clientX>=r.left && e.clientX<=r.right && e.clientY>=r.top && e.clientY<=r.bottom;
    if (!inBoard) return;

    const toLeft = e.clientX < r.left + r.width / 2;
    const move = legal.find(m =>
      !m.is_pass &&
      ((m.tile[0]===a&&m.tile[1]===b)||(m.tile[0]===b&&m.tile[1]===a)) &&
      m.to_left === toLeft
    ) || legal.find(m =>
      !m.is_pass &&
      ((m.tile[0]===a&&m.tile[1]===b)||(m.tile[0]===b&&m.tile[1]===a))
    );

    if (move) sendMove(move);
    else addMsg("Bu taş bu tarafa oynanamaz.", C.red);
  };

  return (
    <div
      ref={ref}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      style={{
        display:      "flex",
        flexDirection:"column",
        alignItems:   "center",
        background:   isPlayable
          ? `linear-gradient(160deg, #fffbf0, ${C.tileBot})`
          : "linear-gradient(160deg, #2a2520, #1a1510)",
        border:       `1.5px solid ${isPlayable ? C.tileEdge : "#3a3530"}`,
        borderRadius:  8,
        padding:       4,
        margin:        "0 3px",
        cursor:        isPlayable ? "grab" : "not-allowed",
        userSelect:    "none",
        touchAction:   "none",
        opacity:       isPlayable ? 1 : 0.4,
        boxShadow:     isPlayable
          ? "0 4px 14px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.5)"
          : "none",
        transition:    "box-shadow 0.2s",
        flexShrink:    0,
      }}
    >
      <Half n={a} size={sz} />
      <div style={{
        width:sz-6, height:2,
        background: isPlayable ? C.tileEdge : "#3a3530",
        margin:"2px 0", borderRadius:1,
        boxShadow:"inset 0 1px 0 rgba(255,255,255,0.2)",
      }} />
      <Half n={b} size={sz} />
    </div>
  );
}

// Kapalı taş
function ClosedTile({ horiz=true }) {
  return (
    <div style={{
      width:  horiz ? 36 : 18,
      height: horiz ? 18 : 36,
      background:  "linear-gradient(135deg, #2d1f10, #1a1008)",
      border:      "1px solid #4a3020",
      borderRadius: 3,
      margin:       2,
      boxShadow:   "0 2px 6px rgba(0,0,0,0.5)",
      flexShrink:   0,
    }} />
  );
}

// Oyuncu paneli
function PlayerPanel({ name, handSize, isAgent, isTurn, horiz=true, missing }) {
  const color = isAgent ? C.agent : C.human;
  return (
    <div style={{
      display:      "flex",
      flexDirection: horiz ? "column" : "row",
      alignItems:   "center",
      gap:           6,
      padding:      "8px 12px",
      background:    isTurn ? `rgba(${isAgent?"192,132,252":"52,211,153"},0.12)` : "rgba(0,0,0,0.45)",
      border:       `1.5px solid ${isTurn ? color : "rgba(255,255,255,0.07)"}`,
      borderRadius:  12,
      backdropFilter:"blur(10px)",
      transition:   "all 0.3s",
      boxShadow:     isTurn ? `0 0 18px ${color}33` : "none",
    }}>
      <div style={{ fontSize:20 }}>{isAgent ? "🤖" : "👤"}</div>
      <div style={{ textAlign:"center" }}>
        <div style={{ color, fontWeight:700, fontSize:12, whiteSpace:"nowrap" }}>{name}</div>
        <div style={{ color:C.muted, fontSize:10 }}>{handSize} taş</div>
        {isTurn && <div style={{ color, fontSize:9, marginTop:1 }}>● sıra</div>}
        {missing?.length>0 && <div style={{ color:C.red, fontSize:9 }}>✗{missing.join(",")}</div>}
      </div>
      <div style={{
        display:"flex", flexDirection: horiz?"row":"column",
        flexWrap:"wrap", gap:2,
        maxWidth: horiz?140:22, maxHeight: horiz?22:140,
        justifyContent:"center",
      }}>
        {Array.from({length:Math.min(handSize,7)}).map((_,i)=>(
          <ClosedTile key={i} horiz={horiz} />
        ))}
      </div>
    </div>
  );
}

// Masa — tam genişlik, taşlar sığmazsa küçülür
function BoardArea({ board, boardRef }) {
  const containerRef = useRef(null);
  const [tileSize, setTileSize] = useState(22);

  useEffect(() => {
    const update = () => {
      if (!containerRef.current) return;
      const w     = containerRef.current.clientWidth - 16;
      const h     = containerRef.current.clientHeight - 40;
      const count = board.length;
      if (count === 0) { setTileSize(22); return; }
      // Genişliğe göre hesapla: normal taş sz*2 geniş, çift sz geniş
      // Ortalama ~1.6x genişlik
      const byWidth  = Math.floor(w / (count * 1.65));
      // Yüksekliğe göre: taş yüksekliği sz*2
      const byHeight = Math.floor(h / 2.2);
      const sz = Math.max(12, Math.min(24, Math.min(byWidth, byHeight)));
      setTileSize(sz);
    };
    update();
    const obs = new ResizeObserver(update);
    if (containerRef.current) obs.observe(containerRef.current);
    return () => obs.disconnect();
  }, [board.length]);

  return (
    <div ref={containerRef} style={{ width:"100%", flex:1, display:"flex", alignItems:"center", justifyContent:"center", overflow:"hidden" }}>
      <div
        ref={boardRef}
        style={{
          display:        "flex",
          alignItems:     "center",
          justifyContent: "center",
          flexWrap:       "nowrap",
          gap:             1,
          padding:        "6px",
          width:          "100%",
          minHeight:       tileSize*2 + 16,
        }}
      >
        {board.length === 0
          ? <span style={{ color:"rgba(255,255,255,0.2)", fontSize:13, fontStyle:"italic" }}>
              Oyun (1|1) ile açıldı
            </span>
          : board.map((t,i) => (
              <BoardTile key={`${i}-${t[0]}-${t[1]}`} tile={t} sz={tileSize} isNew={i===board.length-1} />
            ))
        }
      </div>
    </div>
  );
}

// ── ANA UYGULAMA ─────────────────────────────────────────
export default function App() {
  const [phase,     setPhase]   = useState("lobby");
  const [name,      setName]    = useState("");
  const [roomId,    setRoomId]  = useState("");
  const [slot,      setSlot]    = useState(null);
  const [game,      setGame]    = useState(null);
  const [messages,  setMsgs]    = useState([]);
  const [agentThink,setThink]   = useState(false);
  const [result,    setResult]  = useState(null);
  const [players,   setPlayers] = useState({});
  const ws       = useRef(null);
  const boardRef = useRef(null);

  const addMsg = (text, color=C.text) =>
    setMsgs(p => [...p.slice(-15), { text, color, id:Date.now()+Math.random() }]);

  const connect = useCallback(() => {
    if (!name.trim()) return;
    const s = new WebSocket(`${WS_URL}/${encodeURIComponent(name.trim())}`);
    ws.current = s;
    s.onopen    = () => addMsg("Bağlandı", C.green);
    s.onerror   = () => addMsg("Bağlantı hatası!", C.red);
    s.onclose   = () => addMsg("Bağlantı kesildi.", C.muted);
    s.onmessage = (ev) => {
      const msg = JSON.parse(ev.data);
      if      (msg.type==="joined")         { setRoomId(msg.room_id); setSlot(msg.slot); setPhase("waiting"); addMsg(msg.message, C.yellow); }
      else if (msg.type==="room_full")      { addMsg(msg.message, C.green); if(msg.players) setPlayers(msg.players); }
      else if (msg.type==="game_started")   { setPhase("playing"); if(msg.players) setPlayers(msg.players); }
      else if (msg.type==="game_state")     { setGame(msg); setThink(false); if(msg.is_game_over) setPhase("gameover"); }
      else if (msg.type==="agent_thinking") { setThink(true); }
      else if (msg.type==="agent_move")     { setThink(false); const m=msg.move; addMsg(`🤖 P${msg.player+1}: ${m.is_pass?"PAS":`(${m.tile[0]}|${m.tile[1]})`}`, C.agent); }
      else if (msg.type==="human_move")     { addMsg(`👤 ${msg.name}: ${msg.move.is_pass?"PAS":`(${msg.move.tile[0]}|${msg.move.tile[1]})`}`, C.human); }
      else if (msg.type==="game_over")      { setResult(msg); setPhase("gameover"); }
      else if (msg.type==="error")          { addMsg(`⚠ ${msg.message}`, C.red); }
      else if (msg.type==="player_left")    { addMsg(msg.message, C.red); }
    };
  }, [name]);

  const sendMove = (move) => {
    if (ws.current?.readyState===WebSocket.OPEN)
      ws.current.send(JSON.stringify({ type:"move", ...move }));
  };

  const myIndex      = slot===0 ? 0 : 2;
  const partnerIndex = slot===0 ? 2 : 0;
  const myName       = players[slot]     || name || "Sen";
  const partnerName  = players[1-slot]   || "Arkadaşın";

  const getMissing = (pi) => {
    if (!game) return [];
    return (game.missing_numbers?.[pi]||[]).map((v,i)=>v?i:null).filter(v=>v!==null);
  };

  const st = { fontFamily:"'Segoe UI',system-ui,sans-serif", color:C.text };

  // Tam ekran için body margin sıfırla
  useEffect(() => {
    document.body.style.margin  = "0";
    document.body.style.padding = "0";
    document.body.style.overflow= "hidden";
    document.documentElement.style.height = "100%";
    document.body.style.height  = "100%";
  }, []);

  // ── Lobi
  if (phase==="lobby") return (
    <div style={{ ...st, minHeight:"100vh",
      background:"radial-gradient(ellipse at center, #1a3a1a 0%, #0a0f0a 100%)",
      display:"flex", alignItems:"center", justifyContent:"center" }}>
      <div style={{ background:"rgba(0,0,0,0.7)", backdropFilter:"blur(20px)",
        padding:48, borderRadius:20, minWidth:320,
        border:"1px solid rgba(212,168,67,0.3)",
        boxShadow:"0 24px 80px rgba(0,0,0,0.8)" }}>
        <div style={{ textAlign:"center", marginBottom:32 }}>
          <div style={{ fontSize:52, marginBottom:10 }}>🁣</div>
          <h1 style={{ color:C.gold, margin:0, fontSize:28, fontWeight:800 }}>Domino AI</h1>
          <p style={{ color:C.muted, margin:"8px 0 0", fontSize:13 }}>2 İnsan (Takım A) vs 2 Agent (Takım B)</p>
        </div>
        <input value={name} onChange={e=>setName(e.target.value)}
          onKeyDown={e=>e.key==="Enter"&&connect()}
          placeholder="Adını gir..."
          style={{ width:"100%", padding:"13px 16px", borderRadius:10,
            background:"rgba(255,255,255,0.07)", border:"1px solid rgba(255,255,255,0.12)",
            color:C.text, fontSize:16, boxSizing:"border-box", marginBottom:16, outline:"none" }}
        />
        <button onClick={connect} disabled={!name.trim()} style={{
          width:"100%", padding:14, borderRadius:10,
          background: name.trim() ? `linear-gradient(135deg,${C.gold},#a07a28)` : "#2a2a2a",
          color:"#fff", border:"none", fontSize:16, cursor:name.trim()?"pointer":"default",
          fontWeight:700, boxShadow: name.trim()?"0 4px 20px rgba(212,168,67,0.4)":"none",
          transition:"all 0.2s",
        }}>Oyuna Gir</button>
      </div>
    </div>
  );

  // ── Bekleme
  if (phase==="waiting") return (
    <div style={{ ...st, minHeight:"100vh",
      background:"radial-gradient(ellipse at center, #1a3a1a 0%, #0a0f0a 100%)",
      display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", gap:20 }}>
      <div style={{ fontSize:56 }}>⏳</div>
      <h2 style={{ color:C.gold, margin:0 }}>
        Oda: <span style={{ fontFamily:"monospace", letterSpacing:4 }}>{roomId}</span>
      </h2>
      <p style={{ color:C.muted }}>2. oyuncu bekleniyor...</p>
      <p style={{ color:C.green, fontSize:13 }}>Oda kodunu arkadaşınla paylaş</p>
    </div>
  );

  // ── Oyun
  if (phase==="playing" || phase==="gameover") {
    const g        = game;
    const myHand   = g?.your_hand || [];
    const legal    = g?.legal_moves || [];
    const isMyTurn = g?.is_your_turn && !agentThink;
    const hs       = g?.hand_sizes || [7,7,7,7];
    const cur      = g?.current_player ?? -1;
    const mustPass = legal.length===1 && legal[0].is_pass;

    return (
      <div style={{ ...st, height:"100dvh", width:"100vw", overflow:"hidden",
        background:"radial-gradient(ellipse at 50% 30%, #1a3a1a 0%, #080f08 100%)",
        display:"flex", flexDirection:"column" }}>

        {/* Üst bar */}
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center",
          padding:"7px 16px", background:"rgba(0,0,0,0.6)", backdropFilter:"blur(10px)",
          borderBottom:"1px solid rgba(212,168,67,0.15)", flexShrink:0 }}>
          <span style={{ color:C.gold, fontWeight:800, fontSize:17 }}>🁣 Domino AI</span>
          <div style={{ display:"flex", gap:8 }}>
            {[0,1].map(t => (
              <div key={t} style={{ padding:"4px 12px", borderRadius:8,
                background:`rgba(${t===0?"52,211,153":"192,132,252"},0.12)`,
                border:`1px solid rgba(${t===0?"52,211,153":"192,132,252"},0.35)` }}>
                <span style={{ color:t===0?C.human:C.agent, fontSize:11, fontWeight:700 }}>
                  {t===0?"Takım A":"Takım B"}
                </span>
                <span style={{ color:C.text, marginLeft:8, fontWeight:800, fontSize:15 }}>
                  {g?.team_scores?.[t]??0}
                </span>
              </div>
            ))}
          </div>
          <span style={{ color:C.muted, fontSize:10 }}>Oda: {roomId}</span>
        </div>

        {/* Grid */}
        <div style={{ flex:1, display:"grid", minHeight:0,
          gridTemplateRows:"auto 1fr auto",
          gridTemplateColumns:"auto 1fr auto",
          gap:8, padding:8 }}>

          {/* Üst — Arkadaş */}
          <div style={{ gridColumn:"2", gridRow:"1", display:"flex", justifyContent:"center" }}>
            <PlayerPanel name={partnerName} handSize={hs[partnerIndex]}
              isAgent={false} isTurn={cur===partnerIndex} horiz={true}
              missing={getMissing(partnerIndex)} />
          </div>

          {/* Sol — Agent P2 */}
          <div style={{ gridColumn:"1", gridRow:"2", display:"flex", alignItems:"center" }}>
            <PlayerPanel name="P2" handSize={hs[1]}
              isAgent={true} isTurn={cur===1} horiz={false}
              missing={getMissing(1)} />
          </div>

          {/* Masa */}
          <div style={{ gridColumn:"2", gridRow:"2", display:"flex", flexDirection:"column",
            alignItems:"center", justifyContent:"center",
            background:`radial-gradient(ellipse at 50% 40%, ${C.felt} 50%, ${C.feltEdge} 100%)`,
            borderRadius:20,
            border:`5px solid ${C.wood}`,
            boxShadow:"0 0 0 7px #2a1408, 0 20px 60px rgba(0,0,0,0.8), inset 0 2px 30px rgba(0,0,0,0.3)",
            overflow:"hidden", position:"relative", minHeight:0,
            display:"flex", flexDirection:"column",
          }}>

            {/* Masa iç parlaklık */}
            <div style={{ position:"absolute", inset:0, pointerEvents:"none",
              background:"radial-gradient(ellipse at 50% 20%, rgba(255,255,255,0.04) 0%, transparent 60%)" }} />

            {agentThink && (
              <div style={{ position:"absolute", top:8, left:"50%", transform:"translateX(-50%)",
                background:"rgba(0,0,0,0.75)", backdropFilter:"blur(8px)",
                border:`1px solid ${C.agent}44`,
                padding:"3px 12px", borderRadius:20, zIndex:10,
                color:C.agent, fontSize:11, fontWeight:600, whiteSpace:"nowrap" }}>
                ⏳ Düşünüyor...
              </div>
            )}

            <BoardArea board={g?.board||[]} boardRef={boardRef} />

            {g?.board?.length>0 && (
              <div style={{ fontSize:11, color:"rgba(255,255,255,0.4)", marginBottom:4 }}>
                Sol: <b style={{ color:C.yellow }}>{g.left_val}</b>
                {" — "}
                Sağ: <b style={{ color:C.yellow }}>{g.right_val}</b>
              </div>
            )}

            {/* Mesaj logu */}
            <div style={{ position:"absolute", bottom:4, left:8, right:8,
              display:"flex", flexDirection:"column", alignItems:"center", gap:1, pointerEvents:"none" }}>
              {messages.slice(-3).map(m => (
                <div key={m.id} style={{ fontSize:10, color:m.color,
                  textShadow:"0 1px 4px rgba(0,0,0,0.9)", fontWeight:500 }}>
                  {m.text}
                </div>
              ))}
            </div>
          </div>

          {/* Sağ — Agent P4 */}
          <div style={{ gridColumn:"3", gridRow:"2", display:"flex", alignItems:"center" }}>
            <PlayerPanel name="P4" handSize={hs[3]}
              isAgent={true} isTurn={cur===3} horiz={false}
              missing={getMissing(3)} />
          </div>

          {/* Alt — Ben */}
          <div style={{ gridColumn:"2", gridRow:"3", display:"flex", flexDirection:"column", alignItems:"center", gap:5 }}>
            <div style={{ display:"flex", alignItems:"center", gap:8 }}>
              <span style={{ color:C.human, fontWeight:700, fontSize:13 }}>👤 {myName}</span>
              {isMyTurn && (
                <span style={{ color:C.green, fontSize:11,
                  background:"rgba(74,222,128,0.12)", padding:"2px 10px",
                  borderRadius:20, border:"1px solid rgba(74,222,128,0.3)", fontWeight:600 }}>
                  Sıran — masaya sürükle
                </span>
              )}
            </div>

            <div style={{ display:"flex", flexWrap:"wrap", justifyContent:"center", gap:5,
              padding:"10px 14px",
              background:"rgba(0,0,0,0.55)", backdropFilter:"blur(8px)",
              borderRadius:14,
              border:`2px solid ${isMyTurn?"rgba(74,222,128,0.35)":"rgba(255,255,255,0.07)"}`,
              boxShadow: isMyTurn?"0 0 24px rgba(74,222,128,0.12)":"none",
              transition:"all 0.3s",
            }}>
              {myHand.map((tile,i) => {
                const [a,b] = tile;
                const playable = legal.some(m=>!m.is_pass&&
                  ((m.tile[0]===a&&m.tile[1]===b)||(m.tile[0]===b&&m.tile[1]===a)));
                return (
                  <HandTile key={i} tile={tile}
                    disabled={!isMyTurn||!playable}
                    legal={legal} sendMove={sendMove}
                    addMsg={addMsg} boardRef={boardRef}
                  />
                );
              })}
              {mustPass && isMyTurn && (
                <button onClick={()=>sendMove(legal[0])} style={{
                  padding:"10px 22px", borderRadius:10,
                  background:"linear-gradient(135deg,#ef4444,#b91c1c)",
                  color:"#fff", border:"none", cursor:"pointer",
                  fontSize:14, fontWeight:700, alignSelf:"center",
                  boxShadow:"0 4px 12px rgba(239,68,68,0.4)",
                }}>PAS GEÇ</button>
              )}
            </div>
          </div>
        </div>

        {/* Oyun sonu */}
        {phase==="gameover" && result && (
          <div style={{ position:"fixed", inset:0,
            background:"rgba(0,0,0,0.88)", backdropFilter:"blur(10px)",
            display:"flex", alignItems:"center", justifyContent:"center", zIndex:100 }}>
            <div style={{ background:"rgba(10,15,10,0.97)", padding:48, borderRadius:20,
              textAlign:"center", minWidth:320,
              border:`1px solid ${C.gold}44`,
              boxShadow:"0 24px 80px rgba(0,0,0,0.9)" }}>
              <div style={{ fontSize:52, marginBottom:8 }}>
                {result.team_a_score<result.team_b_score?"🏆":result.team_b_score<result.team_a_score?"😔":"🤝"}
              </div>
              <h2 style={{ color:C.gold, margin:"0 0 8px", fontSize:26 }}>Oyun Bitti!</h2>
              <p style={{ color:C.green, fontSize:16, margin:"0 0 24px" }}>{result.winner}</p>
              <div style={{ display:"flex", gap:24, justifyContent:"center", marginBottom:28 }}>
                {[{l:"Takım A (Siz)",s:result.team_a_score,c:C.human},
                  {l:"Takım B (Agent)",s:result.team_b_score,c:C.agent}].map((t,i)=>(
                  <div key={i}>
                    <div style={{ color:t.c, fontSize:11, marginBottom:4 }}>{t.l}</div>
                    <div style={{ color:C.text, fontSize:40, fontWeight:800 }}>{t.s}</div>
                  </div>
                ))}
              </div>
              <button onClick={()=>{
                if(ws.current?.readyState===WebSocket.OPEN)
                  ws.current.send(JSON.stringify({type:"rematch"}));
                setResult(null); setPhase("playing");
              }} style={{ padding:"13px 36px", borderRadius:10,
                background:`linear-gradient(135deg,${C.gold},#a07828)`,
                color:"#fff", border:"none", cursor:"pointer",
                fontSize:15, fontWeight:700,
                boxShadow:"0 4px 20px rgba(212,168,67,0.4)",
              }}>Tekrar Oyna</button>
            </div>
          </div>
        )}
      </div>
    );
  }

  return null;
}