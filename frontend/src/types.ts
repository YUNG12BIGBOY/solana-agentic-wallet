export interface TokenBalance {
  mint: string;
  amount: number;
  decimals: number;
}

export interface WalletSummary {
  label: string;
  publicKey: string;
  solBalance: number;
  usdcBalance: number;
  tokenBalances: TokenBalance[];
  createdAt: string;
}

export interface WalletState {
  wallets: WalletSummary[];
  activeWallet: WalletSummary | null;
}

export interface WalletReceiveInfo {
  publicKey: string;
  explorerUrl: string;
}

export interface WalletSplReceiveInfo {
  ownerPublicKey: string;
  ownerExplorerUrl: string;
  mint: string;
  associatedTokenAccount: string;
  associatedTokenAccountExplorerUrl: string;
  exists: boolean;
  prepared: boolean;
  preparationSignature?: string;
  preparationExplorerUrl?: string;
}

export type TradeAction = "BUY" | "SELL" | "HOLD";
export type ProtocolName =
  | "hold"
  | "jupiter_swap"
  | "sol_transfer"
  | "spl_transfer";

export interface TradingDecision {
  action: TradeAction;
  protocol: ProtocolName;
  inputMint?: string;
  outputMint?: string;
  amountSol: number;
  slippageBps?: number;
  confidence: number;
  reason: string;
}

export interface JupiterIntent {
  action: "SWAP" | "HOLD";
  direction?: "SOL_TO_USDC" | "USDC_TO_SOL";
  amountPct: number;
  confidence: number;
  reason: string;
}

export interface JupiterSwapStats {
  lastSwapAt: string | null;
  successfulSwaps: number;
  failedSwaps: number;
  dailySwapCount: number;
  dailyKey: string;
  consecutiveSwapFailures: number;
}

export interface AgentTopology {
  treasuryWalletPublicKey: string;
  traderWalletPublicKey: string;
  operationalWalletPublicKeys: string[];
}

export interface SplEconomyRuntime {
  initialized: boolean;
  mintAddress: string | null;
  traderConsecutiveLosses: number;
  traderActivityCount: number;
  activity: Record<string, { count: number; lastActiveAt: string | null }>;
}

export interface RiskSettings {
  maxTradeSizeSol: number;
  maxSlippageBps: number;
  minIntervalMs: number;
  maxConsecutiveFailures: number;
  allowedProtocols: ProtocolName[];
}

export interface RiskRuntime {
  consecutiveFailures: number;
  circuitBreakerOpen: boolean;
  lastExecutionAt: string | null;
  lastError: string | null;
}

export interface RiskStatus {
  settings: RiskSettings;
  runtime: RiskRuntime;
}

export interface AgentStatus {
  running: boolean;
  cycleInProgress: boolean;
  intervalMs: number;
  cycles: number;
  failures: number;
  lastRunAt: string | null;
  lastAction: string;
  lastDecision: TradingDecision | null;
  lastIntent: JupiterIntent | null;
  lastTxSignature: string | null;
  lastExplorerUrl: string | null;
  risk: RiskStatus;
  jupiterSwapStats: JupiterSwapStats;
  topology: AgentTopology | null;
  splEconomy: SplEconomyRuntime;
}

export interface TradeAdvisory {
  recommendation: "SWAP" | "HOLD";
  direction?: "SOL_TO_USDC" | "USDC_TO_SOL";
  suggestedPercentage: number;
  confidence: number;
  riskLevel: "LOW" | "MEDIUM" | "HIGH";
  reason: string;
  inputs: {
    traderWallet: string | null;
    solBalance: number;
    usdcBalance: number;
    portfolioAllocation: number;
    estimatedSlippageBps: number;
    dailyTradeCount: number;
    successRate: number;
    riskScore: number;
    pastFiveTrades: Array<{
      timestamp: string;
      signature?: string;
      slippageBps?: number;
      message: string;
    }>;
  };
}

export type LogLevel = "info" | "warn" | "error" | "success";

export interface LogEvent {
  timestamp: string;
  level: LogLevel;
  message: string;
  txSignature?: string;
  explorerUrl?: string;
  agent?: string; // e.g., "Trader Agent", "Liquidity Agent", "Manual"
  source?: "ai" | "manual"; // Whether action was AI-initiated or user-initiated
  action?: string; // e.g., "SPL_SWAP", "SOL_SWAP", "SPL_TRANSFER", "SIMULATE_SWAP"
  inputMint?: string;
  outputMint?: string;
  inAmount?: number;
  outAmount?: number;
  confidence?: number;
  reason?: string;
  data?: unknown;
}

export interface SystemHealth {
  ok: boolean;
  cluster: "devnet" | "testnet" | "mainnet-beta";
  rpcUrl: string;
  jupiterEnabled: boolean;
}

export interface SplModuleState {
  mint: string | null;
  treasuryWallet: string | null;
  initializedAt: string | null;
  initialDistributionDone: boolean;
}

export interface SplModuleBalanceRow {
  walletPublicKey: string;
  amount: number;
}

export interface SplModuleBalances {
  mintAddress: string | null;
  balances: SplModuleBalanceRow[];
}
