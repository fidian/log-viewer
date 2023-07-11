"use strict";

const fs = require("fs");
const http = require("http");
const path = require('path');

module.exports = {
    filePath(dirname, index) {
        if (index.charAt(0) === '/') {
            return path.resolve(index);
        }

        if (index.charAt(0) === '.') {
            return path.resolve(process.cwd(), index);
        }

        return path.resolve(dirname, index);
    },

    makeServer(filePath) {
        const server = http.createServer((req, res) => {
            // Don't cache this file - allow for reloads
            fs.promises.readFile(filePath).then((buffer) => {
                res.writeHead(200, {
                    "Content-Type": "text/html"
                });
                res.end(buffer);
            }, (err) => {
                res.writeHead(404, {
                    "Content-Type": "text/plain"
                });
                res.end("404: File not found");
                console.error(err);
            });
        });

        return server;
    }
};
