"use strict";

const events = require("events");
const fs = require("fs");
const CHUNK_SIZE = 8192;
const SYSTEM = "system";

class Tail {
    constructor(path, bufferLines) {
        this.bufferLines = bufferLines;
        this.errored = false;
        this.path = path;
        this.busy = false;
        this.byteIndex = 0;
        this.events = [];
        this.eventEmitter = new events.EventEmitter();
        this.newEvents = [];
        this.newEventTimeout = null;
        this.taskQueue = [];
        this.partialLine = "";
        this.removeTimeout = null;
    }

    change(stats) {
        if (this.errored) {
            return;
        }

        this.taskQueue.push(() => this.performChange(stats));
        this.runTaskQueue();
    }

    initialize(stats) {
        this.newEvent(SYSTEM, "Started tracking file");
        this.taskQueue.push(() => this.performInitialize(stats));
        this.runTaskQueue();
    }

    newEvent(type, content) {
        const newEvent = {
            type,
            when: Date.now(),
            content
        };
        this.newEvents.push(newEvent);

        if (this.newEventTimeout) {
            return;
        }

        this.newEventTimeout = setTimeout(() => {
            this.newEventTimeout = null;
            this.eventEmitter.emit("update", this.newEvents.slice());
            this.events.push(...this.newEvents);
            this.newEvents = [];

            while (this.events.length > this.bufferSize) {
                this.events.shift();
            }
        });
    }

    // Set the initial load start position to the byte AFTER the last delimiter
    // we want, or byte 0 (start of file). To find the right spot, load the end
    // of the file and count the delimiters, then keep working backwards until
    // we hit our magic number or run out of bytes.
    performInitialize(stats) {
        if (this.errored) {
            return Promise.resolve();
        }

        if (stats.size === 0) {
            return Promise.resolve(0);
        }

        return fs.promises
            .open(this.path, "r")
            .then(
                (handle) => {
                    return this.scanBackwards(
                        handle,
                        stats.size,
                        this.bufferLines
                    );
                },
                (err) => {
                    console.error(err);
                    this.errored = true;
                    this.newEvent(
                        SYSTEM,
                        "Error reading end of file during initialization"
                    );

                    return null;
                }
            )
            .then((index) => {
                if (this.errored) {
                    return;
                }

                this.byteIndex = index;
                this.change(stats);
            });
    }

    // Load from current byte position to end.
    performChange(stats) {
        if (this.errored) {
            return Promise.resolve();
        }

        if (stats.size < this.byteIndex) {
            this.newEvent(SYSTEM, "File truncated");
            this.byteIndex = 0;
        }

        return this.readEndOfFile(stats.size);
    }

    readEndOfFile(endSize) {
        return new Promise((resolve) => {
            const stream = fs.createReadStream(this.path, {
                start: this.byteIndex,
                end: endSize,
                encoding: "utf8"
            });

            stream.on("error", (err) => {
                console.error(err);
                this.errored = true;
                this.newEvent(
                    SYSTEM,
                    "Error reading new content at the end of the file"
                );

                // This is intentionally not rejecting the promise because the
                // error is handled.
                resolve();
            });
            stream.on("end", () => {
                this.byteIndex = endSize;
                resolve();
            });
            stream.on("data", (data) => {
                this.partialLine += data;

                const parts = this.partialLine.split("\n");
                this.partialLine = parts.pop();

                for (const part of parts) {
                    this.newEvent("line", part);
                }
            });
        });
    }

    runTaskQueue() {
        if (this.busy) {
            return;
        }

        const job = this.taskQueue.shift();

        if (!job) {
            return;
        }

        this.busy = true;
        job().then(() => {
            this.busy = false;
            this.runTaskQueue();
        });
    }

    scanBackwards(handle, endPosition, linesRemaining) {
        if (!endPosition) {
            return handle.close().then(() => 0);
        }

        const chunkSize = Math.min(CHUNK_SIZE, endPosition);
        const startPosition = endPosition - chunkSize;
        const buffer = Buffer.alloc(chunkSize);

        return handle.read(buffer, 0, chunkSize, startPosition).then(() => {
            // Fewer bytes than chunkSize may have been read, but since the
            // buffer was initialized and we're only counting newlines, this
            // is pretty safe.
            for (let i = chunkSize - 1; i >= 0; i -= 1) {
                // Look for \n
                if (buffer[i] === 0x0a) {
                    linesRemaining -= 1;

                    if (linesRemaining === -1) {
                        return handle.close().then(() => startPosition + i + 1);
                    }
                }
            }

            return this.scanBackwards(handle, startPosition, linesRemaining);
        });
    }

    unlink() {
        this.newEvent(SYSTEM, "File removed");
    }
}

module.exports = Tail;
