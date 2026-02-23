import express from "express";
import cors from "cors";
import walletRoutes from "./routes/walletRoutes";
import agentRoutes from "./routes/agentRoutes";
import riskRoutes from "./routes/riskRoutes";
import jupiterRoutes from "./routes/jupiterRoutes";
import logRoutes from "./routes/logRoutes";
import splRoutes from "./routes/splRoutes";
import transactionRoutes from "./routes/transactionRoutes";
import { env } from "./config/env";

const assertSandboxDevnetConfig = () => {
  if (!env.sandboxDevnetOnly) {
    return;
  }

  const walletRpcIsDevnet = env.rpcUrl.toLowerCase().includes("devnet");
  const jupiterRpcIsDevnet = env.jupiterExecutionRpcUrl.toLowerCase().includes("devnet");

  if (env.solanaCluster !== "devnet" || !walletRpcIsDevnet || !jupiterRpcIsDevnet) {
    throw new Error(
      "SANDBOX_DEVNET_ONLY=true requires SOLANA_CLUSTER=devnet and devnet RPC endpoints."
    );
  }
};

assertSandboxDevnetConfig();

const app = express();

app.use(cors());
app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({
    ok: true,
    cluster: env.solanaCluster,
    rpcUrl: env.rpcUrl,
    jupiterEnabled: env.enableJupiterSwap,
  });
});

app.use("/wallet", walletRoutes);
app.use("/wallets", walletRoutes);
app.use("/agent", agentRoutes);
app.use("/agents", agentRoutes);
app.use("/risk", riskRoutes);
app.use("/jupiter", jupiterRoutes);
app.use("/logs", logRoutes);
app.use("/transactions", transactionRoutes);
app.use("/spl", splRoutes);

export default app;
