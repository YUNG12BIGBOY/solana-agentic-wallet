"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.env = void 0;
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
const toNumber = (value, fallback) => {
    if (!value)
        return fallback;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
};
const toInteger = (value, fallback) => {
    if (!value)
        return fallback;
    const parsed = Number(value);
    return Number.isInteger(parsed) ? parsed : fallback;
};
const inferClusterFromRpc = (rpcUrl) => {
    const lower = rpcUrl.toLowerCase();
    if (lower.includes("testnet"))
        return "testnet";
    if (lower.includes("mainnet"))
        return "mainnet-beta";
    return "devnet";
};
const resolveCluster = (cluster, rpcUrl) => {
    const requested = (cluster ?? "").trim();
    if (requested === "devnet" || requested === "testnet" || requested === "mainnet-beta") {
        return requested;
    }
    return inferClusterFromRpc(rpcUrl);
};
exports.env = {
    port: toNumber(process.env.PORT, 4000),
    rpcUrl: process.env.RPC_URL ?? "https://api.devnet.solana.com",
    solanaCluster: "devnet",
    enableJupiterSwap: false,
    encryptionSecret: process.env.ENCRYPTION_SECRET ?? "dev-only-change-this-secret",
    openAiApiKey: process.env.OPENAI_KEY ?? process.env.OPENAI_API_KEY ?? "",
    openAiModel: process.env.OPENAI_MODEL ?? "gpt-4o-mini",
    defaultLoopMs: toNumber(process.env.AGENT_LOOP_MS, 30000),
    enableLiveTrades: process.env.ENABLE_LIVE_TRADES === "true",
    sandboxDevnetOnly: process.env.SANDBOX_DEVNET_ONLY !== "false",
    defaultRecipient: process.env.DEFAULT_RECIPIENT ?? "",
    defaultUsdcMint: process.env.USDC_MINT ?? "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
    jupiterQuoteApi: process.env.JUPITER_QUOTE_API ?? "https://lite-api.jup.ag/swap/v1",
    jupiterExecutionRpcUrl: process.env.JUPITER_EXECUTION_RPC_URL ?? "https://api.devnet.solana.com",
    targetSolAllocationRatio: toNumber(process.env.TARGET_SOL_ALLOCATION_RATIO, 0.55),
    allocationDriftThreshold: toNumber(process.env.ALLOCATION_DRIFT_THRESHOLD, 0.08),
    jupiterCooldownMs: toInteger(process.env.JUPITER_COOLDOWN_MS, 5 * 60 * 1000),
    jupiterMaxSwapPct: toNumber(process.env.JUPITER_MAX_SWAP_PCT, 0.25),
    jupiterMinSolReserve: toNumber(process.env.JUPITER_MIN_SOL_RESERVE, 0.05),
    jupiterMaxDailySwaps: toInteger(process.env.JUPITER_MAX_DAILY_SWAPS, 20),
    jupiterRiskScoreThreshold: toNumber(process.env.JUPITER_RISK_SCORE_THRESHOLD, 70),
    agentTokenSymbol: process.env.AGENT_TOKEN_SYMBOL ?? "AGENT",
    agentInitialSupply: toNumber(process.env.AGENT_INITIAL_SUPPLY, 1000000),
    agentTokenDecimals: toInteger(process.env.AGENT_TOKEN_DECIMALS, 6),
    agentRedistributionThreshold: toNumber(process.env.AGENT_REDISTRIBUTION_THRESHOLD, 50000),
    agentActivityMintThreshold: toInteger(process.env.AGENT_ACTIVITY_MINT_THRESHOLD, 5),
    agentRewardMintAmount: toNumber(process.env.AGENT_REWARD_MINT_AMOUNT, 5000),
};
exports.env.solanaCluster = resolveCluster(process.env.SOLANA_CLUSTER, exports.env.rpcUrl);
exports.env.enableJupiterSwap =
    process.env.ENABLE_JUPITER_SWAP === "true" ||
        (process.env.ENABLE_JUPITER_SWAP !== "false" && exports.env.solanaCluster !== "testnet");
if (exports.env.encryptionSecret === "dev-only-change-this-secret") {
    console.warn("WARNING: ENCRYPTION_SECRET is using the insecure default value. Set it in backend/src/.env.");
}
