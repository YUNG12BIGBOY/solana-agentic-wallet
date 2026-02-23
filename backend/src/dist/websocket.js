"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getRecentLogs = exports.emitLog = exports.initWebsocket = void 0;
const socket_io_1 = require("socket.io");
let io = null;
const logBuffer = [];
const LOG_BUFFER_LIMIT = 200;
const appendLog = (event) => {
    logBuffer.push(event);
    if (logBuffer.length > LOG_BUFFER_LIMIT) {
        logBuffer.shift();
    }
};
const initWebsocket = (server) => {
    io = new socket_io_1.Server(server, { cors: { origin: "*" } });
    io.on("connection", (socket) => {
        socket.emit("logs:snapshot", logBuffer);
    });
};
exports.initWebsocket = initWebsocket;
const emitLog = (messageOrEvent) => {
    const event = typeof messageOrEvent === "string"
        ? {
            timestamp: new Date().toISOString(),
            level: "info",
            message: messageOrEvent,
        }
        : {
            ...messageOrEvent,
            timestamp: new Date().toISOString(),
        };
    appendLog(event);
    io?.emit("log", event);
};
exports.emitLog = emitLog;
const getRecentLogs = () => [...logBuffer];
exports.getRecentLogs = getRecentLogs;
