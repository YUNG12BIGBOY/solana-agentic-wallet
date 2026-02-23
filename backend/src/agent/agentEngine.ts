import { LAMPORTS_PER_SOL } from "@solana/web3.js";
import { env } from "../config/env";
import {
  assertTradeAllowed,
  getRiskStatus,
  recordExecutionFailure,
  recordExecutionSuccess,
} from "./riskEngine";
import { emitLog } from "../websocket";
import {
  AgentDecision,
  getLLMDecision,
} from "./decisionEngine";
import {
  ensureWalletByLabel,
  getActiveWalletPublicKey,
  getWalletState,
  switchWallet,
} from "../wallet/walletManager";
import {
  decideJupiterIntent,
  JupiterIntent,
} from "./jupiterDecisionLogic";
import { evaluateJupiterGovernor } from "./jupiterGovernor";
import { JupiterSwapModule } from "../protocols/jupiterSwapModule";
import {
  AgentTopology,
  getSplEconomyStatus,
  handleTraderSwapOutcome,
  initializeSplEconomy,
  maybeMintActivityRewards,
  maybeRedistributeFromTreasury,
} from "./splEconomyEngine";

interface SwapStats {
  lastSwapAt: string | null;
  successfulSwaps: number;
  failedSwaps: number;
  dailySwapCount: number;
  dailyKey: string;
  consecutiveSwapFailures: number;
}

interface AgentRuntime {
  running: boolean;
  cycleInProgress: boolean;
  intervalMs: number;
  timer: NodeJS.Timeout | null;
  cycles: number;
  failures: number;
  lastRunAt: string | null;
  lastAction: string;
  lastDecision: AgentDecision | null;
  lastIntent: JupiterIntent | null;
  lastTxSignature: string | null;
  lastExplorerUrl: string | null;
  topology: AgentTopology | null;
  swapStats: SwapStats;
}

const todayKey = () => new Date().toISOString().slice(0, 10);

const runtime: AgentRuntime = {
  running: false,
  cycleInProgress: false,
  intervalMs: env.defaultLoopMs,
  timer: null,
  cycles: 0,
  failures: 0,
  lastRunAt: null,
  lastAction: "Agent initialized",
  lastDecision: null,
  lastIntent: null,
  lastTxSignature: null,
  lastExplorerUrl: null,
  topology: null,
  swapStats: {
    lastSwapAt: null,
    successfulSwaps: 0,
    failedSwaps: 0,
    dailySwapCount: 0,
    dailyKey: todayKey(),
    consecutiveSwapFailures: 0,
  },
};

const WSOL_MINT = "So11111111111111111111111111111111111111112";
const USDC_DECIMALS = 6;

const setLastExecution = (result: {
  message: string;
  txSignature?: string;
  explorerUrl?: string;
}) => {
  runtime.lastAction = result.message;
  runtime.lastTxSignature = result.txSignature ?? null;
  runtime.lastExplorerUrl = result.explorerUrl ?? null;
  runtime.lastRunAt = new Date().toISOString();
};

const resetDailyCountersIfNeeded = () => {
  const key = todayKey();
  if (runtime.swapStats.dailyKey !== key) {
    runtime.swapStats.dailyKey = key;
    runtime.swapStats.dailySwapCount = 0;
  }
};

const ensureTopology = async () => {
  if (runtime.topology) {
    return runtime.topology;
  }

  const previousActive = getActiveWalletPublicKey();
  const treasury = await ensureWalletByLabel("Treasury Agent");
  const trader = await ensureWalletByLabel("Trader Agent");
  const liquidity = await ensureWalletByLabel("Liquidity Agent");
  const arbitrage = await ensureWalletByLabel("Arbitrage Agent");

  if (previousActive) {
    await switchWallet(previousActive).catch(() => undefined);
  }

  runtime.topology = {
    treasuryWalletPublicKey: treasury.publicKey,
    traderWalletPublicKey: trader.publicKey,
    operationalWalletPublicKeys: [
      trader.publicKey,
      liquidity.publicKey,
      arbitrage.publicKey,
    ],
  };

  try {
    await initializeSplEconomy(runtime.topology);
  } catch (error) {
    const message =
      error instanceof Error && error.message.trim()
        ? error.message
        : "SPL economy initialization failed with an unknown error.";
    emitLog({
      level: "warn",
      message,
    });
  }

  return runtime.topology;
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

    const outAmountRaw = Number((quote as { outAmount?: string }).outAmount ?? 0);
    if (!Number.isFinite(outAmountRaw) || outAmountRaw <= 0) {
      return 100;
    }

    return outAmountRaw / 10 ** USDC_DECIMALS;
  } catch {
    return 100;
  }
};

