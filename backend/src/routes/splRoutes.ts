import { Router } from "express";
import { ensureWalletByLabel } from "../wallet/walletManager";
import { SPLTokenModule } from "../protocols/splTokenModule";
import { emitLog } from "../websocket";
import { toClientError } from "../utils/errors";

const router = Router();

const resolveTopology = async () => {
  const treasury = await ensureWalletByLabel("Treasury Agent");
  const trader = await ensureWalletByLabel("Trader Agent");
  const liquidity = await ensureWalletByLabel("Liquidity Agent");
  const arbitrage = await ensureWalletByLabel("Arbitrage Agent");

  return {
    treasuryWalletPublicKey: treasury.publicKey,
    operationalWalletPublicKeys: [
      trader.publicKey,
      liquidity.publicKey,
      arbitrage.publicKey,
    ],
  };
};

router.post("/initialize", async (_req, res) => {
  try {
    const topology = await resolveTopology();
    const result = await SPLTokenModule.initializeAgentTokenEconomy(topology);
    res.json(result);
  } catch (error) {
    const mapped = toClientError(error);
    emitLog({
      level: "error",
      message: `SPL initialize failed: ${mapped}`,
    });
    res.status(400).json({ error: mapped });
  }
});

router.get("/status", (_req, res) => {
  res.json(SPLTokenModule.getState());
});

router.get("/balances", async (_req, res) => {
  try {
    const state = SPLTokenModule.getState();
    if (!state.mint) {
      return res.json({ mintAddress: null, balances: [] });
    }

    const topology = await resolveTopology();
    const balances = await SPLTokenModule.queryBalances(state.mint, [
      topology.treasuryWalletPublicKey,
      ...topology.operationalWalletPublicKeys,
    ]);

    return res.json({
      mintAddress: state.mint,
      balances,
    });
  } catch (error) {
    const mapped = toClientError(error);
    emitLog({
      level: "error",
      message: `SPL balances query failed: ${mapped}`,
    });
    return res.status(400).json({ error: mapped });
  }
});

router.post("/transfer", async (req, res) => {
  try {
    const { fromWalletPublicKey, toWalletPublicKey, amount, reason } = req.body as {
      fromWalletPublicKey?: string;
      toWalletPublicKey?: string;
      amount?: number;
      reason?: string;
    };

    if (!fromWalletPublicKey || !toWalletPublicKey || !amount) {
      return res.status(400).json({
        error: "fromWalletPublicKey, toWalletPublicKey and amount are required",
      });
    }

    const state = SPLTokenModule.getState();
    if (!state.mint) {
      return res.status(400).json({ error: "AGENT mint is not initialized" });
    }

    const result = await SPLTokenModule.transferBetweenAgents({
      mintAddress: state.mint,
      fromWalletPublicKey,
      toWalletPublicKey,
      amount,
      reason: reason ?? "Manual transfer",
    });

    return res.json(result);
  } catch (error) {
    const mapped = toClientError(error);
    emitLog({
      level: "error",
      message: `SPL transfer failed: ${mapped}`,
    });
    return res.status(400).json({ error: mapped });
  }
});

export default router;
