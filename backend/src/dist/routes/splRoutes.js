"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const walletManager_1 = require("../wallet/walletManager");
const splTokenModule_1 = require("../protocols/splTokenModule");
const websocket_1 = require("../websocket");
const errors_1 = require("../utils/errors");
const router = (0, express_1.Router)();
const resolveTopology = async () => {
    const treasury = await (0, walletManager_1.ensureWalletByLabel)("Treasury Agent");
    const trader = await (0, walletManager_1.ensureWalletByLabel)("Trader Agent");
    const liquidity = await (0, walletManager_1.ensureWalletByLabel)("Liquidity Agent");
    const arbitrage = await (0, walletManager_1.ensureWalletByLabel)("Arbitrage Agent");
    return {
        treasuryWalletPublicKey: treasury.publicKey,
        operationalWalletPublicKeys: [
            trader.publicKey,
            liquidity.publicKey,
            arbitrage.publicKey,
        ],
    };
};
router.post("/initialize", async (_req, res) => {
    try {
        const topology = await resolveTopology();
        const result = await splTokenModule_1.SPLTokenModule.initializeAgentTokenEconomy(topology);
        res.json(result);
    }
    catch (error) {
        const mapped = (0, errors_1.toClientError)(error);
        (0, websocket_1.emitLog)({
            level: "error",
            message: `SPL initialize failed: ${mapped}`,
        });
        res.status(400).json({ error: mapped });
    }
});
router.get("/status", (_req, res) => {
    res.json(splTokenModule_1.SPLTokenModule.getState());
});
router.get("/balances", async (_req, res) => {
    try {
        const state = splTokenModule_1.SPLTokenModule.getState();
        if (!state.mint) {
            return res.json({ mintAddress: null, balances: [] });
        }
        const topology = await resolveTopology();
        const balances = await splTokenModule_1.SPLTokenModule.queryBalances(state.mint, [
            topology.treasuryWalletPublicKey,
            ...topology.operationalWalletPublicKeys,
        ]);
        return res.json({
            mintAddress: state.mint,
            balances,
        });
    }
    catch (error) {
        const mapped = (0, errors_1.toClientError)(error);
        (0, websocket_1.emitLog)({
            level: "error",
            message: `SPL balances query failed: ${mapped}`,
        });
        return res.status(400).json({ error: mapped });
    }
});
router.post("/transfer", async (req, res) => {
    try {
        const { fromWalletPublicKey, toWalletPublicKey, amount, reason } = req.body;
        if (!fromWalletPublicKey || !toWalletPublicKey || !amount) {
            return res.status(400).json({
                error: "fromWalletPublicKey, toWalletPublicKey and amount are required",
            });
        }
        const state = splTokenModule_1.SPLTokenModule.getState();
        if (!state.mint) {
            return res.status(400).json({ error: "AGENT mint is not initialized" });
        }
        const result = await splTokenModule_1.SPLTokenModule.transferBetweenAgents({
            mintAddress: state.mint,
            fromWalletPublicKey,
            toWalletPublicKey,
            amount,
            reason: reason ?? "Manual transfer",
        });
        return res.json(result);
    }
    catch (error) {
        const mapped = (0, errors_1.toClientError)(error);
        (0, websocket_1.emitLog)({
            level: "error",
            message: `SPL transfer failed: ${mapped}`,
        });
        return res.status(400).json({ error: mapped });
    }
});
exports.default = router;
