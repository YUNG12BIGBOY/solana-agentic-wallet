import { Router } from "express";
import { getRecentLogs } from "../websocket";

const router = Router();

router.get("/", (req, res) => {
  const parsedLimit = Number(req.query.limit ?? 100);
  const limit = Number.isInteger(parsedLimit)
    ? Math.max(1, Math.min(parsedLimit, 500))
    : 100;

  const transactions = getRecentLogs()
    .filter((entry) => entry.txSignature || entry.explorerUrl)
    .slice(-limit)
    .reverse()
    .map((entry) => ({
      timestamp: entry.timestamp,
      level: entry.level,
      message: entry.message,
      signature: entry.txSignature ?? null,
      explorerUrl: entry.explorerUrl ?? null,
      data: entry.data ?? null,
    }));

  res.json({
    count: transactions.length,
    transactions,
  });
});

export default router;
