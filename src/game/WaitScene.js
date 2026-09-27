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
    this.players = {};
  }

  create() {
    const W = this.scale.width;
    const H = this.scale.height;

    const bg = this.add.graphics();
    bg.fillGradientStyle(0x0a1a0a, 0x0a1a0a, 0x1a3a1a, 0x1a3a1a, 1);
    bg.fillRect(0, 0, W, H);

    this.add.text(W / 2, H * 0.35, "⏳", { fontSize: "64px" }).setOrigin(0.5);

    this.add.text(W / 2, H * 0.46, "Oda Kodu:", {
      fontSize: "16px", fontFamily: "system-ui", color: "#7a8070",
    }).setOrigin(0.5);

    this.add.text(W / 2, H * 0.52, this.roomId.toUpperCase(), {
      fontSize: "32px", fontFamily: "monospace", color: "#d4a843", fontStyle: "bold",
    }).setOrigin(0.5);

    this.add.text(W / 2, H * 0.60, "Arkadaşını bekliyor...", {
      fontSize: "16px", fontFamily: "system-ui", color: "#7a8070",
    }).setOrigin(0.5);

    this.add.text(W / 2, H * 0.65, "Bu kodu arkadaşınla paylaş", {
      fontSize: "14px", fontFamily: "system-ui", color: "#4ade80",
    }).setOrigin(0.5);

    // Tüm mesaj tiplerini yakala
    this.ws.onmessage = (ev) => {
      const msg = JSON.parse(ev.data);
      console.log("WaitScene msg:", msg.type, msg);

      if (msg.type === "room_full") {
        if (msg.players) this.players = msg.players;
      }

      if (msg.type === "game_started") {
        if (msg.players) this.players = msg.players;
        this.scene.start("GameScene", {
          ws:      this.ws,
          name:    this.name,
          slot:    this.slot,
          roomId:  this.roomId,
          players: this.players,
        });
      }

      // game_state gelirse de geç (bazen game_started'dan önce gelebilir)
      if (msg.type === "game_state") {
        this.scene.start("GameScene", {
          ws:         this.ws,
          name:       this.name,
          slot:       this.slot,
          roomId:     this.roomId,
          players:    this.players,
          firstState: msg,
        });
      }
    };
  }
}