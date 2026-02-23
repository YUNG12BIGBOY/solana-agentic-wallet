import { env } from "../config/env";

export interface JupiterGovernorInput {
  solBalance: number;
  requestedSwapSol: number;
  requestedSwapPct: number;
  slippageBps: number;
  maxAllowedSlippageBps: number;
  dailySwapCount: number;
  riskScore: number;
}

export interface JupiterGovernorResult {
  allowed: boolean;
  reason: string;
}

export const evaluateJupiterGovernor = (
  input: JupiterGovernorInput
): JupiterGovernorResult => {
  if (input.riskScore > env.jupiterRiskScoreThreshold) {
    return {
      allowed: false,
      reason: `Risk score ${input.riskScore.toFixed(2)} exceeds threshold ${env.jupiterRiskScoreThreshold}.`,
    };
  }

  if (input.slippageBps > input.maxAllowedSlippageBps) {
    return {
      allowed: false,
      reason: `Slippage ${input.slippageBps} bps exceeds allowed threshold ${input.maxAllowedSlippageBps} bps.`,
    };
  }

  if (input.requestedSwapPct > env.jupiterMaxSwapPct) {
    return {
      allowed: false,
      reason: `Requested swap percentage ${input.requestedSwapPct.toFixed(4)} exceeds cap ${env.jupiterMaxSwapPct}.`,
    };
  }

  if (input.dailySwapCount >= env.jupiterMaxDailySwaps) {
    return {
      allowed: false,
      reason: "Daily swap limit reached.",
    };
  }

  if (input.solBalance - input.requestedSwapSol < env.jupiterMinSolReserve) {
    return {
      allowed: false,
      reason: `Swap would violate min SOL reserve (${env.jupiterMinSolReserve}).`,
    };
  }

  return {
    allowed: true,
    reason: "Governor approved swap.",
  };
};
