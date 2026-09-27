import Phaser from "phaser";

export class WaitScene extends Phaser.Scene {
  constructor() {
    super({ key: "WaitScene" });
  }

  init(data) {
    this.ws     = data.ws;
    this.name   = data.name;
    this.roomId = data.roomId;
    this.slot   = data.slot;
    this.wsUrl  = data.wsUrl;
  }

  create() {
    const W = this.scale.width;
    const H = this.scale.height;

    const bg = this.add.graphics();
    bg.fillGradientStyle(0x0a1a0a, 0x0a1a0a, 0x1a3a1a, 0x1a3a1a, 1);
    bg.fillRect(0, 0, W, H);

    this.add.text(W / 2, H * 0.35, "⏳", { fontSize: "64px" }).setOrigin(0.5);

    this.add.text(W / 2, H * 0.46, "Oda Kodu:", {
      fontSize: "16px", color: "#7a8070", fontFamily: "system-ui",
    }).setOrigin(0.5);

    this.add.text(W / 2, H * 0.52, this.roomId.toUpperCase(), {
      fontSize: "32px", color: "#d4a843", fontFamily: "monospace", fontStyle: "bold",
      letterSpacing: 8,
    }).setOrigin(0.5);

    this.add.text(W / 2, H * 0.60, "Arkadaşını bekliyor...", {
      fontSize: "16px", color: "#7a8070", fontFamily: "system-ui",
    }).setOrigin(0.5);

    this.add.text(W / 2, H * 0.65, "Bu kodu arkadaşınla paylaş", {
      fontSize: "14px", color: "#4ade80", fontFamily: "system-ui",
    }).setOrigin(0.5);

    // WebSocket mesajlarını dinle
    this.ws.onmessage = (ev) => {
      const msg = JSON.parse(ev.data);

      if (msg.type === "room_full" || msg.type === "game_started") {
        if (msg.type === "game_started") {
          this.scene.start("GameScene", {
            ws:       this.ws,
            name:     this.name,
            slot:     this.slot,
            roomId:   this.roomId,
            players:  msg.players || {},
          });
        }
      }
    };

    // Nokta animasyonu
    let dots = 0;
    this.time.addEvent({
      delay: 500,
      loop:  true,
      callback: () => {
        dots = (dots + 1) % 4;
      },
    });
  }
}