const mapIntentToDecision = (intent: JupiterIntent, amountSol: number): AgentDecision => {
  if (intent.action === "HOLD" || !intent.direction) {
    return {
      action: "HOLD",
      protocol: "hold",
      amountSol: 0.1,
      slippageBps: getRiskStatus().settings.maxSlippageBps,
      confidence: intent.confidence,
      reason: intent.reason,
    };
  }

  return {
    action: intent.direction === "SOL_TO_USDC" ? "SELL" : "BUY",
    protocol: "jupiter_swap",
    inputMint: intent.direction === "SOL_TO_USDC" ? WSOL_MINT : env.defaultUsdcMint,
    outputMint: intent.direction === "SOL_TO_USDC" ? env.defaultUsdcMint : WSOL_MINT,
    amountSol,
    slippageBps: getRiskStatus().settings.maxSlippageBps,
    confidence: intent.confidence,
    reason: intent.reason,
  };
};

const buildIntentContext = async () => {
  resetDailyCountersIfNeeded();

  const topology = await ensureTopology();
  const walletState = await getWalletState();
  const traderWallet = walletState.wallets.find(
    (wallet) => wallet.publicKey === topology.traderWalletPublicKey
  );

  if (!traderWallet) {
    throw new Error("Trader wallet is missing from wallet state.");
  }

  const solPriceUsdc = await estimateSolPriceUsdc();
  const totalTrades = runtime.swapStats.successfulSwaps + runtime.swapStats.failedSwaps;
  const successRate =
    totalTrades === 0 ? 1 : runtime.swapStats.successfulSwaps / totalTrades;

  const intent = decideJupiterIntent({
    solBalance: traderWallet.solBalance,
    usdcBalance: traderWallet.usdcBalance,
    solPriceUsdc,
    lastTradeAt: runtime.swapStats.lastSwapAt,
    tradeSuccessRate: successRate,
    dailyTradeCount: runtime.swapStats.dailySwapCount,
    consecutiveFailures: runtime.swapStats.consecutiveSwapFailures,
    estimatedSlippageBps: getRiskStatus().settings.maxSlippageBps,
    minSolReserve: env.jupiterMinSolReserve,
  });

  let amountSol = 0;
  let notionalUsdc = 0;
  if (intent.action === "SWAP" && intent.direction === "SOL_TO_USDC") {
    amountSol = Number((traderWallet.solBalance * intent.amountPct).toFixed(6));
    notionalUsdc = amountSol * solPriceUsdc;
  } else if (intent.action === "SWAP" && intent.direction === "USDC_TO_SOL") {
    notionalUsdc = traderWallet.usdcBalance * intent.amountPct;
    amountSol = Number((notionalUsdc / Math.max(solPriceUsdc, 0.0001)).toFixed(6));
  }

  return {
    topology,
    traderWallet,
    intent,
    amountSol: Math.max(amountSol, 0),
    notionalUsdc: Math.max(notionalUsdc, 0),
    solPriceUsdc,
    successRate,
  };
};

