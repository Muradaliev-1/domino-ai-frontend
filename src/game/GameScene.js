import Phaser from "phaser";

// ── Sabitler ──────────────────────────────────────────────
const TILE_W  = 52;   // normal taş genişliği
const TILE_H  = 26;   // normal taş yüksekliği
const TILE_GAP = 2;   // taşlar arası boşluk
const ANIM_DUR = 280; // animasyon süresi (ms)

// Nokta pozisyonları (0-6) — 0..1 oranında
const PIP_POS = {
  0: [],
  1: [[0.5, 0.5]],
  2: [[0.28, 0.28], [0.72, 0.72]],
  3: [[0.28, 0.28], [0.5, 0.5],  [0.72, 0.72]],
  4: [[0.28, 0.28], [0.72, 0.28],[0.28, 0.72], [0.72, 0.72]],
  5: [[0.28, 0.28], [0.72, 0.28],[0.5,  0.5],  [0.28, 0.72], [0.72, 0.72]],
  6: [[0.28, 0.2],  [0.72, 0.2], [0.28, 0.5],  [0.72, 0.5],  [0.28, 0.8], [0.72, 0.8]],
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

    // Oyun durumu
    this.gameState    = null;
    this.myHand       = [];
    this.legalMoves   = [];
    this.boardTiles   = [];
    this.isMyTurn     = false;
    this.agentThinking= false;

    // Sürükleme
    this.dragTile     = null;
    this.dragGhost    = null;
    this.dragOrigin   = { x: 0, y: 0 };
  }

  create() {
    const W = this.scale.width;
    const H = this.scale.height;

    this.W = W;
    this.H = H;

    // Arka plan
    this.drawBackground();

    // Masa
    this.drawTable();

    // Üst bar
    this.createTopBar();

    // Oyuncu panelleri
    this.createPlayerPanels();

    // El alanı (alt)
    this.createHandArea();

    // Board container
    this.boardContainer = this.add.container(W / 2, H * 0.48);

    // Log text
    this.logText = this.add.text(W / 2, H * 0.72, "", {
      fontSize:   "12px",
      fontFamily: "system-ui",
      color:      "#7a8070",
      align:      "center",
    }).setOrigin(0.5);

    // Sol/Sağ uç göstergesi
    this.endText = this.add.text(W / 2, H * 0.68, "", {
      fontSize:   "13px",
      fontFamily: "system-ui",
      color:      "rgba(255,255,255,0.5)",
      align:      "center",
    }).setOrigin(0.5);

    // Agent düşünüyor
    this.thinkText = this.add.text(W / 2, H * 0.48, "", {
      fontSize:   "14px",
      fontFamily: "system-ui",
      color:      "#c084fc",
      fontStyle:  "bold",
    }).setOrigin(0.5).setDepth(10);

    // WebSocket mesajları
    this.ws.onmessage = (ev) => {
      const msg = JSON.parse(ev.data);
      console.log("GameScene msg:", msg.type);
      this.handleMessage(msg);
    };

    // İlk state varsa hemen işle
    if (this.firstState) {
      this.time.delayedCall(100, () => {
        this.handleMessage(this.firstState);
      });
    }

    // Resize
    this.scale.on("resize", (gameSize) => {
      this.W = gameSize.width;
      this.H = gameSize.height;
      this.scene.restart({
        ws: this.ws, name: this.myName, slot: this.slot,
        roomId: this.roomId, players: this.players,
      });
    });
  }

  // ── Arka plan ─────────────────────────────────────────
  drawBackground() {
    const g = this.add.graphics();
    g.fillGradientStyle(0x080f08, 0x080f08, 0x0f1f0f, 0x0f1f0f, 1);
    g.fillRect(0, 0, this.W, this.H);
  }

  // ── Masa (yeşil keçe + ahşap kenar) ──────────────────
  drawTable() {
    const W = this.W, H = this.H;
    const mx = W * 0.13, my = H * 0.18;
    const mw = W - mx * 2, mh = H * 0.58;

    // Ahşap dış kenar
    const wood = this.add.graphics();
    wood.fillStyle(0x5a3010, 1);
    wood.fillRoundedRect(mx - 8, my - 8, mw + 16, mh + 16, 22);
    wood.lineStyle(3, 0x3a1a08, 1);
    wood.strokeRoundedRect(mx - 8, my - 8, mw + 16, mh + 16, 22);

    // Keçe (gradient simülasyonu için iki katman)
    const felt = this.add.graphics();
    felt.fillStyle(0x1a5c32, 1);
    felt.fillRoundedRect(mx, my, mw, mh, 16);

    // İç parlaklık
    const shine = this.add.graphics();
    shine.fillStyle(0x226040, 0.3);
    shine.fillEllipse(W / 2, my + mh * 0.25, mw * 0.8, mh * 0.4);

    // İç gölge
    const shadow = this.add.graphics();
    shadow.lineStyle(12, 0x0a2010, 0.4);
    shadow.strokeRoundedRect(mx + 4, my + 4, mw - 8, mh - 8, 14);

    // Masa referansları
    this.tableX = mx;
    this.tableY = my;
    this.tableW = mw;
    this.tableH = mh;
  }

  // ── Üst bar ───────────────────────────────────────────
  createTopBar() {
    const W = this.W;

    const bar = this.add.graphics();
    bar.fillStyle(0x000000, 0.6);
    bar.fillRect(0, 0, W, 44);

    this.add.text(16, 22, "🁣 Domino AI", {
      fontSize: "17px", fontFamily: "system-ui",
      color: "#d4a843", fontStyle: "bold",
    }).setOrigin(0, 0.5);

    // Skor panelleri
    this.scoreTextA = this.add.text(W / 2 - 60, 22, "Takım A  0", {
      fontSize: "14px", fontFamily: "system-ui", color: "#34d399", fontStyle: "bold",
    }).setOrigin(0.5);

    this.scoreTextB = this.add.text(W / 2 + 60, 22, "Takım B  0", {
      fontSize: "14px", fontFamily: "system-ui", color: "#c084fc", fontStyle: "bold",
    }).setOrigin(0.5);

    this.add.text(W - 12, 22, `Oda: ${this.roomId}`, {
      fontSize: "11px", fontFamily: "system-ui", color: "#7a8070",
    }).setOrigin(1, 0.5);
  }

  // ── Oyuncu panelleri ──────────────────────────────────
  createPlayerPanels() {
    const W = this.W, H = this.H;

    const myIndex      = this.slot === 0 ? 0 : 2;
    const partnerIndex = this.slot === 0 ? 2 : 0;
    const partnerName  = this.players[1 - this.slot] || "Arkadaşın";

    // Üst — Arkadaş
    this.partnerPanel = this.createPanel(W / 2, H * 0.12, partnerName, false, "top");
    // Sol — Agent P2
    this.p2Panel = this.createPanel(W * 0.07, H * 0.48, "P2", true, "left");
    // Sağ — Agent P4
    this.p4Panel = this.createPanel(W * 0.93, H * 0.48, "P4", true, "right");
  }

  createPanel(x, y, name, isAgent, position) {
    const container = this.add.container(x, y);
    const color = isAgent ? 0xc084fc : 0x34d399;
    const colorStr = isAgent ? "#c084fc" : "#34d399";

    // Arka plan
    const bg = this.add.graphics();
    bg.fillStyle(0x000000, 0.5);
    bg.fillRoundedRect(-60, -30, 120, 60, 10);
    bg.lineStyle(1.5, color, 0.3);
    bg.strokeRoundedRect(-60, -30, 120, 60, 10);
    container.add(bg);

    // İsim
    const nameText = this.add.text(0, -8, (isAgent ? "🤖 " : "👤 ") + name, {
      fontSize: "13px", fontFamily: "system-ui", color: colorStr, fontStyle: "bold",
    }).setOrigin(0.5);
    container.add(nameText);

    // Taş sayısı
    const countText = this.add.text(0, 10, "7 taş", {
      fontSize: "11px", fontFamily: "system-ui", color: "#7a8070",
    }).setOrigin(0.5);
    container.add(countText);

    return { container, bg, nameText, countText, color, isAgent };
  }

  updatePanel(panel, handSize, isTurn) {
    if (!panel) return;
    panel.countText.setText(`${handSize} taş`);
    panel.bg.clear();
    panel.bg.fillStyle(isTurn ? panel.color : 0x000000, isTurn ? 0.15 : 0.5);
    panel.bg.fillRoundedRect(-60, -30, 120, 60, 10);
    panel.bg.lineStyle(1.5, panel.color, isTurn ? 1 : 0.3);
    panel.bg.strokeRoundedRect(-60, -30, 120, 60, 10);
  }

  // ── El alanı ──────────────────────────────────────────
  createHandArea() {
    const W = this.W, H = this.H;

    const handBg = this.add.graphics();
    handBg.fillStyle(0x000000, 0.55);
    handBg.fillRoundedRect(W * 0.05, H * 0.78, W * 0.9, H * 0.19, 14);
    handBg.lineStyle(2, 0x34d399, 0.1);
    handBg.strokeRoundedRect(W * 0.05, H * 0.78, W * 0.9, H * 0.19, 14);

    this.handBg    = handBg;
    this.handAreaX = W * 0.05;
    this.handAreaY = H * 0.78;
    this.handAreaW = W * 0.9;
    this.handAreaH = H * 0.19;

    // İsim
    this.myNameText = this.add.text(W / 2, H * 0.755, `👤 ${this.myName}`, {
      fontSize: "13px", fontFamily: "system-ui", color: "#34d399", fontStyle: "bold",
    }).setOrigin(0.5);

    // Sıra göstergesi
    this.turnText = this.add.text(W / 2, H * 0.755 + 18, "", {
      fontSize: "12px", fontFamily: "system-ui", color: "#4ade80",
    }).setOrigin(0.5);

    this.handTiles = []; // Eldeki taş nesneleri
  }

  // ── WebSocket mesaj işleyici ───────────────────────────
  handleMessage(msg) {
    if (msg.type === "game_state") {
      this.gameState  = msg;
      this.myHand     = msg.your_hand || [];
      this.legalMoves = msg.legal_moves || [];
      this.isMyTurn   = msg.is_your_turn && !this.agentThinking;
      this.updateUI(msg);
    }
    else if (msg.type === "agent_thinking") {
      this.agentThinking = true;
      this.isMyTurn      = false;
      this.thinkText.setText("⏳ Agent düşünüyor...");
    }
    else if (msg.type === "agent_move") {
      this.agentThinking = false;
      const m = msg.move;
      this.addLog(`🤖 P${msg.player+1}: ${m.is_pass ? "PAS" : `(${m.tile[0]}|${m.tile[1]})`}`);
      this.thinkText.setText("");
    }
    else if (msg.type === "human_move") {
      this.addLog(`👤 ${msg.name}: ${msg.move.is_pass ? "PAS" : `(${msg.move.tile[0]}|${msg.move.tile[1]})`}`);
    }
    else if (msg.type === "game_over") {
      this.showGameOver(msg);
    }
    else if (msg.type === "error") {
      this.addLog(`⚠ ${msg.message}`);
    }
    else if (msg.type === "game_started") {
      this.players = msg.players || this.players;
    }
  }

  // ── UI güncelle ───────────────────────────────────────
  updateUI(state) {
    // Skorlar
    const sa = state.team_scores?.[0] ?? 0;
    const sb = state.team_scores?.[1] ?? 0;
    this.scoreTextA.setText(`Takım A  ${sa}`);
    this.scoreTextB.setText(`Takım B  ${sb}`);

    // Paneller
    const hs  = state.hand_sizes || [7,7,7,7];
    const cur = state.current_player ?? -1;
    const partnerIdx = this.slot === 0 ? 2 : 0;
    this.updatePanel(this.partnerPanel, hs[partnerIdx], cur === partnerIdx);
    this.updatePanel(this.p2Panel,      hs[1],          cur === 1);
    this.updatePanel(this.p4Panel,      hs[3],          cur === 3);

    // Masa taşları
    this.drawBoard(state.board || []);

    // Uçlar
    if (state.board?.length > 0) {
      this.endText.setText(`Sol: ${state.left_val}  —  Sağ: ${state.right_val}`);
    }

    // El
    this.drawHand(state.your_hand || [], state.legal_moves || [], state.is_your_turn);

    // Sıra
    if (state.is_your_turn && !this.agentThinking) {
      this.turnText.setText("Senin sıran — masaya sürükle");
      this.turnText.setColor("#4ade80");
      this.handBg.clear();
      this.handBg.fillStyle(0x000000, 0.55);
      this.handBg.fillRoundedRect(this.handAreaX, this.handAreaY, this.handAreaW, this.handAreaH, 14);
      this.handBg.lineStyle(2, 0x34d399, 0.5);
      this.handBg.strokeRoundedRect(this.handAreaX, this.handAreaY, this.handAreaW, this.handAreaH, 14);
    } else {
      this.turnText.setText(this.agentThinking ? "Agent oynuyor..." : "");
      this.handBg.clear();
      this.handBg.fillStyle(0x000000, 0.55);
      this.handBg.fillRoundedRect(this.handAreaX, this.handAreaY, this.handAreaW, this.handAreaH, 14);
      this.handBg.lineStyle(2, 0x34d399, 0.1);
      this.handBg.strokeRoundedRect(this.handAreaX, this.handAreaY, this.handAreaW, this.handAreaH, 14);
    }
  }

  // ── Masadaki taşları çiz ──────────────────────────────
  drawBoard(board) {
    // Önceki taşları temizle
    this.boardContainer.removeAll(true);

    if (board.length === 0) {
      this.add.text(this.W / 2, this.H * 0.48, "Oyun (1|1) ile açıldı", {
        fontSize: "14px", fontFamily: "system-ui",
        color: "rgba(255,255,255,0.2)", fontStyle: "italic",
      }).setOrigin(0.5).setName("emptyText");
      return;
    }

    // Mevcut boş metni temizle
    const empty = this.children.getByName("emptyText");
    if (empty) empty.destroy();

    // Toplam genişlik hesapla — masaya sığacak mı?
    const maxW = this.tableW - 32;
    const totalTileW = board.reduce((sum, t) =>
      sum + (t[0] === t[1] ? TILE_H + TILE_GAP : TILE_W + TILE_GAP), 0);

    // Scale hesapla
    const scale = totalTileW > maxW ? maxW / totalTileW : 1;
    const tw = TILE_W * scale;
    const th = TILE_H * scale;

    // Taşları yerleştir
    let offsetX = -totalTileW * scale / 2;

    board.forEach((tile, i) => {
      const [a, b]   = tile;
      const isDouble = a === b;
      const tileW    = (isDouble ? TILE_H : TILE_W) * scale;
      const tileH    = (isDouble ? TILE_W : TILE_H) * scale;
      const cx       = offsetX + tileW / 2;
      const isNew    = i === board.length - 1;

      const tileContainer = this.createBoardTileGraphic(cx, 0, a, b, tileW, tileH, scale, isNew);
      this.boardContainer.add(tileContainer);

      offsetX += tileW + TILE_GAP * scale;
    });

    this.boardContainer.setPosition(this.W / 2, this.tableY + this.tableH / 2);
  }

  // ── Tek masa taşı ─────────────────────────────────────
  createBoardTileGraphic(x, y, a, b, tileW, tileH, scale, isNew) {
    const container = this.add.container(x, y);

    const g = this.add.graphics();

    // Gölge
    g.fillStyle(0x000000, 0.4);
    g.fillRoundedRect(-tileW/2 + 2, -tileH/2 + 2, tileW, tileH, 3 * scale);

    // Taş arka plan
    g.fillStyle(0xf5f0e0, 1);
    g.fillRoundedRect(-tileW/2, -tileH/2, tileW, tileH, 3 * scale);

    // Kenar
    g.lineStyle(1 * scale, 0xc4aa7a, 1);
    g.strokeRoundedRect(-tileW/2, -tileH/2, tileW, tileH, 3 * scale);

    // Parlaklık (üst)
    g.fillStyle(0xffffff, 0.25);
    g.fillRoundedRect(-tileW/2 + 1, -tileH/2 + 1, tileW - 2, tileH * 0.4, 2 * scale);

    // Bölme çizgisi
    g.lineStyle(1.5 * scale, 0xc4aa7a, 1);
    if (a === b) {
      // Çift — dikey bölme (yatay taş gibi görünüyor)
      g.lineBetween(0, -tileH/2 + 2, 0, tileH/2 - 2);
    } else {
      g.lineBetween(0, -tileH/2 + 2, 0, tileH/2 - 2);
    }

    container.add(g);

    // Noktaları çiz
    const isDouble = a === b;
    this.drawPips(container, a, -tileW/4, 0, tileW/2, tileH, scale);
    this.drawPips(container, b,  tileW/4, 0, tileW/2, tileH, scale);

    // Yeni taş animasyonu
    if (isNew) {
      container.setScale(0.3);
      container.setAlpha(0);
      this.tweens.add({
        targets:  container,
        scaleX:   1,
        scaleY:   1,
        alpha:    1,
        duration: ANIM_DUR,
        ease:     "Back.easeOut",
      });
    }

    return container;
  }

  // ── Noktalar ─────────────────────────────────────────
  drawPips(container, n, cx, cy, halfW, tileH, scale) {
    const positions = PIP_POS[n] || [];
    const pipR = Math.max(2, (tileH * 0.14) * scale);
    const areaW = halfW * 0.85;
    const areaH = tileH * 0.8;

    positions.forEach(([px, py]) => {
      const x = cx - areaW/2 + px * areaW;
      const y = cy - areaH/2 + py * areaH;

      const pip = this.add.graphics();
      // Nokta gölgesi
      pip.fillStyle(0x000000, 0.3);
      pip.fillCircle(x + 0.5, y + 0.5, pipR);
      // Nokta
      pip.fillStyle(0x1c1208, 1);
      pip.fillCircle(x, y, pipR);
      // Parlak kenar
      pip.fillStyle(0x3a2818, 0.4);
      pip.fillCircle(x - pipR * 0.2, y - pipR * 0.2, pipR * 0.4);

      container.add(pip);
    });
  }

  // ── Eldeki taşları çiz ────────────────────────────────
  drawHand(hand, legal, isMyTurn) {
    // Önceki taşları temizle
    this.handTiles.forEach(t => t.destroy());
    this.handTiles = [];

    if (hand.length === 0) return;

    const areaX = this.handAreaX + 16;
    const areaW = this.handAreaW - 32;
    const areaY = this.handAreaY + this.handAreaH / 2;

    // Taş boyutu — ele sığacak şekilde
    const maxTileW = 64;
    const spacing  = Math.min(maxTileW + 8, areaW / hand.length);
    const tileW    = Math.min(maxTileW, spacing - 4);
    const tileH    = tileW * 0.55;

    const totalW   = hand.length * spacing - 4;
    const startX   = this.W / 2 - totalW / 2 + spacing / 2;

    hand.forEach((tile, i) => {
      const [a, b] = tile;
      const x = startX + i * spacing;
      const isPlayable = isMyTurn && legal.some(m =>
        !m.is_pass && ((m.tile[0]===a&&m.tile[1]===b)||(m.tile[0]===b&&m.tile[1]===a))
      );

      const tileObj = this.createHandTileGraphic(x, areaY, a, b, tileW, tileH, isPlayable, legal);
      this.handTiles.push(tileObj);
    });
  }

  // ── El taşı ───────────────────────────────────────────
  createHandTileGraphic(x, y, a, b, tileW, tileH, isPlayable, legal) {
    const container = this.add.container(x, y);

    const g = this.add.graphics();

    // Gölge
    g.fillStyle(0x000000, 0.5);
    g.fillRoundedRect(-tileW/2 + 2, -tileH/2 + 3, tileW, tileH, 6);

    // Arka plan
    if (isPlayable) {
      g.fillStyle(0xf8f3e3, 1);
    } else {
      g.fillStyle(0x2a2520, 1);
    }
    g.fillRoundedRect(-tileW/2, -tileH/2, tileW, tileH, 6);

    // Kenar
    g.lineStyle(1.5, isPlayable ? 0xc4aa7a : 0x3a3530, 1);
    g.strokeRoundedRect(-tileW/2, -tileH/2, tileW, tileH, 6);

    if (isPlayable) {
      // Parlaklık
      g.fillStyle(0xffffff, 0.35);
      g.fillRoundedRect(-tileW/2 + 2, -tileH/2 + 2, tileW - 4, tileH * 0.38, 4);
    }

    // Bölme çizgisi
    g.lineStyle(1.5, isPlayable ? 0xc4aa7a : 0x3a3530, 1);
    g.lineBetween(0, -tileH/2 + 3, 0, tileH/2 - 3);

    container.add(g);

    // Noktalar
    const scale = tileW / TILE_W;
    this.drawPips(container, a, -tileW/4, 0, tileW/2, tileH, scale * 0.9);
    this.drawPips(container, b,  tileW/4, 0, tileW/2, tileH, scale * 0.9);

    container.setAlpha(isPlayable ? 1 : 0.35);

    // Sürükleme
    if (isPlayable) {
      container.setSize(tileW, tileH);
      container.setInteractive({ useHandCursor: true });

      container.on("pointerover", () => {
        this.tweens.add({ targets: container, y: y - 8, duration: 150, ease: "Quad.easeOut" });
        g.clear();
        g.fillStyle(0x000000, 0.5);
        g.fillRoundedRect(-tileW/2 + 2, -tileH/2 + 3, tileW, tileH, 6);
        g.fillStyle(0xfffbf0, 1);
        g.fillRoundedRect(-tileW/2, -tileH/2, tileW, tileH, 6);
        g.lineStyle(2, 0x4ade80, 1);
        g.strokeRoundedRect(-tileW/2, -tileH/2, tileW, tileH, 6);
        g.fillStyle(0xffffff, 0.4);
        g.fillRoundedRect(-tileW/2 + 2, -tileH/2 + 2, tileW - 4, tileH * 0.38, 4);
        g.lineStyle(1.5, 0xc4aa7a, 1);
        g.lineBetween(0, -tileH/2 + 3, 0, tileH/2 - 3);
      });

      container.on("pointerout", () => {
        if (!this.dragTile) {
          this.tweens.add({ targets: container, y: y, duration: 150, ease: "Quad.easeOut" });
        }
      });

      this.input.setDraggable(container);

      container.on("drag", (pointer, dragX, dragY) => {
        container.setPosition(dragX, dragY);
        container.setDepth(100);

        // Masa üzerinde mi?
        const overBoard = this.isOverTable(pointer.x, pointer.y);
        container.setScale(overBoard ? 0.9 : 1.0);
      });

      container.on("dragend", (pointer) => {
        container.setDepth(0);
        container.setScale(1);

        if (this.isOverTable(pointer.x, pointer.y)) {
          const toLeft = pointer.x < this.W / 2;
          const move = legal.find(m =>
            !m.is_pass &&
            ((m.tile[0]===a&&m.tile[1]===b)||(m.tile[0]===b&&m.tile[1]===a)) &&
            m.to_left === toLeft
          ) || legal.find(m =>
            !m.is_pass &&
            ((m.tile[0]===a&&m.tile[1]===b)||(m.tile[0]===b&&m.tile[1]===a))
          );

          if (move) {
            // Masaya kayarak git
            const targetX = this.W / 2;
            const targetY = this.tableY + this.tableH / 2;
            this.tweens.add({
              targets:  container,
              x:        targetX,
              y:        targetY,
              scaleX:   0.3,
              scaleY:   0.3,
              alpha:    0,
              duration: 250,
              ease:     "Quad.easeIn",
              onComplete: () => {
                this.sendMove(move);
              },
            });
          } else {
            // Yerine dön
            this.tweens.add({
              targets: container, x: x, y: y, duration: 200, ease: "Back.easeOut",
            });
            this.addLog("Bu taş bu tarafa oynanamaz.");
          }
        } else {
          // Yerine dön
          this.tweens.add({
            targets: container, x: x, y: y, duration: 200, ease: "Back.easeOut",
          });
        }
      });
    }

    return container;
  }

  isOverTable(px, py) {
    return px >= this.tableX && px <= this.tableX + this.tableW &&
           py >= this.tableY && py <= this.tableY + this.tableH;
  }

  sendMove(move) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: "move", ...move }));
    }
  }

  addLog(text) {
    this.logText.setText(text);
    this.time.delayedCall(4000, () => {
      if (this.logText.text === text) this.logText.setText("");
    });
  }

  // ── Oyun sonu ─────────────────────────────────────────
  showGameOver(result) {
    const W = this.W, H = this.H;

    const overlay = this.add.graphics();
    overlay.fillStyle(0x000000, 0.85);
    overlay.fillRect(0, 0, W, H);
    overlay.setDepth(50);

    const panel = this.add.graphics();
    panel.fillStyle(0x0a150a, 1);
    panel.fillRoundedRect(W/2 - 180, H/2 - 140, 360, 280, 16);
    panel.lineStyle(1.5, 0xd4a843, 0.5);
    panel.strokeRoundedRect(W/2 - 180, H/2 - 140, 360, 280, 16);
    panel.setDepth(51);

    const emoji = result.team_a_score < result.team_b_score ? "🏆"
                : result.team_b_score < result.team_a_score ? "😔" : "🤝";

    this.add.text(W/2, H/2 - 100, emoji,    { fontSize:"52px" }).setOrigin(0.5).setDepth(52);
    this.add.text(W/2, H/2 - 50,  "Oyun Bitti!", {
      fontSize:"26px", fontFamily:"system-ui", color:"#d4a843", fontStyle:"bold",
    }).setOrigin(0.5).setDepth(52);
    this.add.text(W/2, H/2 - 16, result.winner, {
      fontSize:"16px", fontFamily:"system-ui", color:"#4ade80",
    }).setOrigin(0.5).setDepth(52);

    this.add.text(W/2 - 70, H/2 + 20, `Takım A\n${result.team_a_score}`, {
      fontSize:"14px", fontFamily:"system-ui", color:"#34d399", align:"center",
    }).setOrigin(0.5).setDepth(52);
    this.add.text(W/2 + 70, H/2 + 20, `Takım B\n${result.team_b_score}`, {
      fontSize:"14px", fontFamily:"system-ui", color:"#c084fc", align:"center",
    }).setOrigin(0.5).setDepth(52);

    // Tekrar oyna butonu
    const btn = this.add.text(W/2, H/2 + 80, "Tekrar Oyna", {
      fontSize:"17px", fontFamily:"system-ui", color:"#fff", fontStyle:"bold",
      backgroundColor: "#d4a843", padding: { x:24, y:12 },
    }).setOrigin(0.5).setDepth(52).setInteractive({ useHandCursor: true });

    btn.on("pointerdown", () => {
      overlay.destroy(); panel.destroy();
      if (this.ws?.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({ type: "rematch" }));
      }
    });
  }
}