"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const walletManager_1 = require("../wallet/walletManager");
const websocket_1 = require("../websocket");
const env_1 = require("../config/env");
const errors_1 = require("../utils/errors");
const router = (0, express_1.Router)();
router.post("/create", async (req, res) => {
    try {
        const { label } = req.body;
        const wallet = await (0, walletManager_1.createWallet)(label);
        (0, websocket_1.emitLog)({
            level: "success",
            message: `Wallet created: ${wallet.label}`,
            data: { publicKey: wallet.publicKey },
        });
        res.json({
            wallet,
            state: await (0, walletManager_1.getWalletState)(),
        });
    }
    catch (error) {
        res.status(500).json({ error: (0, errors_1.toClientError)(error) });
    }
});
router.get("/", async (_req, res) => {
    try {
        res.json(await (0, walletManager_1.getWalletState)());
    }
    catch (error) {
        res.status(500).json({ error: (0, errors_1.toClientError)(error) });
    }
});
router.get("/tokens", async (_req, res) => {
    try {
        const tokens = await (0, walletManager_1.getActiveWalletTokenBalances)();
        res.json({ tokens });
    }
    catch (error) {
        res.status(400).json({ error: (0, errors_1.toClientError)(error) });
    }
});
router.post("/switch", async (req, res) => {
    try {
        const { publicKey } = req.body;
        if (!publicKey) {
            return res.status(400).json({ error: "publicKey is required" });
        }
        const wallet = await (0, walletManager_1.switchWallet)(publicKey);
        (0, websocket_1.emitLog)({
            level: "info",
            message: `Active wallet switched to ${wallet.label}`,
            data: { publicKey: wallet.publicKey },
        });
        return res.json({ wallet, state: await (0, walletManager_1.getWalletState)() });
    }
    catch (error) {
        return res.status(400).json({ error: (0, errors_1.toClientError)(error) });
    }
});
router.post("/delete", async (req, res) => {
    try {
        const { publicKey } = req.body;
        if (!publicKey) {
            return res.status(400).json({ error: "publicKey is required" });
        }
        const result = await (0, walletManager_1.deleteWallet)(publicKey);
        (0, websocket_1.emitLog)(result.alreadyDeleted
            ? {
                level: "info",
                message: `Wallet already removed: ${result.removedPublicKey}`,
                data: { publicKey: result.removedPublicKey },
            }
            : {
                level: "warn",
                message: `Wallet deleted: ${result.removedLabel}`,
                data: {
                    publicKey: result.removedPublicKey,
                    nextActivePublicKey: result.activeWallet?.publicKey ?? null,
                },
            });
        return res.json({
            ...result,
            state: await (0, walletManager_1.getWalletState)(),
        });
    }
    catch (error) {
        return res.status(400).json({ error: (0, errors_1.toClientError)(error) });
    }
});
router.post("/airdrop", async (req, res) => {
    try {
        const { amountSol } = req.body;
        const result = await (0, walletManager_1.airdropActiveWallet)(amountSol ?? 1);
        (0, websocket_1.emitLog)({
            level: "success",
            message: `Airdrop requested (${amountSol ?? 1} SOL)`,
            txSignature: result.signature,
            explorerUrl: result.explorerUrl,
        });
        res.json(result);
    }
    catch (error) {
        res.status(400).json({ error: (0, errors_1.toClientError)(error) });
    }
});
router.post("/transfer-sol", async (req, res) => {
    try {
        const { to, amountSol } = req.body;
        const recipient = to || env_1.env.defaultRecipient || (0, walletManager_1.getActiveWalletReceiveInfo)().publicKey;
        if (!recipient) {
            return res.status(400).json({ error: "Recipient address is required" });
        }
        const result = await (0, walletManager_1.transferSolFromActiveWallet)(recipient, amountSol ?? 0.01);
        (0, websocket_1.emitLog)({
            level: "success",
            message: `SOL transfer executed (${amountSol ?? 0.01} SOL)`,
            txSignature: result.signature,
            explorerUrl: result.explorerUrl,
        });
        return res.json(result);
    }
    catch (error) {
        return res.status(400).json({ error: (0, errors_1.toClientError)(error) });
    }
});
router.post("/transfer-spl", async (req, res) => {
    try {
        const { to, mint, amount } = req.body;
        const recipient = to || env_1.env.defaultRecipient || (0, walletManager_1.getActiveWalletReceiveInfo)().publicKey;
        if (!recipient) {
            return res.status(400).json({ error: "Recipient address is required" });
        }
        if (!mint) {
            return res.status(400).json({ error: "mint is required" });
        }
        const result = await (0, walletManager_1.transferSplFromActiveWallet)({
            to: recipient,
            mint,
            amount: amount ?? 1,
        });
        (0, websocket_1.emitLog)({
            level: "success",
            message: `SPL transfer executed (${amount ?? 1})`,
            txSignature: result.signature,
            explorerUrl: result.explorerUrl,
        });
        return res.json(result);
    }
    catch (error) {
        return res.status(400).json({ error: (0, errors_1.toClientError)(error) });
    }
});
router.post("/mint-test-token", async (req, res) => {
    try {
        const { amount, decimals } = req.body;
        const result = await (0, walletManager_1.mintTestTokenToActiveWallet)({
            amount: amount ?? 1000,
            decimals,
        });
        (0, websocket_1.emitLog)({
            level: "success",
            message: `Minted test SPL token (${result.amount})`,
            txSignature: result.signature,
            explorerUrl: result.explorerUrl,
            data: { mint: result.mint, decimals: result.decimals },
        });
        return res.json(result);
    }
    catch (error) {
        return res.status(400).json({ error: (0, errors_1.toClientError)(error) });
    }
});
router.get("/receive", (_req, res) => {
    try {
        const receive = (0, walletManager_1.getActiveWalletReceiveInfo)();
        return res.json(receive);
    }
    catch (error) {
        return res.status(400).json({ error: (0, errors_1.toClientError)(error) });
    }
});
router.get("/receive-spl", async (req, res) => {
    try {
        const mint = String(req.query.mint ?? "").trim();
        const prepare = String(req.query.prepare ?? "false").toLowerCase() === "true";
        if (!mint) {
            return res.status(400).json({ error: "mint is required" });
        }
        const receive = await (0, walletManager_1.getActiveWalletSplReceiveInfo)({ mint, prepare });
        if (receive.prepared) {
            (0, websocket_1.emitLog)({
                level: "success",
                message: "Prepared SPL receive account (ATA)",
                txSignature: receive.preparationSignature,
                explorerUrl: receive.preparationExplorerUrl,
                data: {
                    mint: receive.mint,
                    associatedTokenAccount: receive.associatedTokenAccount,
                },
            });
        }
        return res.json(receive);
    }
    catch (error) {
        return res.status(400).json({ error: (0, errors_1.toClientError)(error) });
    }
});
exports.default = router;
