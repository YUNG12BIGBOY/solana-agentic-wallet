"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.recordExecutionFailure = exports.recordExecutionSuccess = exports.assertTradeAllowed = exports.resetCircuitBreaker = exports.updateRisk = exports.getRiskStatus = void 0;
const env_1 = require("../config/env");
let settings = {
    maxTradeSizeSol: 0.5,
    maxSlippageBps: 100,
    minIntervalMs: 10000,
    maxConsecutiveFailures: 3,
    allowedProtocols: env_1.env.enableJupiterSwap
        ? ["hold", "jupiter_swap", "sol_transfer", "spl_transfer"]
        : ["hold", "sol_transfer", "spl_transfer"],
};
const runtime = {
    consecutiveFailures: 0,
    circuitBreakerOpen: false,
    lastExecutionAt: null,
    lastError: null,
};
const nowMs = () => Date.now();
const getRiskStatus = () => ({
    settings,
    runtime: { ...runtime },
});
exports.getRiskStatus = getRiskStatus;
const updateRisk = (next) => {
    const merged = {
        ...settings,
        ...next,
        allowedProtocols: next.allowedProtocols ?? settings.allowedProtocols,
    };
    if (!Number.isFinite(merged.maxTradeSizeSol) || merged.maxTradeSizeSol <= 0) {
        throw new Error("maxTradeSizeSol must be a positive number");
    }
    if (!Number.isInteger(merged.maxSlippageBps) || merged.maxSlippageBps <= 0) {
        throw new Error("maxSlippageBps must be a positive integer");
    }
    if (!Number.isInteger(merged.minIntervalMs) || merged.minIntervalMs < 0) {
        throw new Error("minIntervalMs must be a non-negative integer");
    }
    if (!Number.isInteger(merged.maxConsecutiveFailures) ||
        merged.maxConsecutiveFailures <= 0) {
        throw new Error("maxConsecutiveFailures must be a positive integer");
    }
    if (!Array.isArray(merged.allowedProtocols) || merged.allowedProtocols.length === 0) {
        throw new Error("allowedProtocols must include at least one protocol");
    }
    settings = merged;
    return (0, exports.getRiskStatus)();
};
exports.updateRisk = updateRisk;
const resetCircuitBreaker = () => {
    runtime.consecutiveFailures = 0;
    runtime.circuitBreakerOpen = false;
    runtime.lastError = null;
    return (0, exports.getRiskStatus)();
};
exports.resetCircuitBreaker = resetCircuitBreaker;
const assertTradeAllowed = (intent) => {
    if (runtime.circuitBreakerOpen) {
        throw new Error("Circuit breaker is open. Reset risk runtime to continue.");
    }
    if (!settings.allowedProtocols.includes(intent.protocol)) {
        throw new Error(`Protocol ${intent.protocol} is not allowed`);
    }
    if (intent.amountSol > settings.maxTradeSizeSol) {
        throw new Error(`Trade size ${intent.amountSol} SOL exceeds maxTradeSizeSol ${settings.maxTradeSizeSol}`);
    }
    if (intent.slippageBps && intent.slippageBps > settings.maxSlippageBps) {
        throw new Error(`slippageBps ${intent.slippageBps} exceeds maxSlippageBps ${settings.maxSlippageBps}`);
    }
    if (runtime.lastExecutionAt) {
        const elapsed = nowMs() - new Date(runtime.lastExecutionAt).getTime();
        if (elapsed < settings.minIntervalMs) {
            throw new Error(`Rate limit active: wait ${Math.ceil((settings.minIntervalMs - elapsed) / 1000)}s`);
        }
    }
};
exports.assertTradeAllowed = assertTradeAllowed;
const recordExecutionSuccess = () => {
    runtime.consecutiveFailures = 0;
    runtime.circuitBreakerOpen = false;
    runtime.lastError = null;
    runtime.lastExecutionAt = new Date().toISOString();
};
exports.recordExecutionSuccess = recordExecutionSuccess;
const recordExecutionFailure = (error) => {
    runtime.consecutiveFailures += 1;
    runtime.lastError = error instanceof Error ? error.message : String(error);
    runtime.lastExecutionAt = new Date().toISOString();
    if (runtime.consecutiveFailures >= settings.maxConsecutiveFailures) {
        runtime.circuitBreakerOpen = true;
    }
};
exports.recordExecutionFailure = recordExecutionFailure;
