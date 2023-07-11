"use strict";

const ws = require("ws");

let wss = null;

module.exports = {
    attach(server, tailTracker) {
        wss = new ws.WebSocketServer({
            server: server
        });

        wss.on("connection", (wsClient) => {
            wsClient.isAlive = true;
            wsClient.on("pong", () => {
                wsClient.isAlive = true;
            });
            wsClient.on("error", console.error);
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

        tailTracker.eventEmitter.on('add', (data) => {
            this.broadcast({
                type: 'add',
                path: data.path
            });
        });
        tailTracker.eventEmitter.on('update', (data) => {
            this.broadcast({
                type: "update",
                path: data.path,
                events: data.events
            });
        });
        tailTracker.eventEmitter.on('remove', (data) => {
            this.broadcast({
                type: 'remove',
                path: data.path
            });
        });
    },

    broadcast(message) {
        const str = JSON.stringify(message);
        console.log(str);
        wss.clients.forEach(function each(wsClient) {
            if (wsClient.readyState === ws.WebSocket.OPEN) {
                wsClient.send(str);
            }
        });
    },

    initialize(wsClient, tailTracker) {
        for (const info of tailTracker.fileInfo.values()) {
            wsClient.send(JSON.stringify({
                type: 'add',
                path: info.path
            }));
            wsClient.send(JSON.stringify({
                type: 'events',
                path: info.path,
                events: info.events
            }));
        }
    }
};