const runDeterministicCycle = async () => {
  const context = await buildIntentContext();
  const decision = mapIntentToDecision(context.intent, context.amountSol);
  runtime.lastDecision = decision;
  runtime.lastIntent = context.intent;

  emitLog({
    level: "info",
    message: `Decision: ${context.intent.action} ${context.intent.direction ?? ""}`,
    agent: "Trader Agent",
    source: "ai",
    action: context.intent.action === "SWAP" ? "SPL_SWAP" : "HOLD",
    confidence: context.intent.confidence,
    reason: context.intent.reason,
    data: {
      confidence: context.intent.confidence,
      reason: context.intent.reason,
      amountPct: context.intent.amountPct,
    },
  });

  if (context.intent.action === "HOLD") {
    setLastExecution({
      message: `HOLD: ${context.intent.reason}`,
    });
    return getAgentStatus();
  }

  if (!env.enableJupiterSwap) {
    const reason = "Jupiter swap is disabled by environment configuration.";
    emitLog({ level: "warn", message: reason });
    setLastExecution({ message: reason });
    return getAgentStatus();
  }

  const riskScore =
    context.intent.confidence < 1
      ? 100
      : Number(
          (
            runtime.swapStats.consecutiveSwapFailures * 18 +
            getRiskStatus().settings.maxSlippageBps / 5 +
            (context.traderWallet.solBalance < env.jupiterMinSolReserve ? 25 : 0) +
            (1 - context.successRate) * 20
          ).toFixed(2)
        );

  const governor = evaluateJupiterGovernor({
    solBalance: context.traderWallet.solBalance,
    requestedSwapSol: context.amountSol,
    requestedSwapPct: context.intent.amountPct,
    slippageBps: getRiskStatus().settings.maxSlippageBps,
    maxAllowedSlippageBps: getRiskStatus().settings.maxSlippageBps,
    dailySwapCount: runtime.swapStats.dailySwapCount,
    riskScore,
  });

  if (!governor.allowed) {
    emitLog({
      level: "warn",
      message: `Governor rejected swap: ${governor.reason}`,
      agent: "Trader Agent",
      source: "ai",
      action: "SPL_SWAP",
      reason: governor.reason,
    });
    setLastExecution({
      message: `Swap blocked: ${governor.reason}`,
    });
    return getAgentStatus();
  }

  assertTradeAllowed({
    protocol: "jupiter_swap",
    amountSol: context.amountSol,
    slippageBps: getRiskStatus().settings.maxSlippageBps,
  });

  try {
    const inputMint =
      context.intent.direction === "SOL_TO_USDC" ? WSOL_MINT : env.defaultUsdcMint;
    const outputMint =
      context.intent.direction === "SOL_TO_USDC" ? env.defaultUsdcMint : WSOL_MINT;

    const execution = await JupiterSwapModule.executeSwap({
      walletPublicKey: context.topology.traderWalletPublicKey,
      inputMint,
      outputMint,
      amount:
        context.intent.direction === "SOL_TO_USDC"
          ? Math.floor(context.amountSol * LAMPORTS_PER_SOL)
          : Math.floor(context.notionalUsdc * 10 ** USDC_DECIMALS),
      slippageBps: getRiskStatus().settings.maxSlippageBps,
      maxAllowedSlippageBps: getRiskStatus().settings.maxSlippageBps,
      reasoningReference: context.intent.reason,
      agent: "Trader Agent",
      source: "ai",
    });

    runtime.swapStats.lastSwapAt = new Date().toISOString();
    runtime.swapStats.dailySwapCount += 1;
    runtime.swapStats.successfulSwaps += 1;
    runtime.swapStats.consecutiveSwapFailures = 0;

    await handleTraderSwapOutcome({
      topology: context.topology,
      successful: true,
      profitable:
        execution.slippageBps <= getRiskStatus().settings.maxSlippageBps * 0.6,
      notionalUsdc: context.notionalUsdc,
    });
    await maybeMintActivityRewards(context.topology);
    await maybeRedistributeFromTreasury(context.topology);

    recordExecutionSuccess();
    runtime.cycles += 1;
    setLastExecution({
      message: `Jupiter swap executed (${context.intent.direction})`,
      txSignature: execution.signature,
      explorerUrl: execution.explorerUrl,
    });

    emitLog({
      level: "success",
      message: `Swap executed: ${context.intent.direction}`,
      txSignature: execution.signature,
      explorerUrl: execution.explorerUrl,
      agent: "Trader Agent",
      source: "ai",
      action: "SPL_SWAP",
      inputMint,
      outputMint,
      inAmount: execution.inAmount,
      outAmount: execution.outAmount,
      confidence: context.intent.confidence,
      reason: context.intent.reason,
      data: {
        route: execution.route,
        inAmount: execution.inAmount,
        outAmount: execution.outAmount,
        reasoning: context.intent.reason,
      },
    });

    return getAgentStatus();
  } catch (error) {
    runtime.swapStats.failedSwaps += 1;
    runtime.swapStats.consecutiveSwapFailures += 1;
    runtime.swapStats.lastSwapAt = new Date().toISOString();

    await handleTraderSwapOutcome({
      topology: context.topology,
      successful: false,
      profitable: false,
      notionalUsdc: context.notionalUsdc,
    });

    recordExecutionFailure(error);
    runtime.failures += 1;
    runtime.lastRunAt = new Date().toISOString();
    runtime.lastAction = "Execution failed";

    emitLog({
      level: "error",
      message: error instanceof Error ? error.message : String(error),
      agent: "Trader Agent",
      source: "ai",
      action: "SPL_SWAP",
      reason: context.intent.reason,
    });

    throw error;
  }
};

