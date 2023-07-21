"use strict";

const fs = require("fs");
const http = require("http");
const path = require("path");

const mimeMap = {
    css: "text/css",
    html: "text/html",
    ico: "image/x-icon",
    jpg: "image/jpeg",
    json: "application/json",
    js: "text/javascript",
    png: "image/png",
    svg: "image/svg+xml"
};

module.exports = {
    dirPath(dirname, frontend) {
        if (frontend.charAt(0) === "/") {
            return path.resolve(frontend);
        }

        if (frontend.charAt(0) === ".") {
            return path.resolve(process.cwd(), frontend);
        }

        return path.resolve(dirname, frontend);
    },

    makeServer(dirPath, quiet) {
        const server = http.createServer((req, res) => {
            if (!quiet) {
                console.log(`${req.method} ${req.url}`);
            }

            const file = req.url.replace(/\?.*/, '').replace(/.*\//, "") || "index.html";
            const filePath = path.resolve(dirPath, file);
            const ext = path.parse(filePath).ext.substr(1);
            const mimeType = mimeMap[ext];

            if (!mimeType) {
                this.return404(
                    file,
                    res,
                    "No extension or no mapped mime type"
                );

                return;
            }

            // Don't cache this file - allow for reloads
            fs.promises.readFile(filePath).then(
                (buffer) => {
                    res.writeHead(200, {
                        "Content-Type": mimeType
                    });
                    res.end(buffer);
                },
                (err) => {
                    this.return404(file, res, err);
                }
            );
        });

        return server;
    },

    return404(file, res, msg) {
        console.error(`${msg}:`, file);
        res.writeHead(404, {
            "Content-Type": "text/plain"
        });
        res.end("404: File not found");
    }
};
