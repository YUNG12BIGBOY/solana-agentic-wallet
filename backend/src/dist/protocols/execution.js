"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.executeProtocolIntent = void 0;
const web3_js_1 = require("@solana/web3.js");
const env_1 = require("../config/env");
const walletManager_1 = require("../wallet/walletManager");
const jupiter_1 = require("./jupiter");
const executeProtocolIntent = async (intent) => {
    if (intent.protocol === "hold") {
        return {
            protocol: intent.protocol,
            message: "No transaction executed (HOLD)",
        };
    }
    if (intent.protocol === "jupiter_swap") {
        if (!env_1.env.enableJupiterSwap) {
            throw new Error("Jupiter swap is disabled for the current network profile");
        }
        const activeReceive = (0, walletManager_1.getActiveWalletReceiveInfo)();
        const inputMint = intent.inputMint ?? "So11111111111111111111111111111111111111112";
        const outputMint = intent.outputMint ?? env_1.env.defaultUsdcMint;
        const amountLamports = Math.floor(intent.amountSol * web3_js_1.LAMPORTS_PER_SOL);
        const swap = await (0, jupiter_1.executeJupiterSwapFromIntent)({
            walletPublicKey: intent.walletPublicKey ?? activeReceive.publicKey,
            inputMint,
            outputMint,
            amount: amountLamports,
            slippageBps: intent.slippageBps,
            reasoningReference: intent.reasoningReference ?? "protocol intent execution",
        });
        return {
            protocol: intent.protocol,
            message: "Jupiter swap executed",
            txSignature: swap.signature,
            explorerUrl: swap.explorerUrl,
            quote: swap.quote,
        };
    }
    if (intent.protocol === "sol_transfer") {
        const recipient = intent.recipient || env_1.env.defaultRecipient || (0, walletManager_1.getActiveWalletReceiveInfo)().publicKey;
        const transfer = await (0, walletManager_1.transferSolFromActiveWallet)(recipient, intent.amountSol);
        return {
            protocol: intent.protocol,
            message: "SOL transfer executed",
            txSignature: transfer.signature,
            explorerUrl: transfer.explorerUrl,
            wallet: transfer.wallet,
        };
    }
    if (intent.protocol === "spl_transfer") {
        const recipient = intent.recipient || env_1.env.defaultRecipient;
        if (!recipient) {
            throw new Error("DEFAULT_RECIPIENT is required for spl_transfer");
        }
        const transfer = await (0, walletManager_1.transferSplFromActiveWallet)({
            to: recipient,
            mint: intent.splMint ?? env_1.env.defaultUsdcMint,
            amount: intent.amountSol,
        });
        return {
            protocol: intent.protocol,
            message: "SPL transfer executed",
            txSignature: transfer.signature,
            explorerUrl: transfer.explorerUrl,
            wallet: transfer.wallet,
        };
    }
    throw new Error(`Unsupported protocol intent: ${intent.protocol}`);
};
exports.executeProtocolIntent = executeProtocolIntent;
