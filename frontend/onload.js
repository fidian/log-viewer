/* global document, m, window */
"use strict";

class App {
    // FIXME - add/remove "fade" class when there is no socket connection
    view() {
        return m("h1", "works");
    }
}

window.addEventListener("load", () => {
    document.getElementsByTagName("body")[0].classList.remove("fade");
    m.mount(document.body, App);
});
