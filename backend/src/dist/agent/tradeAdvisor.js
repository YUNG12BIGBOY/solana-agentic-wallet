"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getTradeAdvisory = void 0;
const web3_js_1 = require("@solana/web3.js");
const env_1 = require("../config/env");
const walletManager_1 = require("../wallet/walletManager");
const websocket_1 = require("../websocket");
const jupiterSwapModule_1 = require("../protocols/jupiterSwapModule");
const jupiterDecisionLogic_1 = require("./jupiterDecisionLogic");
const riskEngine_1 = require("./riskEngine");
const agentEngine_1 = require("./agentEngine");
const WSOL_MINT = "So11111111111111111111111111111111111111112";
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const parseSlippage = (value) => {
    if (typeof value === "number" && Number.isFinite(value)) {
        return value;
    }
    return undefined;
};
const estimateSolPriceUsdc = async () => {
    if (!env_1.env.enableJupiterSwap) {
        return 100;
    }
    try {
        const quote = await jupiterSwapModule_1.JupiterSwapModule.fetchQuote({
            inputMint: WSOL_MINT,
            outputMint: env_1.env.defaultUsdcMint,
            amount: web3_js_1.LAMPORTS_PER_SOL,
            slippageBps: (0, riskEngine_1.getRiskStatus)().settings.maxSlippageBps,
        });
        const outAmount = Number(quote.outAmount ?? 0);
        if (!Number.isFinite(outAmount) || outAmount <= 0) {
            return 100;
        }
        return outAmount / 1000000;
    }
    catch {
        return 100;
    }
};
const toRiskLevel = (riskScore) => {
    if (riskScore >= 65) {
        return "HIGH";
    }
    if (riskScore >= 35) {
        return "MEDIUM";
    }
    return "LOW";
};
const getTradeAdvisory = async () => {
    const status = (0, agentEngine_1.getAgentStatus)();
    const walletState = await (0, walletManager_1.getWalletState)();
    const traderWalletPublicKey = status.topology?.traderWalletPublicKey ?? null;
    const traderWallet = (traderWalletPublicKey
        ? walletState.wallets.find((wallet) => wallet.publicKey === traderWalletPublicKey)
        : null) ?? walletState.activeWallet;
    if (!traderWallet) {
        return {
            recommendation: "HOLD",
            suggestedPercentage: 0,
            confidence: 0.1,
            riskLevel: "MEDIUM",
            reason: "No active trader wallet available.",
            inputs: {
                traderWallet: null,
                solBalance: 0,
                usdcBalance: 0,
                portfolioAllocation: 0,
                estimatedSlippageBps: (0, riskEngine_1.getRiskStatus)().settings.maxSlippageBps,
                dailyTradeCount: 0,
                successRate: 0,
                riskScore: 50,
                pastFiveTrades: [],
            },
        };
    }
    const pastFiveTrades = (0, websocket_1.getRecentLogs)()
        .filter((entry) => entry.txSignature || entry.explorerUrl)
        .slice(-5)
        .reverse()
        .map((entry) => {
        const data = (entry.data ?? {});
        return {
            timestamp: entry.timestamp,
            signature: entry.txSignature,
            slippageBps: parseSlippage(data.slippageBps),
            message: entry.message,
        };
    });
    const slippageSamples = pastFiveTrades
        .map((trade) => trade.slippageBps)
        .filter((value) => typeof value === "number");
    const estimatedSlippageBps = slippageSamples.length > 0
        ? slippageSamples.reduce((sum, value) => sum + value, 0) / slippageSamples.length
        : (0, riskEngine_1.getRiskStatus)().settings.maxSlippageBps;
    const totalTrades = status.jupiterSwapStats.successfulSwaps + status.jupiterSwapStats.failedSwaps;
    const successRate = totalTrades === 0 ? 1 : status.jupiterSwapStats.successfulSwaps / totalTrades;
    const solPriceUsdc = await estimateSolPriceUsdc();
    const intent = (0, jupiterDecisionLogic_1.decideJupiterIntent)({
        solBalance: traderWallet.solBalance,
        usdcBalance: traderWallet.usdcBalance,
        solPriceUsdc,
        lastTradeAt: status.jupiterSwapStats.lastSwapAt,
        tradeSuccessRate: successRate,
        dailyTradeCount: status.jupiterSwapStats.dailySwapCount,
        consecutiveFailures: status.jupiterSwapStats.consecutiveSwapFailures,
        estimatedSlippageBps,
        minSolReserve: env_1.env.jupiterMinSolReserve,
    });
    const totalPortfolioUsdc = traderWallet.usdcBalance + traderWallet.solBalance * Math.max(solPriceUsdc, 0);
    const portfolioAllocation = totalPortfolioUsdc > 0
        ? (traderWallet.solBalance * Math.max(solPriceUsdc, 0)) / totalPortfolioUsdc
        : 0;
    const riskScore = Number(clamp(status.jupiterSwapStats.consecutiveSwapFailures * 18 +
        estimatedSlippageBps / 5 +
        (traderWallet.solBalance < env_1.env.jupiterMinSolReserve ? 25 : 0) +
        (1 - successRate) * 20, 0, 100).toFixed(2));
    return {
        recommendation: intent.action,
        direction: intent.direction,
        suggestedPercentage: intent.amountPct,
        confidence: Number((intent.confidence / 100).toFixed(2)),
        riskLevel: toRiskLevel(riskScore),
        reason: intent.reason,
        inputs: {
            traderWallet: traderWallet.publicKey,
            solBalance: traderWallet.solBalance,
            usdcBalance: traderWallet.usdcBalance,
            portfolioAllocation: Number(portfolioAllocation.toFixed(4)),
            estimatedSlippageBps: Number(estimatedSlippageBps.toFixed(2)),
            dailyTradeCount: status.jupiterSwapStats.dailySwapCount,
            successRate: Number(successRate.toFixed(4)),
            riskScore,
            pastFiveTrades,
        },
    };
};
exports.getTradeAdvisory = getTradeAdvisory;
