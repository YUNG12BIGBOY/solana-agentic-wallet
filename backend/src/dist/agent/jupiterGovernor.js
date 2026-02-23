"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.evaluateJupiterGovernor = void 0;
const env_1 = require("../config/env");
const evaluateJupiterGovernor = (input) => {
    if (input.riskScore > env_1.env.jupiterRiskScoreThreshold) {
        return {
            allowed: false,
            reason: `Risk score ${input.riskScore.toFixed(2)} exceeds threshold ${env_1.env.jupiterRiskScoreThreshold}.`,
        };
    }
    if (input.slippageBps > input.maxAllowedSlippageBps) {
        return {
            allowed: false,
            reason: `Slippage ${input.slippageBps} bps exceeds allowed threshold ${input.maxAllowedSlippageBps} bps.`,
        };
    }
    if (input.requestedSwapPct > env_1.env.jupiterMaxSwapPct) {
        return {
            allowed: false,
            reason: `Requested swap percentage ${input.requestedSwapPct.toFixed(4)} exceeds cap ${env_1.env.jupiterMaxSwapPct}.`,
        };
    }
    if (input.dailySwapCount >= env_1.env.jupiterMaxDailySwaps) {
        return {
            allowed: false,
            reason: "Daily swap limit reached.",
        };
    }
    if (input.solBalance - input.requestedSwapSol < env_1.env.jupiterMinSolReserve) {
        return {
            allowed: false,
            reason: `Swap would violate min SOL reserve (${env_1.env.jupiterMinSolReserve}).`,
        };
    }
    return {
        allowed: true,
        reason: "Governor approved swap.",
    };
};
exports.evaluateJupiterGovernor = evaluateJupiterGovernor;
