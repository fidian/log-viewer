"use strict";

const chokidar = require('chokidar');

module.exports = {
    watch(files, usePolling, tailTracker) {
        for (const file of files) {
            // Using separate watchers will allow us to detect files being
            // recreated after they were removed.
            const watcher = chokidar.watch(file, {
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
    }
};
