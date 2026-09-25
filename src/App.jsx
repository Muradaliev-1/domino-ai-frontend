import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

// Backend URL ve Socket konfigürasyonunuz (Kendi URL'inizi buraya yazabilirsiniz)
const BACKEND_URL = process.env.REACT_APP_BACKEND_URL || 'wss://domino-ai-backend.onrender.com/ws';

// --- 1. SİYAH NOKTALAR (PIPS) BİLEŞENİ ---
const PipGrid = ({ count }) => {
  const pipPositions = {
    0: [],
    1: [4],
    2: [2, 6],
    3: [2, 4, 6],
    4: [0, 2, 6, 8],
    5: [0, 2, 4, 6, 8],
    6: [0, 2, 3, 5, 6, 8]
  };

  const activePips = pipPositions[count] || [];

  return (
    <div className="w-full h-10 grid grid-cols-3 grid-rows-3 p-1 place-items-center">
      {Array.from({ length: 9 }).map((_, i) => (
        <div key={i} className="w-full h-full flex items-center justify-center">
          {activePips.includes(i) && (
            <span 
              className="w-2.5 h-2.5 rounded-full bg-[#111111]"
              style={{
                boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.9), 0 0.5px 1px rgba(255,255,255,0.8)'
              }}
            />
          )}
        </div>
      ))}
    </div>
  );
};

// --- 2. VİDEODAKİ TAŞ GÖRÜNÜMÜ VE AKICI YERLEŞİM BİLEŞENİ ---
const DominoTile = ({ top, bottom, x, y, rotation, onClick, isPlayable, isBoardTile }) => {
  return (
    <motion.div
      onClick={onClick}
      initial={isBoardTile ? { scale: 0.4, opacity: 0, y: y + 40 } : false}
      animate={{ 
        x, 
        y, 
        rotate: rotation, 
        scale: 1, 
        opacity: 1 
      }}
      transition={{
        type: 'spring',
        stiffness: 230,
        damping: 19,
        mass: 0.8
      }}
      className={`absolute w-12 h-24 rounded-lg bg-[#f9f7f0] border border-[#cfc8b8] flex flex-col justify-between p-1 select-none cursor-pointer ${
        isPlayable ? 'ring-4 ring-amber-400 shadow-[0_0_15px_rgba(251,191,36,0.6)]' : ''
      }`}
      style={{
        boxShadow: 'inset 0 1px 2px rgba(255,255,255,0.9), 0 8px 18px rgba(0,0,0,0.35)',
        transformOrigin: 'center center'
      }}
    >
      <PipGrid count={top} />
      <div 
        className="w-full h-[2px] bg-[#b0a793] my-0.5 rounded-full"
        style={{ boxShadow: 'inset 0 1px 1px rgba(0,0,0,0.4), 0 1px 0 rgba(255,255,255,0.8)' }}
      />
      <PipGrid count={bottom} />
    </motion.div>
  );
};

