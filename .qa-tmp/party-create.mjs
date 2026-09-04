import { io } from "socket.io-client";
const socket = io("http://localhost:3003", { transports: ["polling", "websocket"] });
socket.on("connect", () => {
  socket.emit("party:create", (res) => {
    console.log("CREATE_ACK", JSON.stringify(res));
    if (res?.room) socket.emit("party:join", { room: res.room, name: "Creator" }, (j) => {
      console.log("JOIN_ACK", JSON.stringify(j));
      socket.close(); process.exit(0);
    });
  });
});
setTimeout(() => { console.log("TIMEOUT"); process.exit(1); }, 8000);
