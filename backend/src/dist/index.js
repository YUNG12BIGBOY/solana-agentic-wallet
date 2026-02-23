"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
require("./config/env");
const http_1 = require("http");
const server_1 = __importDefault(require("./server"));
const websocket_1 = require("./websocket");
const env_1 = require("./config/env");
const server = (0, http_1.createServer)(server_1.default);
(0, websocket_1.initWebsocket)(server);
server.listen(env_1.env.port, () => {
    console.log(`Backend running on port ${env_1.env.port}`);
});
