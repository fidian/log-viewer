"use strict";

const chokidar = require('chokidar');
const picomatch = require("picomatch");

class Watcher {
    constructor(tailTracker, quiet, usePolling) {
        this.tailTracker = tailTracker;
        this.quiet = quiet;
        this.usePolling = usePolling;
        this.matchers = [];
    }

    add(path) {
        // Chokidar can send events for other files when watching directories
        // that match globs, such as */file.log
        if (!this.matches(path)) {
            if (!this.quiet) {
                console.log("Ignoring add:", path);
            }

            return;
        }

        if (!this.quiet) {
            console.log("Tracking file:", path);
        }

        this.tailTracker.add(path);
    }

    change(path) {
        // Chokidar can send events for other files when watching directories
        // that match globs, such as */file.log
        if (!this.matches(path)) {
            return;
        }

        this.tailTracker.change(path);
    }

    matches(path) {
        for (const matcher of this.matchers) {
            if (matcher(path)) {
                return true;
            }
        }

        return false;
    }

    unlink(path) {
        // Chokidar can send events for other files when watching directories
        // that match globs, such as */file.log
        if (!this.matches(path)) {
            if (!this.quiet) {
                console.log("Ignoring remove:", path);
            }

            return;
        }

        if (!this.quiet) {
            console.log("Removing file:", path);
        }

        this.tailTracker.unlink(path);
    }

    watch(files) {
        // Chokidar doesn't provide correct events if the files are passed as
        // an array. If files is ["a.log", "b.log"] and b.log does not exist
        // when the process starts, then b.log won't be shown even when
        // created.
        for (const file of files) {
            this.matchers.push(picomatch(file));
            const watcher = chokidar.watch(file, {
                usePolling: this.usePolling
            });
            watcher.on('add', (path) => this.add(path));
            watcher.on('change', (path) => this.change(path));
            watcher.on('unlink', (path) => this.unlink(path));
        }
    }
}

module.exports = Watcher;
