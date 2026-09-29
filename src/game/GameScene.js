import Phaser from "phaser";

const ANIM_DUR = 220;

// Nokta pozisyonları — daha geniş aralıklı, net görünüm
const PIP_POS = {
  0: [],
  1: [[0.5,  0.5]],
  2: [[0.3,  0.3],  [0.7,  0.7]],
  3: [[0.3,  0.3],  [0.5,  0.5],  [0.7,  0.7]],
  4: [[0.3,  0.3],  [0.7,  0.3],  [0.3,  0.7],  [0.7,  0.7]],
  5: [[0.3,  0.3],  [0.7,  0.3],  [0.5,  0.5],  [0.3,  0.7],  [0.7,  0.7]],
  6: [[0.3,  0.2],  [0.7,  0.2],  [0.3,  0.5],  [0.7,  0.5],  [0.3,  0.8],  [0.7,  0.8]],
};

export class GameScene extends Phaser.Scene {
  constructor() {
    super({ key: "GameScene" });
  }

  init(data) {
    this.ws         = data.ws;
    this.myName     = data.name;
    this.slot       = data.slot;
    this.roomId     = data.roomId;
    this.players    = data.players || {};
    this.firstState = data.firstState || null;

    this.gameState     = null;
    this.myHand        = [];
    this.legalMoves    = [];
    this.boardTiles    = [];
    this.isMyTurn      = false;
    this.agentThinking = false;
    this.handTiles     = [];
    this.passBtn       = null;
  }

  create() {
    this.W = this.scale.width;
    this.H = this.scale.height;

    this.drawBackground();
    this.drawTable();
    this.createTopBar();
    this.createPlayerPanels();
    this.createHandArea();

    // Board container — masanın ortasında
    this.boardContainer = this.add.container(
      this.tableX + this.tableW / 2,
      this.tableY + this.tableH / 2
    );

    // Sol/Sağ uç
    this.endText = this.add.text(
      this.tableX + this.tableW / 2,
      this.tableY + this.tableH - 18,
      "", {
        fontSize: "13px", fontFamily: "system-ui",
        color: "rgba(255,255,255,0.45)", align: "center",
      }
    ).setOrigin(0.5);

    // Log
    this.logText = this.add.text(
      this.tableX + this.tableW / 2,
      this.tableY + this.tableH - 36,
      "", {
        fontSize: "12px", fontFamily: "system-ui",
        color: "#fbbf24", align: "center",
      }
    ).setOrigin(0.5);

    // Agent düşünüyor
    this.thinkText = this.add.text(
      this.tableX + this.tableW / 2,
      this.tableY + 20,
      "", {
        fontSize: "13px", fontFamily: "system-ui",
        color: "#c084fc", fontStyle: "bold",
      }
    ).setOrigin(0.5).setDepth(10);

    // Boş tahta yazısı
    this.emptyText = this.add.text(
      this.tableX + this.tableW / 2,
      this.tableY + this.tableH / 2,
      "Oyun (1|1) ile açıldı", {
        fontSize: "14px", fontFamily: "system-ui",
        color: "rgba(255,255,255,0.2)", fontStyle: "italic",
      }
    ).setOrigin(0.5);

    // WebSocket
    this.ws.onmessage = (ev) => {
      const msg = JSON.parse(ev.data);
      this.handleMessage(msg);
    };

    // İlk state
    if (this.firstState) {
      this.time.delayedCall(100, () => this.handleMessage(this.firstState));
    }

    // Resize
    this.scale.on("resize", (gameSize) => {
      this.scene.restart({
        ws: this.ws, name: this.myName, slot: this.slot,
        roomId: this.roomId, players: this.players,
      });
    });
  }

  // ── Arka plan ─────────────────────────────────────────
  drawBackground() {
    const g = this.add.graphics();
    g.fillGradientStyle(0x060e06, 0x060e06, 0x0d1f0d, 0x0d1f0d, 1);
    g.fillRect(0, 0, this.W, this.H);
  }

