import { Router } from "express";
import { LAMPORTS_PER_SOL } from "@solana/web3.js";
import { env } from "../config/env";
import { getSwapQuote } from "../protocols/jupiter";
import {
  JupiterSwapModule,
  JupiterSimulateRequest,
} from "../protocols/jupiterSwapModule";
import { emitLog } from "../websocket";
import { toClientError } from "../utils/errors";

const router = Router();

router.get("/quote", async (req, res) => {
  try {
    if (!env.enableJupiterSwap) {
      return res.status(400).json({
        error: "Jupiter quote is disabled for the current network profile",
      });
    }

    const inputMint =
      (req.query.inputMint as string) ?? "So11111111111111111111111111111111111111112";
    const outputMint = (req.query.outputMint as string) ?? env.defaultUsdcMint;
    const amount = Number(req.query.amount ?? Math.floor(0.1 * LAMPORTS_PER_SOL));
    const slippageBps = Number(req.query.slippageBps ?? 100);

    const quote = await getSwapQuote({
      inputMint,
      outputMint,
      amount,
      slippageBps,
    });

    res.json(quote);
  } catch (error) {
    res.status(502).json({ error: toClientError(error) });
  }
});

router.post("/simulate", async (req, res) => {
  try {
    if (!env.enableJupiterSwap) {
      return res.status(400).json({
        error: "Jupiter swap simulation is disabled for the current network profile",
      });
    }

    const {
      walletPublicKey,
      inputMint = "So11111111111111111111111111111111111111112",
      outputMint = env.defaultUsdcMint,
      amountSol = 0.1,
      slippageBps = 100,
      reasoningReference = "Manual /jupiter/simulate route",
      agent,
    } = req.body as {
      walletPublicKey?: string;
      inputMint?: string;
      outputMint?: string;
      amountSol?: number;
      slippageBps?: number;
      reasoningReference?: string;
      agent?: string;
    };

    const result = await JupiterSwapModule.simulateSwap({
      walletPublicKey,
      inputMint,
      outputMint,
      amount: Math.floor(amountSol * LAMPORTS_PER_SOL),
      slippageBps,
      reasoningReference,
      agent: agent ?? "Manual",
      source: "manual",
    });

    res.json(result);
  } catch (error) {
    res.status(400).json({ error: toClientError(error) });
  }
});

router.post("/swap", async (req, res) => {
  try {
    if (!env.enableJupiterSwap) {
      return res.status(400).json({
        error: "Jupiter swap is disabled for the current network profile",
      });
    }

    const {
      walletPublicKey,
      inputMint = "So11111111111111111111111111111111111111112",
      outputMint = env.defaultUsdcMint,
      amountSol = 0.1,
      slippageBps = 100,
      reasoningReference = "Manual /jupiter/swap route",
      dryRun = false,
      agent,
    } = req.body as {
      walletPublicKey?: string;
      inputMint?: string;
      outputMint?: string;
      amountSol?: number;
      slippageBps?: number;
      reasoningReference?: string;
      dryRun?: boolean;
      agent?: string;
    };

    const result = await JupiterSwapModule.executeSwap({
      walletPublicKey,
      inputMint,
      outputMint,
      amount: Math.floor(amountSol * LAMPORTS_PER_SOL),
      slippageBps,
      maxAllowedSlippageBps: slippageBps,
      reasoningReference,
      dryRun,
      agent: agent ?? "Manual",
      source: "manual",
    });

    // Log is already emitted by JupiterSwapModule.executeSwap
    res.json(result);
  } catch (error) {
    res.status(400).json({ error: toClientError(error) });
  }
});

export default router;
