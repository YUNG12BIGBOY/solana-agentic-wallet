"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.withRpcRetry = void 0;
const env_1 = require("../config/env");
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const isTransientRpcError = (message) => {
    const lower = message.toLowerCase();
    return (lower.includes("fetch failed") ||
        lower.includes("econnreset") ||
        lower.includes("etimedout") ||
        lower.includes("enotfound") ||
        lower.includes("socket hang up") ||
        lower.includes("503"));
};
const withRpcRetry = async (label, fn, maxAttempts = 3) => {
    let lastError;
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
        try {
            return await fn();
        }
        catch (error) {
            lastError = error;
            const message = error instanceof Error ? error.message : String(error);
            const shouldRetry = attempt < maxAttempts && isTransientRpcError(message);
            if (!shouldRetry) {
                throw new Error(`${label} failed against RPC ${env_1.env.rpcUrl}: ${message}`);
            }
            await sleep(200 * attempt);
        }
    }
    throw new Error(`${label} failed against RPC ${env_1.env.rpcUrl}: ${lastError instanceof Error ? lastError.message : String(lastError)}`);
};
exports.withRpcRetry = withRpcRetry;
