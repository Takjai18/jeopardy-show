# 🎯 智奪風雲 Jeopardy!

跨團契破冰問答。主持用大螢幕揀題同裁決，團友掃 QR Code 用手機搶答。同一個 4 位房號可以同步分數、Daily Double 同 Final 押注。

## 檔案

- `public/index.html` — 主持版面、手機搶答、音效、題庫編輯器。正式版已經冇「下載部署包」按鈕。
- `worker.js` — 每個房號一個 SQLite Durable Object。WebSocket 路徑係 `/ws`。
- `wrangler.jsonc` — Cloudflare Workers 設定，靜態檔同搶答後端同一條網址。

## 本地

```bash
CI=1 npx --yes wrangler@4 dev
```

## 部署

```bash
CI=1 npx --yes wrangler@4 deploy
```

線上網址：https://jeopardy-show.ymtwill.workers.dev/

大螢幕直接開上面嘅網址。撳「QR Code」，手機掃碼會帶 `?room=` 同 `?role=player`。
