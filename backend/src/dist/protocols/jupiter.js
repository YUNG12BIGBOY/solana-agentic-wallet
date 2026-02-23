"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.executeJupiterSwapFromIntent = exports.executeJupiterSwap = exports.getSwapQuote = void 0;
const env_1 = require("../config/env");
const jupiterSwapModule_1 = require("./jupiterSwapModule");
const getSwapQuote = (request) => jupiterSwapModule_1.JupiterSwapModule.fetchQuote(request);
exports.getSwapQuote = getSwapQuote;
const executeJupiterSwap = async (params) => jupiterSwapModule_1.JupiterSwapModule.executeSwap({
    walletPublicKey: params.signer.publicKey.toBase58(),
    inputMint: params.inputMint,
    outputMint: params.outputMint,
    amount: params.amount,
    slippageBps: params.slippageBps,
    maxAllowedSlippageBps: params.slippageBps ?? 100,
    reasoningReference: "Legacy executeJupiterSwap invocation",
});
exports.executeJupiterSwap = executeJupiterSwap;
const executeJupiterSwapFromIntent = (params) => jupiterSwapModule_1.JupiterSwapModule.executeSwap({
    walletPublicKey: params.walletPublicKey,
    inputMint: params.inputMint,
    outputMint: params.outputMint,
    amount: params.amount,
    slippageBps: params.slippageBps,
    maxAllowedSlippageBps: env_1.env.enableJupiterSwap ? 1000 : 100,
    reasoningReference: params.reasoningReference,
});
exports.executeJupiterSwapFromIntent = executeJupiterSwapFromIntent;
