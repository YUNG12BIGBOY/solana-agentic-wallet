"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const riskEngine_1 = require("../agent/riskEngine");
const router = (0, express_1.Router)();
router.get("/", (_req, res) => {
    res.json((0, riskEngine_1.getRiskStatus)());
});
router.post("/update", (req, res) => {
    try {
        const next = req.body;
        res.json((0, riskEngine_1.updateRisk)(next));
    }
    catch (error) {
        res.status(400).json({ error: error.message });
    }
});
router.post("/reset-circuit-breaker", (_req, res) => {
    res.json((0, riskEngine_1.resetCircuitBreaker)());
});
exports.default = router;
