import { LAMPORTS_PER_SOL } from "@solana/web3.js";
import { env } from "../config/env";
import { getWalletState } from "../wallet/walletManager";
import { getRecentLogs } from "../websocket";
import { JupiterSwapModule } from "../protocols/jupiterSwapModule";
import { decideJupiterIntent } from "./jupiterDecisionLogic";
import { getRiskStatus } from "./riskEngine";
import { getAgentStatus } from "./agentEngine";

type RecommendationAction = "SWAP" | "HOLD";
type RecommendationDirection = "SOL_TO_USDC" | "USDC_TO_SOL" | "SPL1_TO_SPL2";
type AdvisoryRiskLevel = "LOW" | "MEDIUM" | "HIGH";

export interface TradeAdvisory {
  recommendation: RecommendationAction;
  direction?: RecommendationDirection;
  suggestedPercentage: number;
  confidence: number;
  riskLevel: AdvisoryRiskLevel;
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

const WSOL_MINT = "So11111111111111111111111111111111111111112";
const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));

const parseSlippage = (value: unknown): number | undefined => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  return undefined;
};

const estimateSolPriceUsdc = async () => {
  if (!env.enableJupiterSwap) {
    return 100;
  }

  try {
    const quote = await JupiterSwapModule.fetchQuote({
      inputMint: WSOL_MINT,
      outputMint: env.defaultUsdcMint,
      amount: LAMPORTS_PER_SOL,
      slippageBps: getRiskStatus().settings.maxSlippageBps,
    });
    const outAmount = Number((quote as { outAmount?: string }).outAmount ?? 0);
    if (!Number.isFinite(outAmount) || outAmount <= 0) {
      return 100;
    }
    return outAmount / 1_000_000;
  } catch {
    return 100;
  }
};

const toRiskLevel = (riskScore: number): AdvisoryRiskLevel => {
  if (riskScore >= 65) {
    return "HIGH";
  }
  if (riskScore >= 35) {
    return "MEDIUM";
  }
  return "LOW";
};

export const getTradeAdvisory = async (): Promise<TradeAdvisory> => {
  const status = getAgentStatus();
  const walletState = await getWalletState();
  const traderWalletPublicKey = status.topology?.traderWalletPublicKey ?? null;
  const traderWallet =
    (traderWalletPublicKey
      ? walletState.wallets.find((wallet) => wallet.publicKey === traderWalletPublicKey)
      : null) ?? walletState.activeWallet;

  if (!traderWallet) {
    return {
      recommendation: "HOLD",
      suggestedPercentage: 0,
      confidence: 0.1,
      riskLevel: "MEDIUM",
      reason: "No active trader wallet available.",
      inputs: {
        traderWallet: null,
        solBalance: 0,
        usdcBalance: 0,
        portfolioAllocation: 0,
        estimatedSlippageBps: getRiskStatus().settings.maxSlippageBps,
        dailyTradeCount: 0,
        successRate: 0,
        riskScore: 50,
        pastFiveTrades: [],
      },
    };
  }

  const pastFiveTrades = getRecentLogs()
    .filter((entry) => entry.txSignature || entry.explorerUrl)
    .slice(-5)
    .reverse()
    .map((entry) => {
      const data = (entry.data ?? {}) as { slippageBps?: unknown };
      return {
        timestamp: entry.timestamp,
        signature: entry.txSignature,
        slippageBps: parseSlippage(data.slippageBps),
        message: entry.message,
      };
    });

  const slippageSamples = pastFiveTrades
    .map((trade) => trade.slippageBps)
    .filter((value): value is number => typeof value === "number");
  const estimatedSlippageBps =
    slippageSamples.length > 0
      ? slippageSamples.reduce((sum, value) => sum + value, 0) / slippageSamples.length
      : getRiskStatus().settings.maxSlippageBps;

  const totalTrades =
    status.jupiterSwapStats.successfulSwaps + status.jupiterSwapStats.failedSwaps;
  const successRate =
    totalTrades === 0 ? 1 : status.jupiterSwapStats.successfulSwaps / totalTrades;
  const solPriceUsdc = await estimateSolPriceUsdc();

  const intent = decideJupiterIntent({
    solBalance: traderWallet.solBalance,
    usdcBalance: traderWallet.usdcBalance,
    solPriceUsdc,
    lastTradeAt: status.jupiterSwapStats.lastSwapAt,
    tradeSuccessRate: successRate,
    dailyTradeCount: status.jupiterSwapStats.dailySwapCount,
    consecutiveFailures: status.jupiterSwapStats.consecutiveSwapFailures,
    estimatedSlippageBps,
    minSolReserve: env.jupiterMinSolReserve,
    splTokenOneBalance:
      traderWallet.tokenBalances.find((token) => token.mint === status.splEconomy.testTokenOneMint)
        ?.amount ?? 0,
    splTokenTwoBalance:
      traderWallet.tokenBalances.find((token) => token.mint === status.splEconomy.testTokenTwoMint)
        ?.amount ?? 0,
  });

  const totalPortfolioUsdc =
    traderWallet.usdcBalance + traderWallet.solBalance * Math.max(solPriceUsdc, 0);
  const portfolioAllocation =
    totalPortfolioUsdc > 0
      ? (traderWallet.solBalance * Math.max(solPriceUsdc, 0)) / totalPortfolioUsdc
      : 0;

  const riskScore = Number(
    clamp(
      status.jupiterSwapStats.consecutiveSwapFailures * 18 +
        estimatedSlippageBps / 5 +
        (traderWallet.solBalance < env.jupiterMinSolReserve ? 25 : 0) +
        (1 - successRate) * 20,
      0,
      100
    ).toFixed(2)
  );

  return {
    recommendation: intent.action,
    direction: intent.direction,
    suggestedPercentage: intent.amountPct,
    confidence: Number((intent.confidence / 100).toFixed(2)),
    riskLevel: toRiskLevel(riskScore),
    reason: intent.reason,
    inputs: {
      traderWallet: traderWallet.publicKey,
      solBalance: traderWallet.solBalance,
      usdcBalance: traderWallet.usdcBalance,
      portfolioAllocation: Number(portfolioAllocation.toFixed(4)),
      estimatedSlippageBps: Number(estimatedSlippageBps.toFixed(2)),
      dailyTradeCount: status.jupiterSwapStats.dailySwapCount,
      successRate: Number(successRate.toFixed(4)),
      riskScore,
      pastFiveTrades,
    },
  };
};
