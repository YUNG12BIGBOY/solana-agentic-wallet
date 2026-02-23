"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const web3_js_1 = require("@solana/web3.js");
const env_1 = require("../config/env");
const jupiter_1 = require("../protocols/jupiter");
const jupiterSwapModule_1 = require("../protocols/jupiterSwapModule");
const websocket_1 = require("../websocket");
const errors_1 = require("../utils/errors");
const router = (0, express_1.Router)();
router.get("/quote", async (req, res) => {
    try {
        if (!env_1.env.enableJupiterSwap) {
            return res.status(400).json({
                error: "Jupiter quote is disabled for the current network profile",
            });
        }
        const inputMint = req.query.inputMint ?? "So11111111111111111111111111111111111111112";
        const outputMint = req.query.outputMint ?? env_1.env.defaultUsdcMint;
        const amount = Number(req.query.amount ?? Math.floor(0.1 * web3_js_1.LAMPORTS_PER_SOL));
        const slippageBps = Number(req.query.slippageBps ?? 100);
        const quote = await (0, jupiter_1.getSwapQuote)({
            inputMint,
            outputMint,
            amount,
            slippageBps,
        });
        res.json(quote);
    }
    catch (error) {
        res.status(502).json({ error: (0, errors_1.toClientError)(error) });
    }
});
router.post("/swap", async (req, res) => {
    try {
        if (!env_1.env.enableJupiterSwap) {
            return res.status(400).json({
                error: "Jupiter swap is disabled for the current network profile",
            });
        }
        const { walletPublicKey, inputMint = "So11111111111111111111111111111111111111112", outputMint = env_1.env.defaultUsdcMint, amountSol = 0.1, slippageBps = 100, reasoningReference = "Manual /jupiter/swap route", } = req.body;
        const result = await jupiterSwapModule_1.JupiterSwapModule.executeSwap({
            walletPublicKey,
            inputMint,
            outputMint,
            amount: Math.floor(amountSol * web3_js_1.LAMPORTS_PER_SOL),
            slippageBps,
            maxAllowedSlippageBps: slippageBps,
            reasoningReference,
        });
        (0, websocket_1.emitLog)({
            level: "success",
            message: `Jupiter swap executed (${amountSol} SOL)`,
            txSignature: result.signature,
            explorerUrl: result.explorerUrl,
        });
        res.json(result);
    }
    catch (error) {
        res.status(400).json({ error: (0, errors_1.toClientError)(error) });
    }
});
exports.default = router;
