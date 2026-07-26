// Deliberately dumb loopback bridge: one HTTP route per SDK call, one WS
// stream for events. All logic lives on the Python side (docs/branch-b.md).
import { createServer, IncomingMessage, ServerResponse } from "node:http";
import { WebSocketServer, WebSocket } from "ws";
import { FakePhoton, createRealPhoton, PhotonLayer } from "./photon.js";

const PORT = Number(process.env.SIDECAR_PORT ?? 8787);
const HAS_CREDS =
  Boolean(process.env.SPECTRUM_PROJECT_ID && process.env.SPECTRUM_PROJECT_SECRET) ||
  Boolean(process.env.IMESSAGE_TOKEN);
const FAKE = process.env.SIDECAR_FAKE === "1" || !HAS_CREDS;

const sockets = new Set<WebSocket>();

async function main() {
  const fake = new FakePhoton();
  const photon: PhotonLayer = FAKE ? fake : await createRealPhoton();
  console.log(`[sidecar] photon layer: ${FAKE ? "FAKE (no line)" : "REAL"}`);

  photon.onEvent((e) => {
    const payload = JSON.stringify(e);
    for (const ws of sockets) if (ws.readyState === WebSocket.OPEN) ws.send(payload);
  });

  const server = createServer(async (req, res) => {
    try {
      const body = await readJson(req);
      const route = `${req.method} ${req.url?.split("?")[0]}`;
      const query = new URL(req.url ?? "/", "http://x").searchParams;

      switch (route) {
        case "GET /health":
          return json(res, { ok: true, photon: FAKE ? "fake" : "real" });
        case "POST /chats/direct":
          return json(res, await photon.createChat([body.handle]));
        case "POST /chats/group":
          return json(res, await photon.createChat(body.handles));
        case "POST /messages/text":
          await photon.sendText(body.chatId, body.text);
          return json(res, { ok: true });
        case "POST /chats/typing":
          await photon.setTyping(body.chatId, body.on);
          return json(res, { ok: true });
        case "POST /messages/card": {
          // Rich card best-effort; guaranteed text fallback so the beat lands.
          const text = `${body.card.title}\n${body.card.body}${body.card.url ? `\n${body.card.url}` : ""}`;
          if (FAKE) fake.sent.push({ kind: "card", chatId: body.chatId, text });
          else await photon.sendText(body.chatId, text);
          return json(res, { ok: true });
        }
        case "POST /messages/image":
          await photon.sendImage(body.chatId, body.path);
          return json(res, { ok: true });
        case "POST /messages/celebrate":
          await photon.celebrate(body.chatId, body.text, body.name, body.backgroundPath);
          return json(res, { ok: true });
        case "POST /messages/voice":
          await photon.sendVoice(body.chatId, body.path);
          return json(res, { ok: true });
        case "POST /messages/file":
          await photon.sendFile(body.chatId, body.path);
          return json(res, { ok: true });
        case "POST /polls":
          return json(res, await photon.createPoll(body.chatId, body.question, body.options));
        case "GET /addresses/check":
          return json(res, { imessage: await photon.isIMessageAvailable(query.get("handle") ?? "") });
        // ---- fake-mode-only test hooks ----
        case "GET /_fake/sent":
          return FAKE ? json(res, fake.sent) : notFound(res);
        case "POST /_fake/inbound":
          if (!FAKE) return notFound(res);
          fake.inject({ type: "message", handle: body.handle, chatId: body.chatId, text: body.text });
          return json(res, { ok: true });
        case "POST /_fake/pollVote":
          if (!FAKE) return notFound(res);
          fake.inject({ type: "pollVote", handle: body.handle, pollId: body.pollId, optionIndex: body.optionIndex });
          return json(res, { ok: true });
        default:
          return notFound(res);
      }
    } catch (err) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: String(err) }));
    }
  });

  const wss = new WebSocketServer({ server, path: "/events" });
  wss.on("connection", (ws) => {
    sockets.add(ws);
    ws.on("close", () => sockets.delete(ws));
  });

  server.listen(PORT, "127.0.0.1", () => console.log(`[sidecar] listening on 127.0.0.1:${PORT}`));
}

function readJson(req: IncomingMessage): Promise<any> {
  return new Promise((resolve) => {
    let data = "";
    req.on("data", (c) => (data += c));
    req.on("end", () => {
      try {
        resolve(data ? JSON.parse(data) : {});
      } catch {
        resolve({});
      }
    });
  });
}

function json(res: ServerResponse, payload: unknown) {
  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify(payload));
}

function notFound(res: ServerResponse) {
  res.writeHead(404, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ error: "not found" }));
}

main();