const cycle = async () => {
  if (runtime.cycleInProgress) {
    return getAgentStatus();
  }

  runtime.cycleInProgress = true;
  let statusAfterRun: ReturnType<typeof getAgentStatus> | null = null;
  try {
    emitLog({
      level: "info",
      message: "Agent cycle started",
      data: {
        profile: "deterministic_jupiter_strategy",
      },
    });

    statusAfterRun = await runDeterministicCycle();
  } finally {
    runtime.cycleInProgress = false;
  }

  return statusAfterRun ?? getAgentStatus();
};

export const runAgent = async () => cycle();

export const startAgent = (intervalMs = env.defaultLoopMs) => {
  if (runtime.running) {
    return getAgentStatus();
  }

  runtime.running = true;
  runtime.intervalMs = intervalMs;
  emitLog({
    level: "info",
    message: `Autonomous loop started (${intervalMs}ms interval)`,
  });

  void cycle().catch(() => undefined);
  runtime.timer = setInterval(() => {
    void cycle().catch(() => undefined);
  }, intervalMs);

  return getAgentStatus();
};

export const stopAgent = () => {
  if (runtime.timer) {
    clearInterval(runtime.timer);
    runtime.timer = null;
  }

  runtime.running = false;
  emitLog({
    level: "warn",
    message: "Autonomous loop paused",
  });

  return getAgentStatus();
};

