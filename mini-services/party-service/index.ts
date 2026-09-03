/**
 * Reelivo watch-party service — an independent bun + socket.io mini-service.
 *
 * Port 3003 (NEVER 3000 — the Next dev server owns it). The public gateway
 * (Caddy) forwards anything carrying the `XTransformPort` query param to this
 * port, so the browser client connects with `io("/?XTransformPort=3003")` and
 * the repo's websocket example conventions (server path "/", open CORS).
 *
 * Protocol
 *   IN   party:create (ack {room})                    → mint a 6-char room id
 *   IN   party:join {room, name} (ack {ok, members, messages, host} | {ok:false, error})
 *   IN   party:chat {room, text}                      → ≤280 chars, sanitized
 *   IN   party:start {room, at}                       → HOST-ONLY roll call broadcast
 *   IN   party:leave
 *   OUT  party:joined {name} · party:chat {from, text, at, sid}
 *        party:start {at} · party:presence {count, names}
 *
 * State is in-memory only (no persistence): rooms keep the last 50 chat
 * messages + member map, expire after 2h without activity (swept every 60s),
 * and cap at 8 members. The extra `sid` field on chat messages lets the
 * sender's client right-align its own bubbles even after a reconnect mints a
 * new socket id (clients also match by display name as a fallback).
 */

import { createServer } from "node:http";
import { Server, type Socket } from "socket.io";

const PORT = 3003;

/* ------------------------------- room model ------------------------------- */

interface PartyMessage {
  from: string;
  text: string;
  at: number;
  sid: string;
}

interface PartyRoom {
  id: string;
  host: string | null; // socket id of the creator (promoted on departure)
  members: Map<string, string>; // socketId → display name
  messages: PartyMessage[]; // last MESSAGE_CAP, oldest first
  lastActive: number;
}

const rooms = new Map<string, PartyRoom>();
const socketRoom = new Map<string, string>(); // socketId → roomId

const MAX_MEMBERS = 8;
const MESSAGE_CAP = 50;
const ROOM_TTL_MS = 2 * 60 * 60 * 1000; // 2h idle expiry
const NAME_CAP = 20;
const CHAT_CAP = 280;

/** 6-char A–Z0-9 codes minus the look-alikes (I/L/O/0/1) so codes read out
 * cleanly on a couch. Still a subset of the spec'd A-Z0-9 alphabet. */
const ID_CHARS = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

function newRoomId(): string {
  let id = "";
  do {
    id = Array.from(
      { length: 6 },
      () => ID_CHARS[Math.floor(Math.random() * ID_CHARS.length)]
    ).join("");
  } while (rooms.has(id)); // collision is vanishingly rare, but never reuse
  return id;
}

/** Strip control characters, collapse whitespace, hard-cap length. Chat is
 * rendered as React text on the client (never HTML), so this is about junk
 * hygiene rather than XSS. */
function sanitizeText(raw: unknown, cap: number): string {
  if (typeof raw !== "string") return "";
  return raw
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, cap);
}

function sanitizeName(raw: unknown): string {
  return sanitizeText(raw, NAME_CAP) || "Guest";
}

function memberList(room: PartyRoom): string[] {
  return [...room.members.values()];
}

function presenceOf(room: PartyRoom): { count: number; names: string[] } {
  return { count: room.members.size, names: memberList(room) };
}

function touch(room: PartyRoom): void {
  room.lastActive = Date.now();
}

/* --------------------------------- server --------------------------------- */

const httpServer = createServer();

const io = new Server(httpServer, {
  // DO NOT change the path, it is used by Caddy to forward the request to the correct port
  path: "/",
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
  pingTimeout: 60000,
  pingInterval: 25000,
});

function leaveRoom(socket: Socket, roomId: string): void {
  socketRoom.delete(socket.id);
  socket.leave(roomId);
  const room = rooms.get(roomId);
  if (!room) return;
  if (!room.members.has(socket.id)) return;
  room.members.delete(socket.id);
  touch(room);
  if (room.host === socket.id) {
    // keep the room functional: earliest remaining member becomes host
    room.host = room.members.size > 0 ? [...room.members.keys()][0] : null;
  }
  io.to(roomId).emit("party:presence", presenceOf(room));
  // Empty rooms linger until the idle sweep so a quick rejoin still gets history.
}

