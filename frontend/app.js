/* global ansicolor, document, findJson, jq, localStorage, m, simpleQuery, WebSocket, window */

"use strict";

/* Event properties
 *
 * id (number): Added automatically when receiving the event. Not generated
 * by the server. Used for keying objects for better tracking of DOM elements.
 * Always set.
 *
 * type (string): Either "system" or "line", representing a system-level
 * message or a log line, respectively. Always set.
 *
 * when (number): When the log line was ingested by the server. This is a time
 * in milliseconds, which is the same as "Date.now()". Always set.
 *
 * content (string): Initially the log line from the server, without the
 * trailing newline. Upon receipt, ANSI sequences are stripped. Always set.
 *
 * contentAnsi (string): If ANSI sequences are detected in the original
 * content, the original version of the content is stored here before the
 * "content" property is cleansed. Only set when the original content had ANSI.
 *
 * jsonMatches (Array/null): When the cleansed content has embedded JSON
 * objects or arrays, each parsable object and array are listed as an object in
 * this array. The object has "start" for the start byte, "end" for the end
 * byte (plus one), and "parsed" for the parsed JSON object. Always set.
 *
 * highlightRanges (Array): Matching functions can create or erase this array
 * of indexes. The indexes are used by the view to show highlighted portions.
 * Example: [[1, 3], [7, 9, "MATCH"]], which indicates that
 * input.substring(1,3) and input.substring(7,9) matched and that the second
 * substring should be replaced with the word "MATCH". The numbers are the
 * start index and the end index (plus one). Only set when there is a filter
 * and it is able to highlight portions of the content. The ranges may
 * overlap and may be out of order.
 */

