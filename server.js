"use strict";

const httpServer = require("./lib/http-server");
const neodoc = require("neodoc");
const TailTracker = require("./lib/tail-tracker");
const watcher = require("./lib/watcher");
const wsServer = require("./lib/ws-server");

function usage() {
    return `Log Viewer - Watch logs live in a browser. Similar to "tail -f",
except with WebSockets.

Usage:
    log-viewer [options] FILE...

FILE is either a filename, a directory, or a glob. You may specify as many as
you like. Files are all resolved from the current working directory, which is
different from the --index option.

Options:
    --buffer=LINES  Number of lines to buffer for each file. When the UI
                    connects, these lines are sent for the initial load of the
                    page. [default: 2000]
    --expire=MIN    Keep deleted files for this many minutes before removing
                    them from memory. [default: 10]
    --help          Display this help message.
    --index=FILE    This is the one file that the server is able to serve.
                    When starting with "/", it is root-relative. When starting
                    with ".", it is relative to the current working directory.
                    Otherwise it defaults to the script's folder. This single
                    file is served regardless of the URL.
                    [default: index.html]
    --poll          Enable polling instead of monitoring filesystem events.
    --port=PORT     Specify the HTTP server's port. If proxied, the proxy must
                    support upgrading to a WebSocket. [default: 8888]
    --quiet         Suppress log messages.`;
}

const args = neodoc.run(usage(), {
    laxPlacement: true
});
const filePath = httpServer.filePath(__dirname, args["--index"]);

if (!args["--quiet"]) {
    console.log("Starting server using configuration:");
    console.log(args);
    console.log(`Single static file: ${filePath}`);
}

const tailTracker = new TailTracker(args["--expire"], args["--buffer"]);
watcher.watch(args.FILE, args["--poll"], tailTracker);
const server = httpServer.makeServer(filePath);
wsServer.attach(server, tailTracker);
server.listen(args["--port"]);

if (!args["--quiet"]) {
    console.log(`Opened server on port: ${args["--port"]}`);
}