io.on("connection", (socket) => {
  socket.on("party:create", (done?: (res: { room: string }) => void) => {
    const room: PartyRoom = {
      id: newRoomId(),
      host: socket.id,
      members: new Map(),
      messages: [],
      lastActive: Date.now(),
    };
    rooms.set(room.id, room);
    if (typeof done === "function") done({ room: room.id });
  });

  socket.on(
    "party:join",
    (
      payload: { room?: unknown; name?: unknown } | undefined,
      done?: (res:
        | { ok: true; members: string[]; messages: PartyMessage[]; host: boolean }
        | { ok: false; error: "not-found" | "room-full" }) => void
    ) => {
      const ack = typeof done === "function" ? done : () => {};
      const roomId =
        typeof payload?.room === "string" ? payload.room.trim().toUpperCase() : "";
      const room = rooms.get(roomId);
      if (!room) {
        ack({ ok: false, error: "not-found" });
        return;
      }
      // one room per socket — silently move over if they were elsewhere
      const prev = socketRoom.get(socket.id);
      if (prev && prev !== roomId) leaveRoom(socket, prev);
      if (!room.members.has(socket.id) && room.members.size >= MAX_MEMBERS) {
        ack({ ok: false, error: "room-full" });
        return;
      }
      const name = sanitizeName(payload?.name);
      const isNew = !room.members.has(socket.id);
      room.members.set(socket.id, name);
      socketRoom.set(socket.id, roomId);
      socket.join(roomId);
      touch(room);
      ack({
        ok: true,
        members: memberList(room),
        messages: [...room.messages],
        host: room.host === socket.id,
      });
      if (isNew) {
        socket.to(roomId).emit("party:joined", { name });
        io.to(roomId).emit("party:presence", presenceOf(room));
      }
    }
  );

  socket.on("party:chat", (payload: { room?: unknown; text?: unknown } | undefined) => {
    const roomId = socketRoom.get(socket.id);
    if (!roomId || payload?.room !== roomId) return;
    const room = rooms.get(roomId);
    if (!room || !room.members.has(socket.id)) return;
    const text = sanitizeText(payload?.text, CHAT_CAP);
    if (!text) return;
    const msg: PartyMessage = {
      from: room.members.get(socket.id) ?? "Guest",
      text,
      at: Date.now(),
      sid: socket.id,
    };
    room.messages.push(msg);
    if (room.messages.length > MESSAGE_CAP) {
      room.messages.splice(0, room.messages.length - MESSAGE_CAP);
    }
    touch(room);
    io.to(roomId).emit("party:chat", msg);
  });

  socket.on("party:start", (payload: { room?: unknown; at?: unknown } | undefined) => {
    const roomId = socketRoom.get(socket.id);
    if (!roomId || payload?.room !== roomId) return;
    const room = rooms.get(roomId);
    if (!room || room.host !== socket.id) return; // roll call is host-only
    const at =
      typeof payload?.at === "number" && Number.isFinite(payload.at)
        ? payload.at
        : Date.now() + 3000;
    touch(room);
    io.to(roomId).emit("party:start", { at }); // includes the host itself
  });

  socket.on("party:leave", () => {
    const roomId = socketRoom.get(socket.id);
    if (roomId) leaveRoom(socket, roomId);
  });

  socket.on("disconnect", () => {
    const roomId = socketRoom.get(socket.id);
    if (roomId) leaveRoom(socket, roomId);
  });
});

httpServer.listen(PORT, () => {
  console.log(`Watch-party service listening on :${PORT}`);
});

/* Idle sweep — rooms die after 2h without any join/chat/start/leave activity. */
setInterval(() => {
  const now = Date.now();
  for (const [id, room] of rooms) {
    if (now - room.lastActive > ROOM_TTL_MS) {
      rooms.delete(id);
      for (const [sid, rid] of socketRoom) {
        if (rid === id) socketRoom.delete(sid);
      }
      console.log(`Swept idle room ${id}`);
    }
  }
}, 60_000);

process.on("SIGTERM", () => {
  httpServer.close(() => process.exit(0));
});
process.on("SIGINT", () => {
  httpServer.close(() => process.exit(0));
});