  // ── Masa ─────────────────────────────────────────────
  drawTable() {
    const W = this.W, H = this.H;
    const mx = W * 0.12, my = H * 0.17;
    const mw = W - mx * 2, mh = H * 0.57;

    // Ahşap dış
    const wood = this.add.graphics();
    wood.fillStyle(0x5c3312, 1);
    wood.fillRoundedRect(mx - 9, my - 9, mw + 18, mh + 18, 22);
    wood.lineStyle(3, 0x3a1f08, 1);
    wood.strokeRoundedRect(mx - 9, my - 9, mw + 18, mh + 18, 22);

    // İç ahşap şerit
    const woodInner = this.add.graphics();
    woodInner.lineStyle(5, 0x4a2a0e, 0.6);
    woodInner.strokeRoundedRect(mx - 4, my - 4, mw + 8, mh + 8, 18);

    // Keçe
    const felt = this.add.graphics();
    felt.fillStyle(0x1b5e32, 1);
    felt.fillRoundedRect(mx, my, mw, mh, 14);

    // Keçe iç parlaklık
    const shine = this.add.graphics();
    shine.fillStyle(0x256b40, 0.4);
    shine.fillEllipse(W / 2, my + mh * 0.3, mw * 0.75, mh * 0.45);

    // Keçe iç gölge (kenarlar)
    const shadow = this.add.graphics();
    shadow.lineStyle(14, 0x0a2a14, 0.5);
    shadow.strokeRoundedRect(mx + 3, my + 3, mw - 6, mh - 6, 12);

    this.tableX = mx;
    this.tableY = my;
    this.tableW = mw;
    this.tableH = mh;
  }

  // ── Üst bar ───────────────────────────────────────────
  createTopBar() {
    const W = this.W;
    const bar = this.add.graphics();
    bar.fillStyle(0x000000, 0.65);
    bar.fillRect(0, 0, W, 44);

    this.add.text(14, 22, "🁣 Domino AI", {
      fontSize: "16px", fontFamily: "system-ui",
      color: "#d4a843", fontStyle: "bold",
    }).setOrigin(0, 0.5);

    this.scoreA = this.add.text(W / 2 - 65, 22, "Takım A  0", {
      fontSize: "13px", fontFamily: "system-ui", color: "#34d399", fontStyle: "bold",
    }).setOrigin(0.5);

    this.scoreB = this.add.text(W / 2 + 65, 22, "Takım B  0", {
      fontSize: "13px", fontFamily: "system-ui", color: "#c084fc", fontStyle: "bold",
    }).setOrigin(0.5);

    this.add.text(W - 10, 22, `Oda: ${this.roomId}`, {
      fontSize: "11px", fontFamily: "system-ui", color: "#7a8070",
    }).setOrigin(1, 0.5);
  }

  // ── Oyuncu panelleri ──────────────────────────────────
  createPlayerPanels() {
    const W = this.W, H = this.H;
    const partnerName = this.players[1 - this.slot] || "Arkadaşın";
    const partnerIdx  = this.slot === 0 ? 2 : 0;

    this.panels = {
      partner: this.makePanel(W/2, H*0.105, partnerName, false),
      p2:      this.makePanel(W*0.065, H*0.465, "P2", true),
      p4:      this.makePanel(W*0.935, H*0.465, "P4", true),
    };
  }

