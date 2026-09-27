import Phaser from "phaser";
import { GameScene } from "./game/GameScene";
import { LobbyScene } from "./game/LobbyScene";
import { WaitScene } from "./game/WaitScene";

const config = {
  type: Phaser.AUTO,
  width: window.innerWidth,
  height: window.innerHeight,
  backgroundColor: "#0a120a",
  parent: "game-container",
  scene: [LobbyScene, WaitScene, GameScene],
  scale: {
    mode: Phaser.Scale.RESIZE,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  render: {
    antialias: true,
    pixelArt: false,
  },
};

const game = new Phaser.Game(config);

// Pencere boyutu değişince yeniden boyutlandır
window.addEventListener("resize", () => {
  game.scale.resize(window.innerWidth, window.innerHeight);
});