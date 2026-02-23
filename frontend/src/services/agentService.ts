import { api } from "../config/api";
import {
  AgentStatus,
  JupiterIntent,
  RiskSettings,
  RiskStatus,
  SplEconomyRuntime,
  TradeAdvisory,
  TradingDecision,
} from "../types";

interface ExecuteTradeResponse {
  success: boolean;
  txSignature?: string;
  explorerUrl?: string;
}

interface SimulationResponse {
  success: boolean;
  decision: TradingDecision;
  intent?: JupiterIntent;
  splEconomy?: SplEconomyRuntime;
}

export const fetchAgentStatus = async () => {
  const { data } = await api.get<AgentStatus>("/agent/status");
  return data;
};

export const runAgent = async () => {
  const { data } = await api.post<AgentStatus>("/agent/run");
  return data;
};

export const startAgent = async (intervalMs?: number) => {
  const { data } = await api.post<AgentStatus>("/agent/start", { intervalMs });
  return data;
};

export const pauseAgent = async () => {
  const { data } = await api.post<AgentStatus>("/agent/pause");
  return data;
};

export const executeTrade = async (amountSol = 0.1) => {
  const { data } = await api.post<ExecuteTradeResponse>("/agent/execute", {
    amountSol,
  });
  return data;
};

export const runSimulation = async () => {
  const { data } = await api.post<SimulationResponse>("/agent/simulate");
  return data;
};

export const fetchRiskStatus = async () => {
  const { data } = await api.get<RiskStatus>("/risk");
  return data;
};

export const updateRiskSettings = async (settings: Partial<RiskSettings>) => {
  const { data } = await api.post<RiskStatus>("/risk/update", settings);
  return data;
};

export const resetCircuitBreaker = async () => {
  const { data } = await api.post<RiskStatus>("/risk/reset-circuit-breaker");
  return data;
};

export const fetchJupiterQuote = async (
  amountSol = 0.1,
  opts?: { inputMint?: string; outputMint?: string; slippageBps?: number }
) => {
  const lamports = Math.floor(amountSol * 1_000_000_000);
  const { data } = await api.get("/jupiter/quote", {
    params: {
      amount: lamports,
      inputMint: opts?.inputMint,
      outputMint: opts?.outputMint,
      slippageBps: opts?.slippageBps,
    },
  });
  return data;
};

export interface JupiterSimulateRequest {
  walletPublicKey?: string;
  inputMint?: string;
  outputMint?: string;
  amountSol?: number;
  slippageBps?: number;
  reasoningReference?: string;
  agent?: string;
}

export interface JupiterSimulateResponse {
  success: boolean;
  simulatedOutput: number;
  computeUnits?: number;
  logs?: string[];
  error?: string;
  route: string[];
  inAmount: number;
  outAmount: number;
  slippageBps: number;
  quote: any;
}

export const simulateJupiterSwap = async (request: JupiterSimulateRequest) => {
  const { data } = await api.post<JupiterSimulateResponse>("/jupiter/simulate", {
    walletPublicKey: request.walletPublicKey,
    inputMint: request.inputMint,
    outputMint: request.outputMint,
    amountSol: request.amountSol,
    slippageBps: request.slippageBps,
    reasoningReference: request.reasoningReference,
    agent: request.agent,
  });
  return data;
};

export interface JupiterSwapRequest {
  walletPublicKey?: string;
  inputMint?: string;
  outputMint?: string;
  amountSol?: number;
  slippageBps?: number;
  reasoningReference?: string;
  dryRun?: boolean;
  agent?: string;
}

export interface JupiterSwapResponse {
  signature?: string;
  explorerUrl?: string;
  signedTransactionBase64?: string;
  route: string[];
  inAmount: number;
  outAmount: number;
  slippageBps: number;
  quote: any;
}

export const executeJupiterSwap = async (request: JupiterSwapRequest) => {
  const { data } = await api.post<JupiterSwapResponse>("/jupiter/swap", request);
  return data;
};

export const fetchTradeAdvisory = async () => {
  const { data } = await api.get<TradeAdvisory>("/agents/advisor");
  return data;
};
