# Log Viewer

This is a simple way to view logs in a browser. By pointing the script at a series of paths or globs, you are able to then serve these files to your browser. When you load the page, the logs are searchable and a history is kept when toggling between different files.

This is a quick and easy method to allow people to view logs without granting them the permission to execute commands on a server.

![Screenshot](screenshot.png)

## Installation

This is best installed globally.

    npm install -g @fidian/log-viewer

## Usage

Start the server by specifying the filenames you want to monitor. Globs are supported. If a file doesn't exist yet, but will in the future, this tool will pick them up when they appear.

    log-viewer /var/log/syslogd /var/log/nginx/*.log

There are only a handful of options, all are documented with `log-viewer --help`.

* `--buffer=LINES` - Store this number of lines in memory for each file. Send these lines to the UI when it connects.
* `--expire=MIN` - After a file is removed, keep tracking its existence until this amount of time elapses. Useful in case a file gets rotated.
* `--frontend=DIR` - Alternate location of a UI to serve. There is a very simple static file server built into the application. It ignores paths, and the UI is responsible for making a WebSocket connection and listening for messages.
* `--poll` - Switch to polling instead of using filesystem events. Useful for network mounted drives.
* `--port=PORT` - Specify a different port for listening.
* `--quiet` - Suppress log messages. Errors are still printed to the screen.
