/**
 * Party-service protocol smoke test — two socket.io clients through the
 * Caddy gateway (http://localhost:81/?XTransformPort=3003 form), exactly the
 * network path the browser uses. Run: bun .qa-tmp/party-protocol-smoke.ts
 */
import { io, type Socket } from "socket.io-client";

const URL = "http://localhost:81/?XTransformPort=3003";
const log: string[] = [];
const ok = (m: string) => { log.push(`OK  ${m}`); console.log(`OK  ${m}`); };
const bad = (m: string) => { log.push(`BAD ${m}`); console.log(`BAD ${m}`); };
const assert = (cond: boolean, m: string) => (cond ? ok(m) : bad(m));

function connect(name: string): Promise<Socket> {
  return new Promise((resolve, reject) => {
    const s = io(URL, {
      transports: ["websocket", "polling"],
      forceNew: true,
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
      timeout: 10000,
    });
    const t = setTimeout(() => reject(new Error(`${name} connect timeout`)), 12000);
    s.on("connect", () => { clearTimeout(t); resolve(s); });
    s.on("connect_error", (e) => { clearTimeout(t); reject(e); });
  });
}

interface JoinAck {
  ok: boolean;
  members?: string[];
  messages?: { from: string; text: string; at: number; sid?: string }[];
  host?: boolean;
  error?: string;
}

async function main() {
  const A = await connect("A");
  const B = await connect("B");
  assert(A.connected && B.connected, "both clients connected via gateway (websocket/polling)");

  // ---- create ----
  const room: string = await new Promise((res) => {
    A.emit("party:create", (r: { room: string }) => res(r.room));
  });
  assert(/^[A-Z0-9]{6}$/.test(room), `create ack returns 6-char code (${room})`);

  // ---- join A + B ----
  const joinedB: JoinAck = await new Promise((res) => {
    B.emit("party:join", { room, name: "Bee" }, (r: JoinAck) => res(r));
  });
  assert(joinedB.ok === true && joinedB.members?.length === 1, `B joins empty room, members=${JSON.stringify(joinedB.members)}`);
  assert(joinedB.host === false, "B (joiner, not creator) is NOT host");

  const joinedA: JoinAck = await new Promise((res) => {
    A.emit("party:join", { room, name: "Ay" }, (r: JoinAck) => res(r));
  });
  assert(joinedA.ok === true && joinedA.members?.length === 2, `A joins, members=${JSON.stringify(joinedA.members)}`);
  assert(joinedA.host === true, "A (creator) is host");

  // ---- presence on join ----
  const sawPresence = await new Promise<{ count?: number; names?: string[] }>((res) => {
    const h = (p: { count?: number; names?: string[] }) => { B.off("party:presence", h); res(p); };
    B.on("party:presence", h);
    const s2 = io(URL, { transports: ["polling"], forceNew: true });
    s2.on("connect", () => s2.emit("party:join", { room, name: "Cee" }, () => setTimeout(() => s2.disconnect(), 200)));
    setTimeout(() => res({}), 4000);
  });
  assert(sawPresence.count === 3, `presence count=3 broadcast to room (${sawPresence.count})`);

  // ---- chat both directions ----
  const gotOnB = new Promise<{ from: string; text: string; sid?: string }>((res) => B.once("party:chat", res));
  A.emit("party:chat", { room, text: "hello from A" });
  const m1 = await gotOnB;
  assert(m1.text === "hello from A" && m1.from === "Ay" && !!m1.sid, "B receives A's chat with from+sid");

  const gotOnA = new Promise<{ from: string; text: string; sid?: string }>((res) => {
    const h = (m: { from: string; text: string; sid?: string }) => { if (m.from === "Bee") { A.off("party:chat", h); res(m); } };
    A.on("party:chat", h);
  });
  B.emit("party:chat", { room, text: "hi A — Bee here 🎬" });
  const m2 = await gotOnA;
  assert(m2.text === "hi A — Bee here 🎬" && m2.from === "Bee", "A receives B's chat");
  const echoedOwn = await new Promise<{ from: string; sid?: string }>((res) => {
    const h = (m: { from: string; text: string; sid?: string }) => { if (m.text === "echo test") { A.off("party:chat", h); res(m); } };
    A.on("party:chat", h);
    A.emit("party:chat", { room, text: "echo test" });
  });
  assert(echoedOwn.from === "Ay" && !!echoedOwn.sid, "server echoes own chat back (client own-bubble styling relies on this)");

  // ---- chat cap + junk ----
  const gotLong = new Promise<{ text: string }>((res) => {
    const h = (m: { text: string }) => { if (m.text.length > 100) { B.off("party:chat", h); res(m); } };
    B.on("party:chat", h);
  });
  A.emit("party:chat", { room, text: "x".repeat(400) });
  const m3 = await gotLong;
  assert(m3.text.length === 280, `400-char chat clamped to 280 (got ${m3.text.length})`);

  // ---- history on rejoin ----
  const hist: JoinAck = await new Promise((res) => {
    const s3 = io(URL, { transports: ["polling"], forceNew: true });
    s3.on("connect", () => s3.emit("party:join", { room, name: "Dee" }, (r: JoinAck) => { res(r); s3.disconnect(); }));
  });
  assert(hist.ok === true && hist.messages?.length === 4, `join ack carries chat history (4 msgs, got ${hist.messages?.length})`);

  // ---- roll call host-only ----
  const startOnA3 = new Promise<{ at: number }>((res) => A.once("party:start", res));
  B.emit("party:start", { room, at: Date.now() + 3000 }); // B is NOT host → must be dropped
  const dropped = await Promise.race([
    startOnA3,
    new Promise<"none">((res) => setTimeout(() => res("none"), 1200)),
  ]);
  assert(dropped === "none", "non-host party:start is dropped by server");

  // B is... host is A actually (creator). Check: A emits start → all receive.
  const startOnA2 = new Promise<{ at: number }>((res) => A.once("party:start", res));
  const startOnB2 = new Promise<{ at: number }>((res) => B.once("party:start", res));
  A.emit("party:start", { room, at: Date.now() + 3000 });
  const [sa, sb] = await Promise.all([startOnA2, startOnB2]);
  assert(!!sa?.at && !!sb?.at, "host A's party:start broadcast to every member incl. host itself");

  // ---- leave ----
  B.emit("party:leave");
  const pres = await new Promise<{ count?: number; names?: string[] }>((res) => {
    A.once("party:presence", (p) => res(p));
  });
  // transient sockets (Cee/Dee) already dropped on disconnect; after B leaves only A remains
  assert(pres.count === 1, `presence drops to 1 after B leaves + transient disconnects (${pres.count})`);

  // ---- junk join ----
  const junk: JoinAck = await new Promise((res) => {
    const s4 = io(URL, { transports: ["polling"], forceNew: true });
    s4.on("connect", () => s4.emit("party:join", { room: "ZZZZZZ", name: "X" }, (r: JoinAck) => { res(r); s4.disconnect(); }));
  });
  assert(junk.ok === false && junk.error === "not-found", "junk code → ok:false not-found");

  A.disconnect(); B.disconnect();
  const fails = log.filter((l) => l.startsWith("BAD")).length;
  console.log(fails === 0 ? "\nALL PASS" : `\n${fails} FAILURES`);
  process.exit(fails === 0 ? 0 : 1);
}

main().catch((e) => { console.error("FATAL", e); process.exit(1); });
