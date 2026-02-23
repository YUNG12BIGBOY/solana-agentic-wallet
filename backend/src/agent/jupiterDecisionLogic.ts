import { env } from "../config/env";

export type SwapAction = "SWAP" | "HOLD";
export type SwapDirection = "SOL_TO_USDC" | "USDC_TO_SOL" | "SPL1_TO_SPL2";

export interface JupiterIntent {
  action: SwapAction;
  direction?: SwapDirection;
  amountPct: number;
  confidence: number;
  reason: string;
}

export interface JupiterDecisionInput {
  solBalance: number;
  usdcBalance: number;
  solPriceUsdc: number;
  lastTradeAt: string | null;
  tradeSuccessRate: number;
  dailyTradeCount: number;
  consecutiveFailures: number;
  estimatedSlippageBps: number;
  minSolReserve: number;
  splTokenOneBalance?: number;
  splTokenTwoBalance?: number;
}

const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));

export const decideJupiterIntent = (input: JupiterDecisionInput): JupiterIntent => {
  const totalUsdcValue =
    input.usdcBalance + input.solBalance * Math.max(input.solPriceUsdc, 0);

  if (totalUsdcValue <= 0) {
    return {
      action: "HOLD",
      amountPct: 0,
      confidence: 5,
      reason: "No portfolio value available for allocation analysis.",
    };
  }

  if (input.lastTradeAt) {
    const sinceLastTradeMs = Date.now() - new Date(input.lastTradeAt).getTime();
    if (sinceLastTradeMs < env.jupiterCooldownMs) {
      return {
        action: "HOLD",
        amountPct: 0,
        confidence: 15,
        reason: "Cooldown window active.",
      };
    }
  }

  if (input.dailyTradeCount >= env.jupiterMaxDailySwaps) {
    return {
      action: "HOLD",
      amountPct: 0,
      confidence: 12,
      reason: "Daily swap count limit reached.",
    };
  }

  const solValueUsdc = input.solBalance * Math.max(input.solPriceUsdc, 0);
  const solAllocationRatio = solValueUsdc / totalUsdcValue;
  const drift = solAllocationRatio - env.targetSolAllocationRatio;
  const absDrift = Math.abs(drift);

  if (absDrift < env.allocationDriftThreshold) {
    const splOne = Math.max(input.splTokenOneBalance ?? 0, 0);
    const splTwo = Math.max(input.splTokenTwoBalance ?? 0, 0);
    const totalSpl = splOne + splTwo;
    if (totalSpl > 0) {
      const splDrift = (splOne - splTwo) / totalSpl;
      if (Math.abs(splDrift) > 0.25 && splOne > 1) {
        const splPct = clamp(Math.abs(splDrift) * 0.75, 0.05, env.jupiterMaxSwapPct);
        const splConfidence = clamp(
          48 + Math.abs(splDrift) * 30 - input.consecutiveFailures * 6,
          1,
          95
        );

        return {
          action: "SWAP",
          direction: "SPL1_TO_SPL2",
          amountPct: Number(splPct.toFixed(4)),
          confidence: Number(splConfidence.toFixed(2)),
          reason: "SPL test-token allocation drift exceeded threshold.",
        };
      }
    }

    return {
      action: "HOLD",
      amountPct: 0,
      confidence: 35,
      reason: "Portfolio allocation is within target drift threshold.",
    };
  }

  const direction: SwapDirection = drift > 0 ? "SOL_TO_USDC" : "USDC_TO_SOL";
  const rawPct = clamp(absDrift * 1.4, 0.05, env.jupiterMaxSwapPct);

  let confidence = 50;
  confidence += clamp(absDrift * 120, 0, 25);
  confidence += clamp(input.tradeSuccessRate * 25, 0, 20);
  confidence += input.estimatedSlippageBps <= 50 ? 8 : 0;
  confidence -= input.estimatedSlippageBps >= 150 ? 12 : 0;
  confidence -= clamp(input.consecutiveFailures * 8, 0, 24);
  confidence -= input.solBalance < input.minSolReserve * 2 ? 10 : 0;
  confidence = clamp(confidence, 1, 99);

  return {
    action: "SWAP",
    direction,
    amountPct: Number(rawPct.toFixed(4)),
    confidence: Number(confidence.toFixed(2)),
    reason: `Allocation drift ${absDrift.toFixed(3)} exceeded threshold ${env.allocationDriftThreshold}.`,
  };
};
