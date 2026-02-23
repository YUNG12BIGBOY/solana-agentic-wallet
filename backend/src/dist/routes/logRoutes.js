"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const websocket_1 = require("../websocket");
const router = (0, express_1.Router)();
router.get("/", (_req, res) => {
    res.json({ logs: (0, websocket_1.getRecentLogs)() });
});
exports.default = router;