export const executeTrade = async (amountSol = 0.1) => {
  if (!env.enableJupiterSwap) {
    throw new Error(
      "Jupiter execution is disabled. Enable ENABLE_JUPITER_SWAP=true and use devnet balances."
    );
  }

  const topology = await ensureTopology();
  const walletState = await getWalletState();
  const traderWallet = walletState.wallets.find(
    (wallet) => wallet.publicKey === topology.traderWalletPublicKey
  );

  if (!traderWallet) {
    throw new Error("Trader wallet is missing from wallet state.");
  }

  if (!Number.isFinite(amountSol) || amountSol <= 0) {
    throw new Error("amountSol must be greater than 0");
  }

  const maxSwapPct =
    traderWallet.solBalance > 0 ? Number((amountSol / traderWallet.solBalance).toFixed(6)) : 1;
  const totalTrades = runtime.swapStats.successfulSwaps + runtime.swapStats.failedSwaps;
  const successRate =
    totalTrades === 0 ? 1 : runtime.swapStats.successfulSwaps / totalTrades;
  const riskScore = Number(
    (
      runtime.swapStats.consecutiveSwapFailures * 18 +
      getRiskStatus().settings.maxSlippageBps / 5 +
      (traderWallet.solBalance < env.jupiterMinSolReserve ? 25 : 0) +
      (1 - successRate) * 20
    ).toFixed(2)
  );

  const governor = evaluateJupiterGovernor({
    solBalance: traderWallet.solBalance,
    requestedSwapSol: amountSol,
    requestedSwapPct: maxSwapPct,
    slippageBps: getRiskStatus().settings.maxSlippageBps,
    maxAllowedSlippageBps: getRiskStatus().settings.maxSlippageBps,
    dailySwapCount: runtime.swapStats.dailySwapCount,
    riskScore,
  });

  if (!governor.allowed) {
    const blocked = `Swap blocked: ${governor.reason}`;
    emitLog({
      level: "warn",
      message: blocked,
      agent: "Trader Agent",
      source: "manual",
      action: "SPL_SWAP",
      reason: governor.reason,
      data: { amountSol, riskScore },
    });
    setLastExecution({ message: blocked });
    throw new Error(blocked);
  }

  assertTradeAllowed({
    protocol: "jupiter_swap",
    amountSol,
    slippageBps: getRiskStatus().settings.maxSlippageBps,
  });

  const reasoningReference = `Manual executeTrade invocation (${amountSol} SOL)`;

  try {
    const execution = await JupiterSwapModule.executeSwap({
      walletPublicKey: topology.traderWalletPublicKey,
      inputMint: WSOL_MINT,
      outputMint: env.defaultUsdcMint,
      amount: Math.floor(amountSol * LAMPORTS_PER_SOL),
      slippageBps: getRiskStatus().settings.maxSlippageBps,
      maxAllowedSlippageBps: getRiskStatus().settings.maxSlippageBps,
      reasoningReference,
      agent: "Trader Agent",
      source: "manual",
    });

    runtime.swapStats.lastSwapAt = new Date().toISOString();
    runtime.swapStats.dailySwapCount += 1;
    runtime.swapStats.successfulSwaps += 1;
    runtime.swapStats.consecutiveSwapFailures = 0;
    runtime.cycles += 1;
    runtime.lastDecision = {
      action: "SELL",
      protocol: "jupiter_swap",
      inputMint: WSOL_MINT,
      outputMint: env.defaultUsdcMint,
      amountSol,
      slippageBps: getRiskStatus().settings.maxSlippageBps,
      confidence: 100,
      reason: reasoningReference,
    };
    runtime.lastIntent = {
      action: "SWAP",
      direction: "SOL_TO_USDC",
      amountPct: maxSwapPct,
      confidence: 100,
      reason: reasoningReference,
    };

    await handleTraderSwapOutcome({
      topology,
      successful: true,
      profitable: true,
      notionalUsdc: amountSol * (await estimateSolPriceUsdc()),
    });
    await maybeMintActivityRewards(topology);
    await maybeRedistributeFromTreasury(topology);

    recordExecutionSuccess();
    setLastExecution({
      message: `Manual trade executed (${amountSol} SOL)`,
      txSignature: execution.signature,
      explorerUrl: execution.explorerUrl,
    });

    return {
      success: true,
      decision: runtime.lastDecision,
      txSignature: execution.signature,
      explorerUrl: execution.explorerUrl,
    };
  } catch (error) {
    runtime.swapStats.failedSwaps += 1;
    runtime.swapStats.consecutiveSwapFailures += 1;
    runtime.swapStats.lastSwapAt = new Date().toISOString();
    runtime.failures += 1;
    recordExecutionFailure(error);

    emitLog({
      level: "error",
      message: error instanceof Error ? error.message : String(error),
      agent: "Trader Agent",
      source: "manual",
      action: "SPL_SWAP",
      data: {
        source: "manual_execute_trade",
        amountSol,
      },
    });

    throw error;
  }
};

export const runSimulation = async () => {
  const context = await buildIntentContext();
  const decision = mapIntentToDecision(context.intent, context.amountSol);

  const llmReference = await getLLMDecision({
    profile: "jupiter_simulation_reference",
    intent: context.intent,
  }).catch(() => decision);

  emitLog({
    level: "info",
    message: `Simulation: ${context.intent.action} ${context.intent.direction ?? ""}`,
    agent: "Trader Agent",
    source: "ai",
    action: "SIMULATE_SWAP",
    confidence: context.intent.confidence,
    reason: context.intent.reason,
    data: {
      deterministicIntent: context.intent,
      llmReference,
    },
  });

  return {
    success: true,
    decision,
    intent: context.intent,
    risk: getRiskStatus(),
    splEconomy: getSplEconomyStatus(),
  };
};

export const getAgentStatus = () => ({
  running: runtime.running,
  cycleInProgress: runtime.cycleInProgress,
  intervalMs: runtime.intervalMs,
  cycles: runtime.cycles,
  failures: runtime.failures,
  lastRunAt: runtime.lastRunAt,
  lastAction: runtime.lastAction,
  lastDecision: runtime.lastDecision,
  lastIntent: runtime.lastIntent,
  lastTxSignature: runtime.lastTxSignature,
  lastExplorerUrl: runtime.lastExplorerUrl,
  risk: getRiskStatus(),
  jupiterSwapStats: { ...runtime.swapStats },
  topology: runtime.topology,
  splEconomy: getSplEconomyStatus(),
});
