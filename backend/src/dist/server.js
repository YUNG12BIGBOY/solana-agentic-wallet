"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const walletRoutes_1 = __importDefault(require("./routes/walletRoutes"));
const agentRoutes_1 = __importDefault(require("./routes/agentRoutes"));
const riskRoutes_1 = __importDefault(require("./routes/riskRoutes"));
const jupiterRoutes_1 = __importDefault(require("./routes/jupiterRoutes"));
const logRoutes_1 = __importDefault(require("./routes/logRoutes"));
const splRoutes_1 = __importDefault(require("./routes/splRoutes"));
const transactionRoutes_1 = __importDefault(require("./routes/transactionRoutes"));
const env_1 = require("./config/env");
const assertSandboxDevnetConfig = () => {
    if (!env_1.env.sandboxDevnetOnly) {
        return;
    }
    const walletRpcIsDevnet = env_1.env.rpcUrl.toLowerCase().includes("devnet");
    const jupiterRpcIsDevnet = env_1.env.jupiterExecutionRpcUrl.toLowerCase().includes("devnet");
    if (env_1.env.solanaCluster !== "devnet" || !walletRpcIsDevnet || !jupiterRpcIsDevnet) {
        throw new Error("SANDBOX_DEVNET_ONLY=true requires SOLANA_CLUSTER=devnet and devnet RPC endpoints.");
    }
};
assertSandboxDevnetConfig();
const app = (0, express_1.default)();
app.use((0, cors_1.default)());
app.use(express_1.default.json());
app.get("/health", (_req, res) => {
    res.json({
        ok: true,
        cluster: env_1.env.solanaCluster,
        rpcUrl: env_1.env.rpcUrl,
        jupiterEnabled: env_1.env.enableJupiterSwap,
    });
});
app.use("/wallet", walletRoutes_1.default);
app.use("/wallets", walletRoutes_1.default);
app.use("/agent", agentRoutes_1.default);
app.use("/agents", agentRoutes_1.default);
app.use("/risk", riskRoutes_1.default);
app.use("/jupiter", jupiterRoutes_1.default);
app.use("/logs", logRoutes_1.default);
app.use("/transactions", transactionRoutes_1.default);
app.use("/spl", splRoutes_1.default);
exports.default = app;
