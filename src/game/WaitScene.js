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
    this.started = false;
    this.queue = [];      // GameScene açılana kadar gelen mesajlar (aşağıya bkz.)
    this.preQueue = data.queue || [];   // LobbyScene'den, bu sahne açılmadan gelenler
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
    const handle = (msg) => {
      console.log("WaitScene msg:", msg.type, msg);

      if (msg.type === "room_full") {
        if (msg.players) this.players = msg.players;
      }

      if (msg.type === "game_started") {
        if (msg.players) this.players = msg.players;
      }

      // GameScene'e yalnız BİR KEZ, ilk game_state ile geç (backend game_started'dan hemen sonra gönderir).
      // Eskiden her mesajda scene.start çağrılıyordu: sahne art arda yeniden başlıyor, eski durum yenisinin
      // üstüne çizilebiliyordu.
      // Sahne geçişi bir sonraki karede olur; sekme arka plandaysa tarayıcı Phaser döngüsünü durdurur ve GameScene
      // sekme öne gelene kadar açılmaz. Bu arada gelen mesajlar (sonraki durumlar, tur sonu) atılmamalı: kuyruğa
      // alınır, GameScene açılınca sırayla işler. Eskiden atılıyordu: arka plandaki sekme ilk (boş masa) durumda
      // kalıyordu, sıra ona gelince oyun takılıyordu.
      if (this.started) {
        this.queue.push(msg);
        return;
      }
      if (msg.type === "game_state" && !this.started) {
        this.started = true;
        if (msg.players) this.players = msg.players;
        this.scene.start("GameScene", {
          ws:         this.ws,
          name:       this.name,
          slot:       this.slot,
          roomId:     this.roomId,
          players:    this.players,
          firstState: msg,
          queue:      this.queue,
        });
      }
    };
    this.ws.onmessage = (ev) => handle(JSON.parse(ev.data));
    const pre = this.preQueue.splice(0);
    for (const m of pre) handle(m);
  }
}
