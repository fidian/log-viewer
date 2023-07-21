"use strict";

const events = require("events");
const Tail = require("./tail");

class TailTracker {
    constructor(expireMin, bufferLines, periodicRecheckMin) {
        this.expireMin = expireMin;
        this.bufferLines = bufferLines;
        this.periodicRecheckMin = periodicRecheckMin;
        // path (string) => Tail
        this.tails = {};
        this.removeTimeouts = {};
        this.eventEmitter = new events.EventEmitter();
    }

    add(path, stats) {
        const tail = this.getTail(path);

        if (this.removeTimeouts[path]) {
            clearTimeout(this.removeTimeouts[path]);
            delete this.removeTimeouts[path];
        }

        tail.initialize(stats);
    }

    change(path, stats) {
        const tail = this.getTail(path);

        tail.change(stats);
    }

    getTail(path) {
        if (!this.tails[path]) {
            const tail = new Tail(path, this.bufferLines, this.periodicRecheckMin);
            this.tails[path] = tail;
            this.eventEmitter.emit("add", {
                path
            });
            tail.eventEmitter.on('update', (eventList) => {
                this.eventEmitter.emit('update', {
                    path,
                    events: eventList
                });
            });
        }

        return this.tails[path];
    }

    unlink(path) {
        const tail = this.getTail(path);
        tail.unlink();
        this.removeTimeouts[path] = setTimeout(() => {
            delete this.removeTimeouts[path];
            tail.eventEmitter.removeAllListeners();
            this.eventEmitter.emit("remove", {
                path
            });
            delete this.tails[path];
        }, this.expireMin * 60000);
    }
}

module.exports = TailTracker;
