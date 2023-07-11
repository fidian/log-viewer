"use strict";

const chokidar = require('chokidar');

module.exports = {
    watch(files, usePolling, tailTracker) {
        const watcher = chokidar.watch(files, {
            usePolling
        });
        watcher.on('add', (path) => {
            tailTracker.add(path);
        });
        watcher.on('change', (path) => {
            tailTracker.change(path);
        });
        watcher.on('unlink', (path) => {
            tailTracker.unlink(path);
        });
    }
};