  makePanel(x, y, name, isAgent) {
    const color    = isAgent ? 0xc084fc : 0x34d399;
    const colorStr = isAgent ? "#c084fc" : "#34d399";
    const c = this.add.container(x, y);

    const bg = this.add.graphics();
    bg.fillStyle(0x000000, 0.5);
    bg.fillRoundedRect(-58, -28, 116, 56, 10);
    bg.lineStyle(1.5, color, 0.25);
    bg.strokeRoundedRect(-58, -28, 116, 56, 10);
    c.add(bg);

    const nm = this.add.text(0, -8, (isAgent?"🤖 ":"👤 ") + name, {
      fontSize:"12px", fontFamily:"system-ui", color:colorStr, fontStyle:"bold",
    }).setOrigin(0.5);
    c.add(nm);

    const ct = this.add.text(0, 10, "7 taş", {
      fontSize:"11px", fontFamily:"system-ui", color:"#7a8070",
    }).setOrigin(0.5);
    c.add(ct);

    return { container:c, bg, nameText:nm, countText:ct, color, colorStr };
  }

  refreshPanel(panel, count, isTurn) {
    if (!panel) return;
    panel.countText.setText(`${count} taş`);
    panel.bg.clear();
    panel.bg.fillStyle(isTurn ? panel.color : 0x000000, isTurn ? 0.18 : 0.5);
    panel.bg.fillRoundedRect(-58, -28, 116, 56, 10);
    panel.bg.lineStyle(1.5, panel.color, isTurn ? 1 : 0.25);
    panel.bg.strokeRoundedRect(-58, -28, 116, 56, 10);
  }

  // ── El alanı ──────────────────────────────────────────
  createHandArea() {
    const W = this.W, H = this.H;
    this.handBg = this.add.graphics();
    this.hx = W * 0.04;
    this.hy = H * 0.775;
    this.hw = W * 0.92;
    this.hh = H * 0.21;
    this.redrawHandBg(false);

    this.myNameTxt = this.add.text(W/2, this.hy - 16, `👤 ${this.myName}`, {
      fontSize:"13px", fontFamily:"system-ui", color:"#34d399", fontStyle:"bold",
    }).setOrigin(0.5);

    this.turnTxt = this.add.text(W/2, this.hy - 2, "", {
      fontSize:"11px", fontFamily:"system-ui", color:"#4ade80",
    }).setOrigin(0.5);
  }

  redrawHandBg(myTurn) {
    this.handBg.clear();
    this.handBg.fillStyle(0x000000, 0.55);
    this.handBg.fillRoundedRect(this.hx, this.hy, this.hw, this.hh, 14);
    this.handBg.lineStyle(2, 0x34d399, myTurn ? 0.55 : 0.1);
    this.handBg.strokeRoundedRect(this.hx, this.hy, this.hw, this.hh, 14);
  }

  // ── Mesaj işleyici ────────────────────────────────────
  handleMessage(msg) {
    if (msg.type === "game_state") {
      this.gameState  = msg;
      this.myHand     = msg.your_hand    || [];
      this.legalMoves = msg.legal_moves  || [];
      this.isMyTurn   = msg.is_your_turn && !this.agentThinking;
      this.refreshAll(msg);
    }
    else if (msg.type === "agent_thinking") {
      this.agentThinking = true;
      this.isMyTurn      = false;
      this.thinkText.setText("⏳ Agent düşünüyor...");
    }
    else if (msg.type === "agent_move") {
      this.agentThinking = false;
      this.thinkText.setText("");
      const m = msg.move;
      this.addLog(`🤖 P${msg.player+1}: ${m.is_pass?"PAS":`(${m.tile[0]}|${m.tile[1]})`}`);
    }
    else if (msg.type === "human_move") {
      const m = msg.move;
      this.addLog(`👤 ${msg.name}: ${m.is_pass?"PAS":`(${m.tile[0]}|${m.tile[1]})`}`);
    }
    else if (msg.type === "game_over") {
      this.showGameOver(msg);
    }
    else if (msg.type === "error") {
      this.addLog(`⚠ ${msg.message}`);
    }
  }

