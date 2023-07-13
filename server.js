#!/usr/bin/env node

"use strict";

const httpServer = require("./lib/http-server");
const neodoc = require("neodoc");
const TailTracker = require("./lib/tail-tracker");
const Watcher = require("./lib/watcher");
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
    --frontend=DIR  Location where all frontend files are stored. This is a
                    very simple static file server and does not support
                    folders. If there's a request without a filename (such
                    as "/") then this will serve "index.html". When the
                    directory starts with "/", it is root-relative. When
                    starting with ".", it is relative to the current
                    working directory. Otherwise it defaults to the
                    script's folder. [default: frontend]
    --poll          Enable polling instead of monitoring filesystem events.
    --port=PORT     Specify the HTTP server's port. If proxied, the proxy must
                    support upgrading to a WebSocket. [default: 8888]
    --quiet         Suppress log messages.`;
}

const args = neodoc.run(usage(), {
    laxPlacement: true
});
const dirPath = httpServer.dirPath(__dirname, args["--frontend"]);

if (!args["--quiet"]) {
    console.log("Starting server using configuration:");
    console.log(args);
    console.log(`Frontend file path:: ${dirPath}`);
}

const tailTracker = new TailTracker(args["--expire"], args["--buffer"]);
const watcher = new Watcher(tailTracker, args["--quiet"], args["--poll"]);
watcher.watch(args.FILE, args["--poll"], tailTracker);
const server = httpServer.makeServer(dirPath, args["--quiet"]);
wsServer.attach(server, tailTracker);
server.listen(args["--port"]);

if (!args["--quiet"]) {
    console.log(`Opened server on port: ${args["--port"]}`);
}