// --- 3. ANA OYUN BİLEŞENİ (BACKEND ENTEGRASYONLU) ---
export default function DominoGame({ socket, roomId, userId }) {
  // Backend'den gelen veriler için state'ler
  const [handTiles, setHandTiles] = useState([]);
  const [boardTiles, setBoardTiles] = useState([]);
  const [isMyTurn, setIsMyTurn] = useState(false);

  // Kıvrılma (S-Curve) ve Pozisyon Hesaplayıcı
  const [layoutState, setLayoutState] = useState({
    rightEnd: { x: 0, y: 0, dir: 'RIGHT' },
    leftEnd: { x: 0, y: 0, dir: 'LEFT' },
    maxRowWidth: 260
  });

  // --- BACKEND DINLEME VE VERI ALMA (EFFECT) ---
  useEffect(() => {
    if (!socket) return;

    // Backend'den oyun durumu güncellendiğinde
    socket.on('gameStateUpdate', (data) => {
      // Backend'den gelen masadaki taş dizisini alıp görsel pozisyonlarını hesaplıyoruz
      if (data.board) {
        processBoardLayout(data.board);
      }
      if (data.hand) {
        setHandTiles(data.hand);
      }
      setIsMyTurn(data.currentTurnUserId === userId);
    });

    return () => {
      socket.off('gameStateUpdate');
    };
  }, [socket, userId]);

  // Backend'den gelen hamle verisini ekrandaki yılan (S-Curve) dizilimine çeviren fonksiyon
  const processBoardLayout = (rawBoard) => {
    let currentX = 0;
    let currentY = 0;
    let currentDir = 'RIGHT';
    const maxW = 260;

    const formattedBoard = rawBoard.map((tile, index) => {
      if (index === 0) {
        return {
          ...tile,
          x: 0,
          y: 0,
          rotation: tile.top === tile.bottom ? 0 : 90
        };
      }

      let rotation = 90;
      if (tile.top === tile.bottom) rotation = 0;

      if (currentDir === 'RIGHT') {
        if (currentX > maxW) {
          currentDir = 'DOWN';
          currentY += 90;
          rotation = 0;
        } else {
          currentX += 90;
        }
      } else if (currentDir === 'DOWN') {
        currentDir = 'LEFT';
        currentX -= 90;
        rotation = 90;
      } else if (currentDir === 'LEFT') {
        if (currentX < -maxW) {
          currentDir = 'DOWN_LEFT';
          currentY += 90;
          rotation = 0;
        } else {
          currentX -= 90;
        }
      }

      return {
        ...tile,
        x: currentX,
        y: currentY,
        rotation
      };
    });

    setBoardTiles(formattedBoard);
  };

  // --- HAMLE YAPMA (BACKEND'E ISTEK GONDERME) ---
  const handlePlayTile = (tile, side = 'RIGHT') => {
    if (!isMyTurn) return;

    // Direct olarak Backend Endpoint'e / Socket'e hamle isteği atılır
    if (socket) {
      socket.emit('playTile', {
        roomId,
        userId,
        tileId: tile.id,
        side // Taşın konulacağı uç ('LEFT' veya 'RIGHT')
      });
    } else {
      // Örnek HTTP Fetch Kullanımı (Socket yerine REST API kullanıyorsanız):
      fetch(`${BACKEND_URL}/api/game/play`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roomId, userId, tileId: tile.id, side })
      }).catch((err) => console.error("Backend isteği başarısız:", err));
    }
  };

  // Taş sayısı arttıkça masayı otomatik küçülten Zoom-Out oranı
  const boardScale = Math.max(0.55, 1 - boardTiles.length * 0.025);

  return (
    <div className="w-full h-screen bg-[#0d3b1e] flex flex-col items-center justify-between overflow-hidden relative font-sans select-none">
      
      {/* Yeşil Keçe Masa Arka Planı */}
      <div 
        className="absolute inset-0 pointer-events-none"
        style={{
          background: 'radial-gradient(circle at center, #1b5e20 0%, #082713 85%)'
        }}
      />

      {/* --- MASA ALANI --- */}
      <div className="w-full h-full flex items-center justify-center relative">
        <motion.div
          animate={{ scale: boardScale }}
          transition={{ type: 'spring', stiffness: 150, damping: 20 }}
          className="relative w-0 h-0 flex items-center justify-center"
        >
          <AnimatePresence>
            {boardTiles.map((tile) => (
              <DominoTile
                key={tile.id || `${tile.top}-${tile.bottom}-${tile.x}`}
                top={tile.top}
                bottom={tile.bottom}
                x={tile.x}
                y={tile.y}
                rotation={tile.rotation}
                isBoardTile={true}
              />
            ))}
          </AnimatePresence>
        </motion.div>
      </div>

      {/* --- OYUNCU ELİ (ALT PANEL) --- */}
      <div className="w-full pb-8 z-10 flex flex-col items-center">
        <div className="text-white/80 text-xs mb-2 tracking-wider font-semibold">
          {isMyTurn ? "SIRA SİZDE - OYNAMAK İÇİN TAŞA TIKLAYIN" : "RAKİBİN HAMLESİ BEKLENİYOR..."}
        </div>

        <div className="flex items-center gap-2 bg-black/40 backdrop-blur-md p-3 rounded-2xl border border-white/10 shadow-2xl max-w-[95vw] overflow-x-auto">
          {handTiles.map((tile) => (
            <div 
              key={tile.id} 
              className="relative w-12 h-24 flex-shrink-0"
              onClick={() => handlePlayTile(tile)}
            >
              <DominoTile
                top={tile.top}
                bottom={tile.bottom}
                x={0}
                y={0}
                rotation={0}
                isPlayable={isMyTurn}
                isBoardTile={false}
              />
            </div>
          ))}
        </div>
      </div>

    </div>
  );
}