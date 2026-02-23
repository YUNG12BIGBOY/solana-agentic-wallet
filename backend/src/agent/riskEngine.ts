import { env } from "../config/env";

export type SupportedProtocol =
  | "hold"
  | "jupiter_swap"
  | "sol_transfer"
  | "spl_transfer";

export interface RiskSettings {
  maxTradeSizeSol: number;
  maxSlippageBps: number;
  minIntervalMs: number;
  maxConsecutiveFailures: number;
  allowedProtocols: SupportedProtocol[];
}

export interface RiskRuntime {
  consecutiveFailures: number;
  circuitBreakerOpen: boolean;
  lastExecutionAt: string | null;
  lastError: string | null;
}

export interface TradeIntent {
  protocol: SupportedProtocol;
  amountSol: number;
  slippageBps?: number;
}

let settings: RiskSettings = {
  maxTradeSizeSol: 0.5,
  maxSlippageBps: 100,
  minIntervalMs: 10_000,
  maxConsecutiveFailures: 3,
  allowedProtocols: env.enableJupiterSwap
    ? ["hold", "jupiter_swap", "sol_transfer", "spl_transfer"]
    : ["hold", "sol_transfer", "spl_transfer"],
};

const runtime: RiskRuntime = {
  consecutiveFailures: 0,
  circuitBreakerOpen: false,
  lastExecutionAt: null,
  lastError: null,
};

const nowMs = () => Date.now();

export const getRiskStatus = () => ({
  settings,
  runtime: { ...runtime },
});

export const updateRisk = (next: Partial<RiskSettings>) => {
  const merged: RiskSettings = {
    ...settings,
    ...next,
    allowedProtocols: next.allowedProtocols ?? settings.allowedProtocols,
  };

  if (!Number.isFinite(merged.maxTradeSizeSol) || merged.maxTradeSizeSol <= 0) {
    throw new Error("maxTradeSizeSol must be a positive number");
  }

  if (!Number.isInteger(merged.maxSlippageBps) || merged.maxSlippageBps <= 0) {
    throw new Error("maxSlippageBps must be a positive integer");
  }

  if (!Number.isInteger(merged.minIntervalMs) || merged.minIntervalMs < 0) {
    throw new Error("minIntervalMs must be a non-negative integer");
  }

  if (
    !Number.isInteger(merged.maxConsecutiveFailures) ||
    merged.maxConsecutiveFailures <= 0
  ) {
    throw new Error("maxConsecutiveFailures must be a positive integer");
  }

  if (!Array.isArray(merged.allowedProtocols) || merged.allowedProtocols.length === 0) {
    throw new Error("allowedProtocols must include at least one protocol");
  }

  settings = merged;
  return getRiskStatus();
};

export const resetCircuitBreaker = () => {
  runtime.consecutiveFailures = 0;
  runtime.circuitBreakerOpen = false;
  runtime.lastError = null;
  return getRiskStatus();
};

export const assertTradeAllowed = (intent: TradeIntent) => {
  if (runtime.circuitBreakerOpen) {
    throw new Error("Circuit breaker is open. Reset risk runtime to continue.");
  }

  if (!settings.allowedProtocols.includes(intent.protocol)) {
    throw new Error(`Protocol ${intent.protocol} is not allowed`);
  }

  if (intent.amountSol > settings.maxTradeSizeSol) {
    throw new Error(
      `Trade size ${intent.amountSol} SOL exceeds maxTradeSizeSol ${settings.maxTradeSizeSol}`
    );
  }

  if (intent.slippageBps && intent.slippageBps > settings.maxSlippageBps) {
    throw new Error(
      `slippageBps ${intent.slippageBps} exceeds maxSlippageBps ${settings.maxSlippageBps}`
    );
  }

  if (runtime.lastExecutionAt) {
    const elapsed = nowMs() - new Date(runtime.lastExecutionAt).getTime();
    if (elapsed < settings.minIntervalMs) {
      throw new Error(
        `Rate limit active: wait ${Math.ceil((settings.minIntervalMs - elapsed) / 1000)}s`
      );
    }
  }
};

export const recordExecutionSuccess = () => {
  runtime.consecutiveFailures = 0;
  runtime.circuitBreakerOpen = false;
  runtime.lastError = null;
  runtime.lastExecutionAt = new Date().toISOString();
};

export const recordExecutionFailure = (error: unknown) => {
  runtime.consecutiveFailures += 1;
  runtime.lastError = error instanceof Error ? error.message : String(error);
  runtime.lastExecutionAt = new Date().toISOString();

  if (runtime.consecutiveFailures >= settings.maxConsecutiveFailures) {
    runtime.circuitBreakerOpen = true;
  }
};
