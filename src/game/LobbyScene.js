import Phaser from "phaser";

const WS_URL = import.meta.env.VITE_WS_URL || "ws://localhost:8000/ws";

export class LobbyScene extends Phaser.Scene {
  constructor() {
    super({ key: "LobbyScene" });
  }

  create() {
    const W = this.scale.width;
    const H = this.scale.height;

    // Arka plan gradyanı
    const bg = this.add.graphics();
    bg.fillGradientStyle(0x0a1a0a, 0x0a1a0a, 0x1a3a1a, 0x1a3a1a, 1);
    bg.fillRect(0, 0, W, H);

    // Logo
    this.add.text(W / 2, H * 0.28, "🁣", {
      fontSize: "72px",
    }).setOrigin(0.5);

    this.add.text(W / 2, H * 0.38, "Domino AI", {
      fontSize: "38px",
      fontFamily: "system-ui",
      color: "#d4a843",
      fontStyle: "bold",
    }).setOrigin(0.5);

    this.add.text(W / 2, H * 0.44, "2 İnsan (Takım A) vs 2 Agent (Takım B)", {
      fontSize: "16px",
      fontFamily: "system-ui",
      color: "#7a8070",
    }).setOrigin(0.5);

    // İsim input — HTML overlay kullanıyoruz
    const input = document.createElement("input");
    input.placeholder = "Adını gir...";
    input.id = "name-input";
    input.style.cssText = `
      position: fixed;
      left: 50%; top: ${H * 0.52}px;
      transform: translateX(-50%);
      width: 280px; padding: 13px 16px;
      font-size: 16px; border-radius: 10px;
      background: rgba(255,255,255,0.08);
      border: 1px solid rgba(255,255,255,0.15);
      color: #f0ece0; outline: none;
      font-family: system-ui;
      box-sizing: border-box;
      z-index: 100;
    `;
    document.body.appendChild(input);
    input.focus();

    // Giriş butonu
    const btnBg = this.add.graphics();
    const btnX = W / 2, btnY = H * 0.62;
    const drawBtn = (hover) => {
      btnBg.clear();
      btnBg.fillStyle(hover ? 0xc09030 : 0xd4a843, 1);
      btnBg.fillRoundedRect(btnX - 140, btnY - 24, 280, 48, 10);
    };
    drawBtn(false);

    const btnText = this.add.text(btnX, btnY, "Oyuna Gir", {
      fontSize: "17px",
      fontFamily: "system-ui",
      color: "#fff",
      fontStyle: "bold",
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });

    btnText.on("pointerover",  () => drawBtn(true));
    btnText.on("pointerout",   () => drawBtn(false));
    btnText.on("pointerdown",  () => this.connect(input));
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") this.connect(input);
    });

    // WebSocket referansını global tut
    this.wsUrl = WS_URL;
  }

  connect(input) {
    const name = input.value.trim();
    if (!name) return;

    // Input'u temizle
    input.remove();

    // WebSocket bağlantısı
    const ws = new WebSocket(`${this.wsUrl}/${encodeURIComponent(name)}`);

    ws.onopen = () => {
      console.log("WS connected");
    };

    ws.onmessage = (ev) => {
      const msg = JSON.parse(ev.data);

      if (msg.type === "joined") {
        this.scene.start("WaitScene", {
          ws,
          name,
          roomId: msg.room_id,
          slot:   msg.slot,
          wsUrl:  this.wsUrl,
        });
      }
    };

    ws.onerror = () => {
      this.add.text(this.scale.width / 2, this.scale.height * 0.72,
        "Bağlantı hatası! Backend çalışıyor mu?", {
          fontSize: "14px", color: "#f87171", fontFamily: "system-ui",
        }).setOrigin(0.5);
    };
  }
}
