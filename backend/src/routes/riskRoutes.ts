import { Router } from "express";
import { getRiskStatus, resetCircuitBreaker, updateRisk } from "../agent/riskEngine";

const router = Router();

router.get("/", (_req, res) => {
  res.json(getRiskStatus());
});

router.post("/update", (req, res) => {
  try {
    const next = req.body as Parameters<typeof updateRisk>[0];
    res.json(updateRisk(next));
  } catch (error) {
    res.status(400).json({ error: (error as Error).message });
  }
});

router.post("/reset-circuit-breaker", (_req, res) => {
  res.json(resetCircuitBreaker());
});

export default router;
