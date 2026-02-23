"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const agentEngine_1 = require("../agent/agentEngine");
const tradeAdvisor_1 = require("../agent/tradeAdvisor");
const errors_1 = require("../utils/errors");
const router = (0, express_1.Router)();
router.get("/status", (_req, res) => {
    res.json((0, agentEngine_1.getAgentStatus)());
});
router.post("/start", (req, res) => {
    try {
        const { intervalMs } = req.body;
        res.json((0, agentEngine_1.startAgent)(intervalMs));
    }
    catch (error) {
        res.status(400).json({ error: (0, errors_1.toClientError)(error) });
    }
});
router.post("/pause", (_req, res) => {
    res.json((0, agentEngine_1.stopAgent)());
});
router.post("/run", async (_req, res) => {
    try {
        const status = await (0, agentEngine_1.runAgent)();
        res.json(status);
    }
    catch (error) {
        res.status(400).json({ error: (0, errors_1.toClientError)(error) });
    }
});
router.post("/execute", async (req, res) => {
    try {
        const { amountSol } = req.body;
        res.json(await (0, agentEngine_1.executeTrade)(amountSol ?? 0.1));
    }
    catch (error) {
        res.status(400).json({ error: (0, errors_1.toClientError)(error) });
    }
});
router.post("/simulate", async (_req, res) => {
    try {
        res.json(await (0, agentEngine_1.runSimulation)());
    }
    catch (error) {
        res.status(400).json({ error: (0, errors_1.toClientError)(error) });
    }
});
router.get("/advisor", async (_req, res) => {
    try {
        res.json(await (0, tradeAdvisor_1.getTradeAdvisory)());
    }
    catch (error) {
        res.status(400).json({ error: (0, errors_1.toClientError)(error) });
    }
});
exports.default = router;
