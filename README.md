# Domino (demo arayüzü)

Azerbaycan dominosu: 2 insan (P1, P3) + 2 yapay zekâ (P2, P4), 101 puanlık maç. Backend: `domino-ai-backend` (FastAPI + WebSocket).

TypeScript + Vite, çatısız DOM/CSS (Phaser yok). PWA olarak telefona kurulur; ileride aynı kod Capacitor ile iOS/Android uygulaması olur.

## Mimari
- `src/net.ts`: tek WebSocket, yeniden bağlanma (üstel bekleme), sekmeye özel jeton (`joined.token`, `?token=`)
- `src/model.ts`: sunucu mesajı → model (saf `reduce`), iyimser hamle + hata gelirse geri alma
- `src/view.ts`: tek `render(model)`. Taşlar kalıcı, kimlikli DOM öğeleri; animasyon önceki → yeni konum farkından, yarıda kesilirse görünen ara konumdan devam eder. Arka plandaki sekmede animasyonsuz, doğrudan son durum
- `src/layout.ts`: yılan dizilim (saf; kenarda döner, çift taşlar enine, yerleşen taş kıpırdamaz). Dikey ekranda ana eksen dikey
- `src/drag.ts`: Pointer Events ile sürükle-bırak (mıknatıs, uç parlaması, ele geri kayma) ve dokunarak oynama
- `src/geometry.ts`: pencereden koltuk/masa/el yerleşimi

## Komutlar
```
npm install
npm run dev        # VITE_WS_URL (.env.development: ws://localhost:8000/ws) ya da ?ws=ws://host/ws
npm run build      # tsc + vite build → dist/
npm test           # birim testleri (vitest)
npm run e2e        # uçtan uca: gerçek backend (../backend) + Vite + Microsoft Edge (Playwright, channel msedge)
```
Üretimde WebSocket adresi `VITE_WS_URL` (Vercel ortam değişkeni) ya da varsayılan Render adresi.
