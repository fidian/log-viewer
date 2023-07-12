/* global document, m, WebSocket, window */
"use strict";

class DisconnectedModal {
    view() {
        return m("div.disconnectedModal", m("div.connecting", [
            m("div.step8"),
            m("div.step7"),
            m("div.step6"),
            m("div.step5"),
            m("div.step4"),
            m("div.step3"),
            m("div.step2"),
            m("div.step1"),
            m("div.step2"),
            m("div.step3"),
            m("div.step4"),
            m("div.step5"),
            m("div.step6"),
            m("div.step7"),
            m("div.step8")
        ]));
    }
}

class App {
    view() {
        return [m("div.app", "works"), this.viewDisconnectedModal()];
    }

    viewDisconnectedModal() {
        if (bridge.open) {
            return [];
        }

        return m("div.disconnected", m(DisconnectedModal));
    }
}

class Bridge {
    constructor() {
        this.url = document.location.toString().replace(/^http/, "ws");
        this.open = false;
        this.files = {};
        this.openConnection();
        this.delay = 500;
    }

    openConnection() {
        console.log("Attempting to open a socket");
        this.webSocket = new WebSocket(this.url);
        this.webSocket.onopen = () => {
            console.log("Socket opened");
            this.open = true;

            // Reset files on open because it looks better having logs in the
            // background when trying to reconnect to the server.
            this.files = {};
            this.rerender();
            this.delay = 500;
        };
        this.webSocket.onmessage = (event) => {
            try {
                this.receiveMessage(JSON.parse(event.data));
                this.rerender();
            } catch (ignore) {
                console.log("Invalid JSON payload from WebSocket:", event.data);
            }
        };
        this.webSocket.onerror = (err) => {
            console.error(err);
            this.webSocket.close();
        };
        this.webSocket.onclose = () => {
            this.open = false;
            console.log("Socket closed");
            this.delay = Math.min(Math.floor(this.delay * 1.5), 30000);
            console.log(`Delaying ${this.delay}ms`);
            this.rerender();
            setTimeout(() => {
                this.openConnection();
            }, this.delay);
        };
    }

    receiveMessage(message) {
        switch (message.type) {
            case "add":
                this.receiveMessageAdd(message.path);
                break;

            case "remove":
                this.receiveMessageRemove(message.path);
                break;

            case "update":
                this.receiveMessageUpdate(message.path, message.events);
                break;
        }
    }

    receiveMessageAdd(path) {
        this.files[path] = [];
    }

    receiveMessageRemove(path) {
        delete this.files[path];
    }

    receiveMessageUpdate(path, events) {
        const arr = this.files[path];
        arr.push(...events);

        while (arr.length > 2000) {
            arr.shift();
        }
    }

    rerender() {
        if (this.rerenderTimeout) {
            return;
        }

        this.rerenderTimeout = setTimeout(() => {
            this.rerenderTimeout = null;
            console.log("rerender");
            m.redraw();
        });
    }
}

let bridge;

window.addEventListener("load", () => {
    document.getElementsByTagName("body")[0].classList.remove("fade");
    bridge = new Bridge();
    m.mount(document.body, App);
});
