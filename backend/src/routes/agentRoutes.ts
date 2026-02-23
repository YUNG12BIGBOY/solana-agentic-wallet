import { Router } from "express";
import {
  executeTrade,
  getAgentStatus,
  runAgent,
  runSimulation,
  startAgent,
  stopAgent,
} from "../agent/agentEngine";
import { getTradeAdvisory } from "../agent/tradeAdvisor";
import { toClientError } from "../utils/errors";

const router = Router();

router.get("/status", (_req, res) => {
  res.json(getAgentStatus());
});

router.post("/start", (req, res) => {
  try {
    const { intervalMs } = req.body as { intervalMs?: number };
    res.json(startAgent(intervalMs));
  } catch (error) {
    res.status(400).json({ error: toClientError(error) });
  }
});

router.post("/pause", (_req, res) => {
  res.json(stopAgent());
});

router.post("/run", async (_req, res) => {
  try {
    const status = await runAgent();
    res.json(status);
  } catch (error) {
    res.status(400).json({ error: toClientError(error) });
  }
});

router.post("/execute", async (req, res) => {
  try {
    const { amountSol } = req.body as { amountSol?: number };
    res.json(await executeTrade(amountSol ?? 0.1));
  } catch (error) {
    res.status(400).json({ error: toClientError(error) });
  }
});

router.post("/simulate", async (_req, res) => {
  try {
    res.json(await runSimulation());
  } catch (error) {
    res.status(400).json({ error: toClientError(error) });
  }
});

router.get("/advisor", async (_req, res) => {
  try {
    res.json(await getTradeAdvisory());
  } catch (error) {
    res.status(400).json({ error: toClientError(error) });
  }
});

export default router;
