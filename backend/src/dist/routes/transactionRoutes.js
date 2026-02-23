"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const websocket_1 = require("../websocket");
const router = (0, express_1.Router)();
router.get("/", (req, res) => {
    const parsedLimit = Number(req.query.limit ?? 100);
    const limit = Number.isInteger(parsedLimit)
        ? Math.max(1, Math.min(parsedLimit, 500))
        : 100;
    const transactions = (0, websocket_1.getRecentLogs)()
        .filter((entry) => entry.txSignature || entry.explorerUrl)
        .slice(-limit)
        .reverse()
        .map((entry) => ({
        timestamp: entry.timestamp,
        level: entry.level,
        message: entry.message,
        signature: entry.txSignature ?? null,
        explorerUrl: entry.explorerUrl ?? null,
        data: entry.data ?? null,
    }));
    res.json({
        count: transactions.length,
        transactions,
    });
});
exports.default = router;
