import express from "express";
import http from "http";
import { WebSocketServer } from "ws";

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

const clients = new Map();

console.log('hello world');

wss.on("connection", (ws) => {
  let clientId = null;
  let role = null;

  ws.on("message", (message) => {
    let msg;
    try {
      msg = JSON.parse(message.toString());
    } catch {
      console.log("[SERVER]: Invalid message received.");
      return;
    }

    if (msg.type === "sender" || msg.type === "receiver") {
      clientId = msg.id;
      role = msg.role;
      if (!clients.has(clientId)) clients.set(clientId, {});
      clients.get(clientId)[role] = ws;

      console.log(`[SERVER]: ${role.toUpperCase()} connected. ID: ${clientId}`);

      if (clients.get(clientId).sender && clients.get(clientId).receiver) {
        clients.get(clientId).sender.send(JSON.stringify({ type: "receiver-connected" }));
        console.log(`[SERVER]: Notified sender that receiver is connected (ID: ${clientId})`);
      }
    }

    if (msg.type === "offer" && clients.get(clientId)?.receiver) {
      clients.get(clientId).receiver.send(JSON.stringify({ type: "offer", offer: msg.offer }));
      console.log(`[SERVER]: Forwarded offer from sender to receiver (ID: ${clientId})`);
    }

    if (msg.type === "answer" && clients.get(clientId)?.sender) {
      clients.get(clientId).sender.send(JSON.stringify({ type: "answer", answer: msg.answer }));
      console.log(`[SERVER]: Forwarded answer from receiver to sender (ID: ${clientId})`);
    }

    if (msg.type === "ice-candidate") {
      const target = msg.target === "receiver" ? "receiver" : "sender";
      if (clients.get(clientId)?.[target]) {
        clients.get(clientId)[target].send(JSON.stringify({
          type: "ice-candidate",
          candidate: msg.candidate
        }));
        console.log(`[SERVER]: Relayed ICE candidate to ${target} (ID: ${clientId})`);
      }
    }

    if (msg.type === "start-transfer" && clients.get(clientId)?.sender) {
      clients.get(clientId).sender.send(JSON.stringify({ type: "start-transfer" }));
      console.log(`[SERVER]: Informed sender to start transfer (ID: ${clientId})`);
    }

    if (msg.type === "ping") {
      ws.lastPing = Date.now();
    }
  });

  ws.lastPing = Date.now();

  const interval = setInterval(() => {
    if (Date.now() - ws.lastPing > 5000) {
      console.log(`[SERVER]: Connection timeout. Cleaning up for ID: ${clientId}`);

      if (clients.has(clientId)) {
        const peer = clients.get(clientId);

        if (role === "receiver" && peer?.sender) {
          peer.sender.send(JSON.stringify({ type: "receiver-disconnected" }));
        }
        if (role === "sender" && peer?.receiver) {
          peer.receiver.send(JSON.stringify({ type: "sender-disconnected" }));
        }

        clients.delete(clientId);
        console.log(`[SERVER]: Removed client ID: ${clientId}`);
      }

      clearInterval(interval);
      ws.terminate();
    }
  }, 2000);
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`[SERVER]: Server running on port ${PORT}`);
});