  // ── Tüm UI yenile ────────────────────────────────────
  refreshAll(state) {
    const hs  = state.hand_sizes || [7,7,7,7];
    const cur = state.current_player ?? -1;
    const pi  = this.slot === 0 ? 2 : 0;

    this.scoreA.setText(`Takım A  ${state.team_scores?.[0]??0}`);
    this.scoreB.setText(`Takım B  ${state.team_scores?.[1]??0}`);

    this.refreshPanel(this.panels.partner, hs[pi],  cur===pi);
    this.refreshPanel(this.panels.p2,      hs[1],   cur===1);
    this.refreshPanel(this.panels.p4,      hs[3],   cur===3);

    this.drawBoard(state.board || []);
    this.drawHand(state.your_hand||[], state.legal_moves||[], state.is_your_turn);

    if (state.board?.length > 0) {
      this.endText.setText(`Sol: ${state.left_val}  —  Sağ: ${state.right_val}`);
    }

    const myTurn = state.is_your_turn && !this.agentThinking;
    this.redrawHandBg(myTurn);
    this.turnTxt.setText(myTurn ? "Senin sıran — masaya sürükle" : "");
  }

  // ── Masa taşları ──────────────────────────────────────
  drawBoard(board) {
    this.boardContainer.removeAll(true);
    this.emptyText.setVisible(board.length === 0);
    if (board.length === 0) return;

    // Taş başına genişlik hesapla
    const maxW    = this.tableW - 40;
    const maxH    = this.tableH - 60;

    // Her taşın boyutu
    // Normal: w > h, Çift: h > w (dikey)
    // Önce ideal boyutla dene, sığmazsa küçült
    let sz = 28; // temel birim
    const totalW = board.reduce((s, t) => s + (t[0]===t[1] ? sz : sz*2) + 3, 0) - 3;
    if (totalW > maxW) sz = sz * (maxW / totalW);
    sz = Math.max(10, Math.min(30, sz));

    let offsetX = 0;
    const pieces = [];

    board.forEach((tile, i) => {
      const [a, b]   = tile;
      const isDouble = a === b;
      const tw = isDouble ? sz      : sz * 2;
      const th = isDouble ? sz * 2  : sz;
      pieces.push({ a, b, isDouble, tw, th, x: offsetX + tw/2 });
      offsetX += tw + 3;
    });

    // Ortala
    const totalWidth = offsetX - 3;
    const startX     = -totalWidth / 2;

    pieces.forEach((p, i) => {
      const x     = startX + p.x;
      const isNew = i === board.length - 1;
      const cont  = this.makeBoardTile(x, 0, p.a, p.b, p.tw, p.th, sz, isNew);
      this.boardContainer.add(cont);
    });
  }

  makeBoardTile(x, y, a, b, tw, th, sz, isNew) {
    const c = this.add.container(x, y);
    const g = this.add.graphics();

    // Gölge
    g.fillStyle(0x000000, 0.45);
    g.fillRoundedRect(-tw/2+2, -th/2+2, tw, th, Math.max(2, sz*0.1));

    // Taş gövde
    g.fillStyle(0xf2ead8, 1);
    g.fillRoundedRect(-tw/2, -th/2, tw, th, Math.max(2, sz*0.1));

    // Kenar
    g.lineStyle(Math.max(1, sz*0.05), 0xbba878, 1);
    g.strokeRoundedRect(-tw/2, -th/2, tw, th, Math.max(2, sz*0.1));

    // Parlaklık üst
    g.fillStyle(0xffffff, 0.22);
    g.fillRoundedRect(-tw/2+1, -th/2+1, tw-2, th*0.38, Math.max(1, sz*0.08));

    // Orta çizgi
    g.lineStyle(Math.max(1, sz*0.06), 0xbba878, 1);
    if (a === b) {
      // Çift — yatay çizgi
      g.lineBetween(-tw/2+2, 0, tw/2-2, 0);
    } else {
      // Normal — dikey çizgi
      g.lineBetween(0, -th/2+2, 0, th/2-2);
    }

    c.add(g);

    // Noktalar
    if (a === b) {
      // Çift taş — üst ve alt yarı
      this.addPips(c, a, 0, -th/4, tw, th/2, sz);
      this.addPips(c, b, 0,  th/4, tw, th/2, sz);
    } else {
      // Normal taş — sol ve sağ yarı
      this.addPips(c, a, -tw/4, 0, tw/2, th, sz);
      this.addPips(c, b,  tw/4, 0, tw/2, th, sz);
    }

    // Yeni taş — animasyon
    if (isNew) {
      c.setAlpha(0);
      c.setScale(0.5);
      this.tweens.add({
        targets: c, alpha: 1, scaleX: 1, scaleY: 1,
        duration: ANIM_DUR, ease: "Back.easeOut",
      });
    }

    return c;
  }

