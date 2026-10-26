import { DurableObject } from "cloudflare:workers";

const RELAY_TYPES = new Set([
  "STATE_SYNC",
  "REQUEST_STATE",
  "PLAYER_BUZZ",
  "PLAYER_MC_CHOICE",
  "PLAYER_FINAL_SUBMIT",
]);

const MAX_STATE_CHARS = 100000;

function roomName(raw) {
  const clean = String(raw || "").replace(/[^A-Za-z0-9]/g, "").slice(0, 12);
  return clean || "0000";
}

export class JeopardyRoom extends DurableObject {
  async fetch(request) {
    if (request.headers.get("Upgrade") !== "websocket") {
      return new Response("Expected WebSocket", { status: 426 });
    }

    const url = new URL(request.url);
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment({
      role: url.searchParams.get("role") === "host" ? "host" : "player",
      room: roomName(url.searchParams.get("room")),
    });

    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws, message) {
    let data;
    try {
      const text = typeof message === "string" ? message : new TextDecoder().decode(message);
      if (!text || text.length > MAX_STATE_CHARS) return;
      data = JSON.parse(text);
    } catch {
      return;
    }
    if (!data || typeof data.type !== "string" || !RELAY_TYPES.has(data.type)) return;

    const attachment = ws.deserializeAttachment() || {};
    const role = attachment.role === "host" ? "host" : "player";

    if (data.type === "STATE_SYNC") {
      if (role !== "host") return;
      if (!data.state || typeof data.state !== "object" || Array.isArray(data.state)) return;
      const rev = Number(data.state.rev);
      if (!Number.isFinite(rev)) return;
      let raw;
      try {
        raw = JSON.stringify(data.state);
      } catch {
        return;
      }
      if (!raw || raw.length > MAX_STATE_CHARS) return;

      const stored = await this.ctx.storage.get("game");
      const prevRev = stored && Number.isFinite(Number(stored.rev)) ? Number(stored.rev) : -1;
      if (rev < prevRev) return;

      data.state.roomCode = attachment.room || roomName(data.state.roomCode);
      await this.ctx.storage.put("game", data.state);
      this.relay(ws, { type: "STATE_SYNC", state: data.state });
      return;
    }

    if (data.type === "REQUEST_STATE") {
      const stored = await this.ctx.storage.get("game");
      if (stored) {
        try {
          ws.send(JSON.stringify({ type: "STATE_SYNC", state: stored }));
        } catch {
          // The socket can close between the request and the reply.
        }
      }
      this.relay(ws, { type: "REQUEST_STATE" });
      return;
    }

    const teamIdx = Number(data.teamIdx);
    if (!Number.isInteger(teamIdx) || teamIdx < 0 || teamIdx > 5) return;
    const outbound = { type: data.type, teamIdx };
    if (data.type === "PLAYER_BUZZ") outbound.playerName = String(data.playerName || "").slice(0, 24);
    if (data.type === "PLAYER_MC_CHOICE") outbound.choice = String(data.choice || "").slice(0, 80);
    if (data.type === "PLAYER_FINAL_SUBMIT") {
      const wager = Number(data.wager);
      outbound.wager = Number.isFinite(wager) ? Math.max(0, Math.min(1000000, Math.floor(wager))) : 0;
      outbound.answer = String(data.answer || "").slice(0, 200);
    }
    this.relay(ws, outbound);
  }

  relay(sender, payload) {
    const raw = JSON.stringify(payload);
    for (const sock of this.ctx.getWebSockets()) {
      if (sock === sender) continue;
      try {
        sock.send(raw);
      } catch {
        // A closed socket is dropped by the runtime.
      }
    }
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/ws") {
      if (request.headers.get("Upgrade") !== "websocket") {
        return new Response("Expected WebSocket", { status: 426 });
      }
      const room = roomName(url.searchParams.get("room"));
      return env.JEOPARDY_ROOM.getByName(room).fetch(request);
    }
    return env.ASSETS.fetch(request);
  },
};