class App {
    view() {
        return m("div.H(100vh).D(f).Fxd(c)", [
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

        return m(
            "div.Pos(a).T(0).L(0).W(100%).H(100vh).blurBackground.D(f).Ai(c).Jc(c)",
            m(DisconnectedModal)
        );
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

    adjustBufferLines(lines) {
        for (const arr of this.files.values()) {
            while (arr.length > lines) {
                arr.shift();
            }
        }
    }

    openConnection() {
        this.webSocket = new WebSocket(this.url);
        this.webSocket.onopen = () => {
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
                console.debug(
                    "Invalid JSON payload from WebSocket:",
                    event.data
                );
            }
        };
        this.webSocket.onerror = (err) => {
            console.error(err);
            this.webSocket.close();
        };
        this.webSocket.onclose = () => {
            this.open = false;
            this.delay = Math.min(Math.floor(this.delay * 1.5), 30000);
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
            this.uniqueId += 1;

            if (ansicolor.isEscaped(event.content)) {
                event.contentAnsi = event.content;
                event.content = ansicolor.strip(event.contentAnsi);
            }

            event.jsonMatches = findJson(event.content);
        }

        arr.push(...events);

        while (arr.length > state.bufferLines) {
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

class ConfigButton {
    view() {
        return m(
            "div",
            {
                class: "Bgc(--button-background-color) Fz(1.5em) D(f) Jc(c) Ai(c) Bdrs(0.2em) Trsdu(0.2s) Bgc(--hover-button-background-color):h",
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
                class: "W(1em) Fill(--hover-button-text-color) Mx(4px)",
                viewBox: "0 0 512 512",
                xmlns: "http://www.w3.org/2000/svg"
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
            "div.Pos(a).T(0).L(0).W(100%).H(100vh)",
            {
                onclick: () => {
                    state.configPanelOpen = false;

                    return false;
                }
            },
            m(
                "div.Pos(a).T(0).R(0).M(10px).P(10px).Bdw(1px).Bdc(--panel-border-color).Bgc(--panel-background-color)",
                {
                    onclick: () => false
                },
                [
                    this.viewPanelClose(),
                    this.viewAdvancedSearch(),
                    this.viewCaseInsensitiveSearch(),
                    this.viewTimes(),
                    this.viewWrap(),
                    this.viewAnsi(),
                    this.viewBufferLines()
                ]
            )
        );
    }

    viewAdvancedSearch() {
        return m(
            "div",
            m(Toggle, {
                checked: state.advancedSearches,
                label: "Use advanced searches with wildcards and operators",
                onclick: () => {
                    state.advancedSearches = !state.advancedSearches;

                    return false;
                }
            })
        );
    }

    viewAnsi() {
        return m(
            "div",
            m(Toggle, {
                checked: state.showAnsi,
                label: "Show ANSI text in color when not filtering",
                onclick: () => {
                    state.showAnsi = !state.showAnsi;

                    return false;
                }
            })
        );
    }

    viewBufferLines() {
        return m(
            "div", m("label.D(f).Jc(spb)", [
                m("span.Mend(4px)", "Scrollback buffer size"),
                    m("input.W(5em).Ta(end)", {
                        value: state.bufferLines,
                        type: "number",
                        oninput: (event) => {
                            state.bufferLines = +event.target.value;
                            bridge.adjustBufferLines(state.bufferLines);

                            return false;
                        }
                    })
            ]));
    }

    viewPanelClose() {
        return m(
            "div.D(f).Jc(fe)",
            m(
                "div.Cur(p)",
                {
                    onclick: () => {
                        state.configPanelOpen = false;

                        return false;
                    }
                },
                "[ Close ]"
            )
        );
    }

    viewCaseInsensitiveSearch() {
        return m(
            "div",
            m(Toggle, {
                checked: state.caseInsensitiveSearch,
                label: "Case insensitive searches",
                onclick: () => {
                    state.caseInsensitiveSearch = !state.caseInsensitiveSearch;
                    filter.updateFilter();

                    return false;
                }
            })
        );
    }

    viewTimes() {
        return m(
            "div",
            m(Toggle, {
                checked: state.showTimes,
                label: "Show log ingestion times",
                onclick: () => {
                    state.showTimes = !state.showTimes;

                    return false;
                }
            })
        );
    }

    viewWrap() {
        return m(
            "div",
            m(Toggle, {
                checked: state.wrapLines,
                label: "Wrap log lines",
                onclick: () => {
                    state.wrapLines = !state.wrapLines;

                    return false;
                }
            })
        );
    }
}

class DisconnectedModal {
    bar(animationDelay) {
        return m("div", {
            class: `animatedConnectingBar Animdel(${animationDelay})`
        });
    }

    view() {
        return m(
            "div.H(100px).W(340px).D(f).Jc(c).Ai(c).Bdw(1px).Bdc(--panel-border-color).Bgc(--panel-background-color)",
            m("div.H(80px).D(f).Jc(c)", [
                this.bar("0.7s"),
                this.bar("0.6s"),
                this.bar("0.5s"),
                this.bar("0.4s"),
                this.bar("0.3s"),
                this.bar("0.2s"),
                this.bar("0.1s"),
                this.bar("0.0s"),
                this.bar("0.1s"),
                this.bar("0.2s"),
                this.bar("0.3s"),
                this.bar("0.4s"),
                this.bar("0.5s"),
                this.bar("0.6s"),
                this.bar("0.7s")
            ])
        );
    }
}

class Filter {
    constructor() {
        this.text = "";
        this.valid = true;
        this.buildEmptyMatcher();
    }

    applyFilter(events) {
        if (!this.valid || !this.text) {
            return events;
        }

        return events.filter(this.matcher);
    }

    buildAdvancedTextMatcher() {
        if (this.text.trim() === "") {
            this.buildEmptyMatcher();

            return;
        }

        try {
            const query = simpleQuery(this.text, {
                caseInsensitive: state.caseInsensitiveSearch,
                returnPositions: true
            });
            this.matcher = (event) => {
                event.highlightRanges = query(event.content);

                return event.highlightRanges.length > 0;
            };
        } catch (ignore) {
            this.buildFailedMatcher();
        }
    }

    buildEmptyMatcher() {
        this.matcher = (event) => {
            delete event.highlightRanges;

            return true;
        };
    }

    buildFailedMatcher() {
        this.matcher = (event) => {
            delete event.highlightRanges;

            return false;
        };
        this.valid = false;
        setTimeout(() => m.redraw());
    }

    buildJqMatcher() {
        const jqString = this.text.substr(1).trim();

        if (!jqString) {
            this.buildEmptyMatcher();

            return;
        }

        try {
            const ast = jq.parse(jqString);
            this.matcher = (event) => {
                if (!event.jsonMatches) {
                    return false;
                }

                const matches = [];

                for (const obj of event.jsonMatches) {
                    this.matchJq(ast, obj, matches);
                }

                event.highlightRanges = matches;

                return matches.length > 0;
            };
        } catch (ignore) {
            this.buildFailedMatcher();
        }
    }

    buildRegexpMatcher() {
        const patternText = this.text.substr(1, this.text.length - 2);
        const flags = state.caseInsensitiveSearch ? "gi" : "g";

        try {
            const regexp = new RegExp(patternText, flags);
            this.matcher = (event) => {
                event.highlightRanges = this.matchRegexp(regexp, event.content);

                return event.highlightRanges.length > 0;
            };
        } catch (ignore) {
            this.buildFailedMatcher();
        }
    }

    buildTextMatcher() {
        this.matcher = (event) => {
            event.highlightRanges = this.matchText(this.text, event.content);

            return event.highlightRanges.length > 0;
        };
    }

    matchJq(ast, obj, matches) {
        try {
            const result = Array.from(jq.evaluate(ast, [obj.parsed]));

            if (result && result.length) {
                const json = JSON.stringify(result);
                matches.push([
                    obj.start,
                    obj.end,
                    json.substr(1, json.length - 2)
                ]);
            }
        } catch (ignore) {
            return;
        }
    }

    matchRegexp(needle, haystack) {
        let result = needle.exec(haystack);
        const matches = [];

        while (result !== null) {
            if (needle.lastIndex === result.index) {
                return [];
            }

            matches.push([result.index, needle.lastIndex]);
            result = needle.exec(haystack);
        }

        return matches;
    }

    matchText(needle, haystack) {
        if (state.caseInsensitiveSearch) {
            needle = needle.toLowerCase();
            haystack = haystack.toLowerCase();
        }

        const matches = [];
        let start = 0;
        let index = haystack.indexOf(needle);

        while (index >= 0) {
            matches.push([index, index + needle.length]);
            start = index + needle.length + 1;
            index = haystack.indexOf(needle, start);
        }

        return matches;
    }

    setFilter(str) {
        this.text = str.trim();
        this.valid = true;
        this.updateFilter();
    }

    updateFilter() {
        if (
            this.text.charAt(0) === "/" &&
            this.text.charAt(this.text.length - 1) === "/" &&
            this.text.length > 2
        ) {
            this.buildRegexpMatcher();
        } else if (this.text.charAt(0) === "|") {
            this.buildJqMatcher();
        } else if (state.advancedSearches) {
            this.buildAdvancedTextMatcher();
        } else if (this.text.length) {
            this.buildTextMatcher();
        } else {
            this.buildEmptyMatcher();
        }
    }
}

class LogLine {
    consolidateRanges(ranges) {
        ranges.sort((a, b) => a[0] - b[0]);
        let last = ranges.unshift();
        const result = [last];

        for (const range of ranges) {
            if (last[0] <= range[0] && last[1] >= range[0]) {
                last[1] = Math.max(last[1], range[1]);
            } else {
                last = range;
                result.push(last);
            }
        }

        return ranges;
    }

    view(vnode) {
        const event = vnode.attrs.event;

        return m(
            "div.D(f)",
            {
                key: `key${event.id}`
            },
            [this.viewWhen(event), this.viewContent(event)]
        );
    }

    viewContent(event) {
        let elem = "div";

        if (event.type === "system") {
            elem += ".C(--system-message-text-color).Fs(i)";
        }

        if (state.wrapLines) {
            elem += ".Whs(pw).Wob(ba)";
        } else {
            elem += ".Whs(p)";
        }

        if (event.highlightRanges) {
            return m(elem, this.viewHighlight(event));
        }

        if (state.showAnsi && event.contentAnsi) {
            return m(elem, this.viewContentAnsi(event));
        }

        return m(elem, event.content);
    }

    viewContentAnsi(event) {
        const parsed = ansicolor.parse(event.contentAnsi);

        return [...parsed].map((item) =>
            m(
                "span",
                {
                    style: item.css
                },
                item.text
            )
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

    viewHighlight(event) {
        let start = 0;
        const elements = [];

        for (const range of this.consolidateRanges(event.highlightRanges)) {
            elements.push(event.content.substring(start, range[0]));

            if (range.length > 2) {
                elements.push(
                    m(
                        "span.Bgc(--replace-background-color).C(--replace-text-color)",
                        range[2]
                    )
                );
            } else {
                elements.push(
                    m(
                        "span.Bgc(--highlight-background-color).C(--highlight-text-color)",
                        event.content.substring(range[0], range[1])
                    )
                );
            }

            start = range[1];
        }

        elements.push(event.content.substring(start, event.content.length));

        return elements;
    }

    viewWhen(event) {
        if (!state.showTimes) {
            return [];
        }

        return m(
            "div.Fxs(0).Px(4px).C(--timestamp-text-color)",
            this.viewDate(event.when)
        );
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

    emptyResultMessage() {
        return {
            when: Date.now(),
            type: "system",
            content: "No logs match the current filter"
        };
    }

    getLogs() {
        const logs = bridge.files.get(state.filename) || [];

        return filter.applyFilter(logs);
    }

    view() {
        const logs = this.getLogs();

        return m(
            "div.Fxg(1).Ov(a)",
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

    get advancedSearches() {
        return this.readBoolean("advancedSearches");
    }

    set advancedSearches(value) {
        this.writeBoolean("advancedSearches", value);
    }

    get bufferLines() {
        return +localStorage.getItem("bufferLines") || 2000;
    }

    set bufferLines(value) {
        localStorage.setItem("bufferLines", value.toString());
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

class Toggle {
    view(vnode) {
        return m(
            "label.Ai(c).Bdrs(100px).D(f).Fw(700).Us(n)",
            {
                onclick: vnode.attrs.onclick
            },
            [
                this.viewInput(vnode),
                this.viewToggle(),
                vnode.attrs.label
                    ? m(
                          "span",
                          {
                              class: "Mstart(0.4em)"
                          },
                          vnode.attrs.label
                      )
                    : null
            ]
        );
    }

    viewInput(vnode) {
        return m("input.toggleInput", {
            type: "checkbox",
            checked: vnode.attrs.checked,
            onclick: vnode.attrs.onclick
        });
    }

    viewToggle() {
        return m(
            "span",
            {
                class: "toggleTrack Bdw(1px) Bdc(--panel-border-color) Bdrs(100px) Cur(p) D(f) H(1.2em) W(2.4em) Ai(c)"
            },
            m(
                "span",
                {
                    class: "toggleIndicator Ai(c) Bdrs(1.2em) D(f) H(1em) Jc(c) L(0.1em) Ols(s) Olw(0.1em) Olc(tr) Pos(a) Trsdu(0.4s) W(1em) Bgc(--toggle-not-active-color)"
                },
                m(
                    "div",
                    {
                        class: "checkmark Fill(--toggle-checkmark-color) H(0.8em) W(0.8em) Op(0) Trsdu(0.4s) D(f) Ai(c) Jc(c)"
                    },
                    m(
                        "svg",
                        {
                            viewBox: "0 0 24 24",
                            role: "resentation",
                            "aria-hidden": "true",
                            class: "H(100%) W(100%)"
                        },
                        m("path", {
                            d: "M9.86 18a1 1 0 01-.73-.32l-4.86-5.17a1.001 1.001 0 011.46-1.37l4.12 4.39 8.41-9.2a1 1 0 111.48 1.34l-9.14 10a1 1 0 01-.73.33h-.01z"
                        })
                    )
                )
            )
        );
    }
}

class Toolbar {
    view() {
        return m(
            "div.W(100%).Bgc(--panel-background-color).P(5px).H(35px).D(f).Fxs(0).Ai(c)",
            [
                this.viewFileList(),
                this.viewGap(),
                this.viewFilter(),
                this.viewGap(),
                this.viewToggleCaseSensitivity(),
                this.viewGap(),
                this.viewConfigButton()
            ]
        );
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
            "select.Ff(--monospace).Lh(26px).Fz(13px).C(--hover-button-text-color).Bxsh(2px,2px,2px,0px,--toolbar-shadow-color).Bgc(--button-background-color).Fs(0)",
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
        const extra = filter.valid
            ? "Bgc(--button-background-color) Bgc(--hover-button-background-color):h"
            : "Bgc(--invalid-filter-background-color) Bgc(--hover-invalid-filter-background-color):h";
        const searchPlaceholder = state.advancedSearches
            ? "Search using wildcards and operators"
            : "Search for an exact string";

        return m("input", {
            id: "initialFocus",
            class: `Ff(--monospace) C(--hover-button-text-color) P(4px) Fxg(1) Trsdu(0.2s) ${extra}`,
            value: state.filter,
            placeholder: `${searchPlaceholder}, use a /regex/, or |jq`,
            oninput: (event) => {
                state.filter = event.target.value;
                filter.setFilter(event.target.value);
            }
        });
    }

    viewGap() {
        return m("div", {
            class: "W(0.4em)"
        });
    }

    viewToggleCaseSensitivity() {
        return m(Toggle, {
            checked: state.caseInsensitiveSearch,
            label: "A=a",
            onclick: () => {
                state.caseInsensitiveSearch = !state.caseInsensitiveSearch;
                filter.updateFilter();

                return false;
            }
        });
    }
}

let bridge;
let state;
let filter;

window.addEventListener("load", () => {
    document.getElementsByTagName("body")[0].classList.remove("fade");
    filter = new Filter();
    state = new State();
    bridge = new Bridge();
    bridge.watching.add(state.filename);
    m.mount(document.body, App);
    setTimeout(() => document.getElementById("initialFocus").focus());
});