  // ── Noktalar (pips) ───────────────────────────────────
  addPips(container, n, cx, cy, areaW, areaH, sz) {
    const positions = PIP_POS[n] || [];
    // Nokta yarıçapı — alan boyutuna göre ölçeklenir
    const pipR = Math.max(1.5, Math.min(sz * 0.18, areaW * 0.09));
    const pad  = pipR * 1.5;

    positions.forEach(([px, py]) => {
      const x = cx - areaW/2 + pad + px * (areaW - pad*2);
      const y = cy - areaH/2 + pad + py * (areaH - pad*2);

      const g = this.add.graphics();
      // Gölge
      g.fillStyle(0x000000, 0.25);
      g.fillCircle(x+0.8, y+0.8, pipR);
      // Nokta
      g.fillStyle(0x1a0f05, 1);
      g.fillCircle(x, y, pipR);
      // İç parlaklık
      g.fillStyle(0x4a2a10, 0.35);
      g.fillCircle(x - pipR*0.25, y - pipR*0.25, pipR*0.35);

      container.add(g);
    });
  }

  // ── El taşları ────────────────────────────────────────
  drawHand(hand, legal, isMyTurn) {
    this.handTiles.forEach(t => t.destroy());
    this.handTiles = [];

    // Pas butonu kaldır
    if (this.passBtn) { this.passBtn.destroy(); this.passBtn = null; }

    if (hand.length === 0) return;

    const mustPass = legal.length === 1 && legal[0].is_pass;

    // Pas butonu
    if (mustPass && isMyTurn) {
      this.passBtn = this.add.text(
        this.W/2, this.hy + this.hh/2,
        "  PAS GEÇ  ", {
          fontSize: "18px", fontFamily: "system-ui",
          color: "#fff", fontStyle: "bold",
          backgroundColor: "#dc2626",
          padding: { x:20, y:12 },
        }
      ).setOrigin(0.5).setDepth(20).setInteractive({ useHandCursor: true });

      this.passBtn.on("pointerdown", () => this.sendMove(legal[0]));
      this.passBtn.on("pointerover", () => this.passBtn.setStyle({ backgroundColor:"#b91c1c" }));
      this.passBtn.on("pointerout",  () => this.passBtn.setStyle({ backgroundColor:"#dc2626" }));
      return;
    }

    // El taşlarını yerleştir
    const maxTW  = 72;
    const gap    = 6;
    const totalW = hand.length * (maxTW + gap) - gap;
    const availW = this.hw - 32;
    const scale  = totalW > availW ? availW / totalW : 1;
    const tw     = maxTW * scale;
    const th     = tw * 0.52;
    const sp     = (tw + gap) * scale;
    const startX = this.W/2 - (hand.length * sp - gap*scale) / 2 + tw/2;
    const baseY  = this.hy + this.hh/2;

    hand.forEach((tile, i) => {
      const [a, b] = tile;
      const x = startX + i * sp;
      const playable = isMyTurn && legal.some(m =>
        !m.is_pass &&
        ((m.tile[0]===a&&m.tile[1]===b)||(m.tile[0]===b&&m.tile[1]===a))
      );

      const cont = this.makeHandTile(x, baseY, a, b, tw, th, playable, legal);
      this.handTiles.push(cont);
    });
  }

