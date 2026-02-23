"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.decideJupiterIntent = void 0;
const env_1 = require("../config/env");
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const decideJupiterIntent = (input) => {
    const totalUsdcValue = input.usdcBalance + input.solBalance * Math.max(input.solPriceUsdc, 0);
    if (totalUsdcValue <= 0) {
        return {
            action: "HOLD",
            amountPct: 0,
            confidence: 5,
            reason: "No portfolio value available for allocation analysis.",
        };
    }
    if (input.lastTradeAt) {
        const sinceLastTradeMs = Date.now() - new Date(input.lastTradeAt).getTime();
        if (sinceLastTradeMs < env_1.env.jupiterCooldownMs) {
            return {
                action: "HOLD",
                amountPct: 0,
                confidence: 15,
                reason: "Cooldown window active.",
            };
        }
    }
    if (input.dailyTradeCount >= env_1.env.jupiterMaxDailySwaps) {
        return {
            action: "HOLD",
            amountPct: 0,
            confidence: 12,
            reason: "Daily swap count limit reached.",
        };
    }
    const solValueUsdc = input.solBalance * Math.max(input.solPriceUsdc, 0);
    const solAllocationRatio = solValueUsdc / totalUsdcValue;
    const drift = solAllocationRatio - env_1.env.targetSolAllocationRatio;
    const absDrift = Math.abs(drift);
    if (absDrift < env_1.env.allocationDriftThreshold) {
        return {
            action: "HOLD",
            amountPct: 0,
            confidence: 35,
            reason: "Portfolio allocation is within target drift threshold.",
        };
    }
    const direction = drift > 0 ? "SOL_TO_USDC" : "USDC_TO_SOL";
    const rawPct = clamp(absDrift * 1.4, 0.05, env_1.env.jupiterMaxSwapPct);
    let confidence = 50;
    confidence += clamp(absDrift * 120, 0, 25);
    confidence += clamp(input.tradeSuccessRate * 25, 0, 20);
    confidence += input.estimatedSlippageBps <= 50 ? 8 : 0;
    confidence -= input.estimatedSlippageBps >= 150 ? 12 : 0;
    confidence -= clamp(input.consecutiveFailures * 8, 0, 24);
    confidence -= input.solBalance < input.minSolReserve * 2 ? 10 : 0;
    confidence = clamp(confidence, 1, 99);
    return {
        action: "SWAP",
        direction,
        amountPct: Number(rawPct.toFixed(4)),
        confidence: Number(confidence.toFixed(2)),
        reason: `Allocation drift ${absDrift.toFixed(3)} exceeded threshold ${env_1.env.allocationDriftThreshold}.`,
    };
};
exports.decideJupiterIntent = decideJupiterIntent;
