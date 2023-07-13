/* global ansicolor, document, localStorage, m, WebSocket, window */
"use strict";

class App {
    view() {
        return m("div.app", [
            this.viewToolbar(),
            this.viewLogs(),
            this.viewConfigPanel(),
            this.viewDisconnectedModal()
        ]);
    }

    viewConfigPanel() {
        if (!state.configPanelOpen) {
            return [];
        }

        return m(ConfigPanel);
    }

    viewDisconnectedModal() {
        if (bridge.open) {
            return [];
        }

        return m("div.appDisconnected", m(DisconnectedModal));
    }

    viewLogs() {
        return m(Logs);
    }

    viewToolbar() {
        return m(Toolbar);
    }
}

class Bridge {
    constructor() {
        this.url = document.location.toString().replace(/^http/, "ws");
        this.open = false;
        this.watching = new Set();
        this.files = new Map();
        this.openConnection();
        this.delay = 500;
        this.uniqueId = 0;
    }

    openConnection() {
        console.log("Attempting to open a socket");
        this.webSocket = new WebSocket(this.url);
        this.webSocket.onopen = () => {
            console.log("Socket opened");
            this.open = true;

            // Reset files on open because it looks better having logs in the
            // background when trying to reconnect to the server.
            this.files = new Map();
            this.rerender();
            this.delay = 500;
        };
        this.webSocket.onmessage = (event) => {
            try {
                this.receiveMessage(JSON.parse(event.data));
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
        this.files.set(path, []);
        this.rerender();
    }

    receiveMessageRemove(path) {
        this.files.delete(path);
        this.watching.delete(path);
        this.rerender();
    }

    receiveMessageUpdate(path, events) {
        const arr = this.files.get(path);

        if (!arr) {
            return;
        }

        for (const event of events) {
            event.id = this.uniqueId;

            if (ansicolor.isEscaped(event.content)) {
                event.contentAnsi = event.content;
                event.content = ansicolor.strip(event.contentAnsi);
            }

            this.uniqueId += 1;
        }

        arr.push(...events);

        while (arr.length > 2000) {
            arr.shift();
        }

        if (this.watching.has(path)) {
            this.rerender();
        }
    }

    rerender() {
        if (this.rerenderTimeout) {
            return;
        }

        this.rerenderTimeout = setTimeout(() => {
            this.rerenderTimeout = null;
            m.redraw();
        });
    }
}

class Checkbox {
    view(vnode) {
        if (vnode.attrs.checked) {
            return m("span.checkbox.checked", "☑");
        }

        return m("span.checkbox", "☐");
    }
}

class ConfigButton {
    view() {
        return m(
            "div.configButton",
            {
                onclick: () => {
                    state.configPanelOpen = true;

                    return false;
                }
            },
            this.viewSvg()
        );
    }

    viewSvg() {
        return m(
            "svg",
            {
                xmlns: "http://www.w3.org/2000/svg",
                viewBox: "0 0 512 512"
            },
            m("path", {
                d: "M507.73 109.1c-2.24-9.03-13.54-12.09-20.12-5.51l-74.36 74.36-67.88-11.31-11.31-67.88 74.36-74.36c6.62-6.62 3.43-17.9-5.66-20.16-47.38-11.74-99.55.91-136.58 37.93-39.64 39.64-50.55 97.1-34.05 147.2L18.74 402.76c-24.99 24.99-24.99 65.51 0 90.5 24.99 24.99 65.51 24.99 90.5 0l213.21-213.21c50.12 16.71 107.47 5.68 147.37-34.22 37.07-37.07 49.7-89.32 37.91-136.73zM64 472c-13.25 0-24-10.75-24-24 0-13.26 10.75-24 24-24s24 10.74 24 24c0 13.25-10.75 24-24 24z"
            })
        );
    }
}

class ConfigPanel {
    view() {
        return m(
            "div.configPanelBackdrop",
            {
                onclick: () => {
                    state.configPanelOpen = false;

                    return false;
                }
            },
            m("div.configPanel", [
                this.viewPanelClose(),
                this.viewCaseInsensitiveSearch(),
                this.viewTimes(),
                this.viewWrap(),
                this.viewAnsi()
            ])
        );
    }

    viewAnsi() {
        return m(
            "div.configPanelLine",
            {
                onclick: () => {
                    state.showAnsi = !state.showAnsi;

                    return false;
                }
            },
            [
                m(Checkbox, {
                    checked: state.showAnsi
                }),
                " Show ANSI text in color"
            ]
        );
    }

    viewPanelClose() {
        return m(
            "div.configPanelClose.configPanelLine",
            {
                onclick: () => {
                    state.configPanelOpen = false;

                    return false;
                }
            },
            "[X]"
        );
    }

    viewCaseInsensitiveSearch() {
        return m(
            "div.configPanelLine",
            {
                onclick: () => {
                    state.caseInsensitiveSearch = !state.caseInsensitiveSearch;

                    return false;
                }
            },
            [
                m(Checkbox, {
                    checked: state.caseInsensitiveSearch
                }),
                " Case insensitive searches"
            ]
        );
    }

    viewTimes() {
        return m(
            "div.configPanelLine",
            {
                onclick: () => {
                    state.showTimes = !state.showTimes;

                    return false;
                }
            },
            [
                m(Checkbox, {
                    checked: state.showTimes
                }),
                " Show log ingestion times"
            ]
        );
    }

    viewWrap() {
        return m(
            "div.configPanelLine",
            {
                onclick: () => {
                    state.wrapLines = !state.wrapLines;

                    return false;
                }
            },
            [
                m(Checkbox, {
                    checked: state.wrapLines
                }),
                " Wrap log lines"
            ]
        );
    }
}

class DisconnectedModal {
    view() {
        return m(
            "div.disconnectedModal",
            m("div.connecting", [
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
            ])
        );
    }
}

class LogLine {
    view(vnode) {
        const event = vnode.attrs.event;

        return m("div.logEntry", {
            key: `key${event.id}`
        }, [
            this.viewWhen(event),
            this.viewContent(event)
        ]);
    }

    viewContent(event) {
        let elem = "div.log";

        if (state.wrapLines) {
            elem += ".wrap";
        }

        if (event.type === "system") {
            elem += ".system";
        }

        if (!state.showAnsi || !event.contentAnsi) {
            return m(elem, event.content);
        }

        return m(elem, this.viewContentAnsi(event));
    }

    viewContentAnsi(event) {
        const parsed = ansicolor.parse(event.contentAnsi);

        return [...parsed].map((item) =>
            m("span", {
                style: item.css
            }, item.text)
        );
    }

    viewDate(n) {
        const d = new Date(n);
        const pad = (x, p) => {
            return `${x + Math.pow(10, p)}`.substr(-p);
        };

        return `${d.getFullYear()}-${pad(d.getMonth() + 1, 2)}-${pad(
            d.getDate(),
            2
        )} ${pad(d.getHours(), 2)}:${pad(d.getMinutes(), 2)}:${pad(
            d.getSeconds(),
            2
        )}.${pad(d.getMilliseconds(), 3)}`;
    }

    viewWhen(event) {
        if (!state.showTimes) {
            return [];
        }

        return m("div.when", this.viewDate(event.when));
    }
}

class Logs {
    onupdate(vnode) {
        if (this.atBottom) {
            vnode.dom.scrollTop =
                vnode.dom.scrollHeight - vnode.dom.clientHeight;
        }
    }

    onbeforeupdate(vnode, old) {
        const dom = old.dom;

        if (dom) {
            this.atBottom =
                Math.ceil(dom.scrollTop) >=
                dom.scrollHeight - dom.clientHeight - 2;
        } else {
            this.atBottom = true;
        }
    }

    filterLogsRegexp(pattern, logs) {
        const flags = state.caseInsensitiveSearch ? "i" : "";

        try {
            const patternText = pattern.substr(1, pattern.length - 2);
            const regexp = new RegExp(patternText, flags);

            return logs.filter((event) => regexp.test(event.content));
        } catch (ignore) {
            return this.filterLogsPlain(pattern, logs);
        }
    }

    filterLogsPlain(text, logs) {
        if (state.caseInsensitiveSearch) {
            text = text.toLowerCase();

            return logs.filter(
                (event) => event.content.toLowerCase().indexOf(text) >= 0
            );
        }

        return logs.filter((event) => event.content.indexOf(text) >= 0);
    }

    getLogs() {
        const logs = bridge.files.get(state.filename) || [];
        const filter = state.filter;

        if (!filter) {
            return logs;
        }

        if (
            filter.charAt(0) === "/" &&
            filter.charAt(filter.length - 1) === "/"
        ) {
            return this.filterLogsRegexp(filter, logs);
        }

        return this.filterLogsPlain(filter, logs);
    }

    view() {
        const logs = this.getLogs();

        return m(
            "div.logs",
            logs.map((event) => {
                return m(LogLine, {
                    event
                });
            })
        );
    }
}

class State {
    constructor() {
        this.atBottom = true;
    }

    get caseInsensitiveSearch() {
        return this.readBoolean("caseInsensitiveSearch");
    }

    set caseInsensitiveSearch(value) {
        this.writeBoolean("caseInsensitiveSearch", value);
    }

    get configPanelOpen() {
        return this.readBoolean("configPanelOpen");
    }

    set configPanelOpen(value) {
        this.writeBoolean("configPanelOpen", value);
    }

    get filename() {
        return localStorage.getItem("filename");
    }

    set filename(value) {
        localStorage.setItem("filename", value);
    }

    get filter() {
        return localStorage.getItem("filter");
    }

    set filter(value) {
        localStorage.setItem("filter", value);
    }

    get showAnsi() {
        return this.readBoolean("showAnsi");
    }

    set showAnsi(value) {
        this.writeBoolean("showAnsi", value);
    }

    get showTimes() {
        return this.readBoolean("showTimes");
    }

    set showTimes(value) {
        this.writeBoolean("showTimes", value);
    }

    get wrapLines() {
        return this.readBoolean("wrapLines");
    }

    set wrapLines(value) {
        this.writeBoolean("wrapLines", value);
    }

    readBoolean(key) {
        return !!localStorage.getItem(key);
    }

    writeBoolean(key, value) {
        if (value) {
            localStorage.setItem(key, "1");
        } else {
            localStorage.removeItem(key);
        }
    }
}

class Toolbar {
    view() {
        return m("div.toolbar", [
            this.viewFileList(),
            this.viewFilter(),
            this.viewConfigButton()
        ]);
    }

    viewConfigButton() {
        return m(ConfigButton);
    }

    viewFileList() {
        const keys = [...bridge.files.keys()];
        keys.sort();
        const options = keys.map((key) =>
            m(
                "option",
                {
                    value: key,
                    selected: state.filename === key
                },
                key
            )
        );

        if (!keys.includes(state.filename)) {
            options.unshift(m("option", { value: "", selected: true }));
        }

        return m(
            "select.fileList",
            {
                value: state.filename,
                onchange: (event) => {
                    state.filename = event.target.value;
                    bridge.watching.clear();
                    bridge.watching.add(state.filename);
                }
            },
            options
        );
    }

    viewFilter() {
        return m("input.filter", {
            value: state.filter,
            placeholder: "Search for text or use a /regex/",
            oninput: (event) => {
                state.filter = event.target.value;
            }
        });
    }
}

let bridge;
let state;

window.addEventListener("load", () => {
    document.getElementsByTagName("body")[0].classList.remove("fade");
    state = new State();
    bridge = new Bridge();
    bridge.watching.add(state.filename);
    m.mount(document.body, App);
});