  makeHandTile(x, y, a, b, tw, th, playable, legal) {
    const c = this.add.container(x, y);

    const g = this.add.graphics();
    this.drawTileGraphic(g, a, b, tw, th, playable);
    c.add(g);

    // Nokta boyutu el için biraz daha büyük
    const pipSz = tw / 2.2;
    this.addPips(c, a, -tw/4, 0, tw/2, th, pipSz);
    this.addPips(c, b,  tw/4, 0, tw/2, th, pipSz);

    c.setAlpha(playable ? 1 : 0.32);
    c.setDepth(1);

    if (playable) {
      c.setSize(tw, th);
      c.setInteractive({ useHandCursor: true });

      // Hover — hafifçe yukarı
      c.on("pointerover", () => {
        this.tweens.add({ targets:c, y:y-10, duration:120, ease:"Quad.easeOut" });
        // Yeşil kenarlık
        g.clear();
        this.drawTileGraphic(g, a, b, tw, th, true, true);
      });
      c.on("pointerout", () => {
        if (!c._dragging) {
          this.tweens.add({ targets:c, y:y, duration:120, ease:"Quad.easeOut" });
          g.clear();
          this.drawTileGraphic(g, a, b, tw, th, true, false);
        }
      });

      // Sürükleme
      this.input.setDraggable(c);

      c.on("dragstart", () => {
        c._dragging = true;
        c.setDepth(50);
        this.tweens.killTweensOf(c);
      });

      c.on("drag", (ptr, dx, dy) => {
        c.setPosition(dx, dy);
        const over = this.isOverTable(ptr.x, ptr.y);
        // Masa üzerindeyse hafif küçül
        if (over !== c._wasOver) {
          c._wasOver = over;
          this.tweens.add({
            targets: c, scaleX: over?0.88:1, scaleY: over?0.88:1,
            duration: 100,
          });
        }
      });

      c.on("dragend", (ptr) => {
        c._dragging = false;
        c.setDepth(1);
        c.setScale(1);

        if (this.isOverTable(ptr.x, ptr.y)) {
          const toLeft = ptr.x < this.W / 2;
          const move = legal.find(m =>
            !m.is_pass &&
            ((m.tile[0]===a&&m.tile[1]===b)||(m.tile[0]===b&&m.tile[1]===a)) &&
            m.to_left === toLeft
          ) || legal.find(m =>
            !m.is_pass &&
            ((m.tile[0]===a&&m.tile[1]===b)||(m.tile[0]===b&&m.tile[1]===a))
          );

          if (move) {
            // Masaya kayarak git — KAYBOLMADAN
            const tx = this.tableX + this.tableW/2;
            const ty = this.tableY + this.tableH/2;
            this.tweens.add({
              targets:  c,
              x:        tx, y: ty,
              scaleX:   0.4, scaleY: 0.4,
              alpha:    0,
              duration: 200,
              ease:     "Quad.easeIn",
              onComplete: () => {
                c.destroy();
                this.sendMove(move);
              },
            });
          } else {
            // Yerine dön
            this.tweens.add({ targets:c, x, y, duration:200, ease:"Back.easeOut" });
            this.addLog("Bu taş bu tarafa oynanamaz.");
          }
        } else {
          // Yerine dön
          this.tweens.add({ targets:c, x, y, duration:200, ease:"Back.easeOut" });
        }
      });
    }

    return c;
  }

