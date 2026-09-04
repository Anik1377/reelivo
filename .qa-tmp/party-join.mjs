import { io } from "socket.io-client";
const socket = io("http://localhost:3003", { transports: ["polling", "websocket"] });
const room = process.argv[2];
socket.on("connect", () => {
  socket.emit("party:join", { room, name: "GuestBot" }, (res) => {
    console.log("JOIN_ACK", JSON.stringify(res));
    socket.emit("party:chat", { room, text: "guest bot in the house" });
  });
});
socket.on("party:chat", (m) => console.log("CHAT", JSON.stringify(m)));
socket.on("party:presence", (p) => console.log("PRESENCE", JSON.stringify(p)));
socket.on("party:start", (p) => console.log("START", JSON.stringify(p)));
setTimeout(() => process.exit(0), 8000);
