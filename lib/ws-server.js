"use strict";

const ws = require("ws");

let wss = null;

module.exports = {
    attach(server, tailTracker) {
        wss = new ws.WebSocketServer({
            server: server,
            perMessageDeflate: {
                zlibDeflateOptions: {
                    chunkSize: 1024,
                    memLevel: 7,
                    level: 3
                },
                zlibInflateOptions: {
                    chunkSize: 10 * 1024
                },
                clientNoContextTakeover: true,
                serverNoContextTakeover: true,
                serverMaxWindowBits: 10,
                concurrencyLimit: 10,
                threshold: 1024
            }
        });

        wss.on("connection", (wsClient) => {
            wsClient.isAlive = true;
            wsClient.on("pong", () => {
                wsClient.isAlive = true;
            });
            wsClient.on("error", (err) => {
                console.error(err);
            });
            this.initialize(wsClient, tailTracker);
        });

        const interval = setInterval(() => {
            wss.clients.forEach((wsClient) => {
                if (wsClient.isAlive === false) {
                    return wsClient.terminate();
                }

                wsClient.isAlive = false;
                wsClient.ping();
            });
        }, 30000);

        wss.on("close", () => {
            clearInterval(interval);
        });

        tailTracker.eventEmitter.on("add", (data) => {
            this.broadcast({
                type: "add",
                path: data.path
            });
        });
        tailTracker.eventEmitter.on("update", (data) => {
            this.broadcast({
                type: "update",
                path: data.path,
                events: data.events
            });
        });
        tailTracker.eventEmitter.on("remove", (data) => {
            this.broadcast({
                type: "remove",
                path: data.path
            });
        });
    },

    broadcast(message) {
        const str = JSON.stringify(message);
        wss.clients.forEach(function each(wsClient) {
            if (wsClient.readyState === ws.WebSocket.OPEN) {
                wsClient.send(str);
            }
        });
    },

    initialize(wsClient, tailTracker) {
        for (const tail of Object.values(tailTracker.tails)) {
            wsClient.send(
                JSON.stringify({
                    type: "add",
                    path: tail.path
                })
            );
            wsClient.send(
                JSON.stringify({
                    type: "update",
                    path: tail.path,
                    events: tail.events
                })
            );
        }
    }
};