  drawTileGraphic(g, a, b, tw, th, playable, hovered=false) {
    // Gölge
    g.fillStyle(0x000000, 0.5);
    g.fillRoundedRect(-tw/2+2, -th/2+3, tw, th, 7);

    // Gövde
    if (playable) {
      g.fillStyle(hovered ? 0xfffbf0 : 0xf5efd8, 1);
    } else {
      g.fillStyle(0x252018, 1);
    }
    g.fillRoundedRect(-tw/2, -th/2, tw, th, 7);

    // Kenar
    if (hovered) {
      g.lineStyle(2, 0x4ade80, 1);
    } else {
      g.lineStyle(1.5, playable ? 0xbba878 : 0x3a3020, 1);
    }
    g.strokeRoundedRect(-tw/2, -th/2, tw, th, 7);

    // Parlaklık
    if (playable) {
      g.fillStyle(0xffffff, hovered ? 0.4 : 0.28);
      g.fillRoundedRect(-tw/2+2, -th/2+2, tw-4, th*0.38, 5);
    }

    // Orta çizgi
    g.lineStyle(1.5, playable ? 0xbba878 : 0x3a3020, 1);
    g.lineBetween(0, -th/2+4, 0, th/2-4);
  }

  isOverTable(px, py) {
    return px >= this.tableX && px <= this.tableX + this.tableW &&
           py >= this.tableY && py <= this.tableY + this.tableH;
  }

  sendMove(move) {
    if (this.ws?.readyState === WebSocket.OPEN)
      this.ws.send(JSON.stringify({ type:"move", ...move }));
  }

  addLog(text) {
    this.logText.setText(text);
    this.time.delayedCall(3500, () => {
      if (this.logText?.text === text) this.logText.setText("");
    });
  }

  // ── Oyun sonu ─────────────────────────────────────────
  showGameOver(result) {
    const W = this.W, H = this.H;

    const ov = this.add.graphics().setDepth(60);
    ov.fillStyle(0x000000, 0.82);
    ov.fillRect(0, 0, W, H);

    const panel = this.add.graphics().setDepth(61);
    panel.fillStyle(0x0d1a0d, 1);
    panel.fillRoundedRect(W/2-175, H/2-140, 350, 280, 16);
    panel.lineStyle(1.5, 0xd4a843, 0.5);
    panel.strokeRoundedRect(W/2-175, H/2-140, 350, 280, 16);

    const emoji = result.team_a_score < result.team_b_score ? "🏆"
                : result.team_b_score < result.team_a_score ? "😔" : "🤝";

    this.add.text(W/2, H/2-100, emoji,         { fontSize:"52px" }).setOrigin(0.5).setDepth(62);
    this.add.text(W/2, H/2-50,  "Oyun Bitti!", { fontSize:"24px", fontFamily:"system-ui", color:"#d4a843", fontStyle:"bold" }).setOrigin(0.5).setDepth(62);
    this.add.text(W/2, H/2-18,  result.winner, { fontSize:"15px", fontFamily:"system-ui", color:"#4ade80" }).setOrigin(0.5).setDepth(62);

    this.add.text(W/2-70, H/2+20, `Takım A\n${result.team_a_score}`, {
      fontSize:"13px", fontFamily:"system-ui", color:"#34d399", align:"center",
    }).setOrigin(0.5).setDepth(62);

    this.add.text(W/2+70, H/2+20, `Takım B\n${result.team_b_score}`, {
      fontSize:"13px", fontFamily:"system-ui", color:"#c084fc", align:"center",
    }).setOrigin(0.5).setDepth(62);

    const btn = this.add.text(W/2, H/2+80, "Tekrar Oyna", {
      fontSize:"16px", fontFamily:"system-ui", color:"#fff", fontStyle:"bold",
      backgroundColor:"#d4a843", padding:{ x:22, y:11 },
    }).setOrigin(0.5).setDepth(62).setInteractive({ useHandCursor:true });

    btn.on("pointerover", () => btn.setStyle({ backgroundColor:"#b8922e" }));
    btn.on("pointerout",  () => btn.setStyle({ backgroundColor:"#d4a843" }));
    btn.on("pointerdown", () => {
      if (this.ws?.readyState === WebSocket.OPEN)
        this.ws.send(JSON.stringify({ type:"rematch" }));
      ov.destroy(); panel.destroy();
    });
  }
}