import axios from "axios";
import {
  Connection,
  LAMPORTS_PER_SOL,
  VersionedTransaction,
} from "@solana/web3.js";
import { env } from "../config/env";
import {
  signUnsignedVersionedTransaction,
  broadcastSignedVersionedTransaction,
} from "../wallet/walletEngine";
import { getWalletSummaryByPublicKey, getActiveWalletPublicKey } from "../wallet/walletManager";
import { emitLog } from "../websocket";
import { toExplorerUrlForCluster } from "../utils/explorer";

const devnetConnection = new Connection(env.jupiterExecutionRpcUrl, "confirmed");
const WSOL_MINT = "So11111111111111111111111111111111111111112";

export interface JupiterQuoteRequest {
  inputMint: string;
  outputMint: string;
  amount: number;
  slippageBps?: number;
}

const assertDevnetExecution = () => {
  if (!env.jupiterExecutionRpcUrl.toLowerCase().includes("devnet")) {
    throw new Error(
      "JupiterSwapModule requires a devnet execution RPC. Set JUPITER_EXECUTION_RPC_URL to a devnet endpoint."
    );
  }
};

const parseRouteLabels = (quote: any) => {
  return (quote.routePlan ?? [])
    .map((step: any) => step.swapInfo?.label?.trim() ?? "")
    .filter(Boolean);
};

const parseQuoteNumber = (value: any): number => {
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : 0;
  }
  return 0;
};

const assertSufficientInputBalance = async (params: {
  walletPublicKey: string;
  inputMint: string;
  amount: number;
}) => {
  const wallet = await getWalletSummaryByPublicKey(params.walletPublicKey);
  if (!wallet) {
    throw new Error("Wallet not found for Jupiter swap execution.");
  }
  if (params.inputMint === WSOL_MINT) {
    const amountSol = params.amount / LAMPORTS_PER_SOL;
    if (wallet.solBalance < amountSol) {
      throw new Error(
        `Insufficient SOL balance: requires ${amountSol.toFixed(6)} SOL, wallet has ${wallet.solBalance.toFixed(6)} SOL.`
      );
    }
    return;
  }
  const token = wallet.tokenBalances.find(
    (entry) => entry.mint === params.inputMint
  );
  if (!token) {
    throw new Error(
      `Input mint ${params.inputMint} not found in wallet token balances.`
    );
  }
  const requestedAmount = params.amount / 10 ** token.decimals;
  if (token.amount < requestedAmount) {
    throw new Error(
      `Insufficient token balance for ${params.inputMint}: requires ${requestedAmount.toFixed(6)}, wallet has ${token.amount.toFixed(6)}.`
    );
  }
};

export interface JupiterSwapRequest {
  walletPublicKey?: string;
  inputMint: string;
  outputMint: string;
  amount: number;
  slippageBps?: number;
  maxAllowedSlippageBps: number;
  reasoningReference: string;
  agent?: string;
  source?: "ai" | "manual";
  dryRun?: boolean; // If true, sign but don't broadcast
}

export interface JupiterSwapResult {
  signature?: string; // Only present if broadcast
  explorerUrl?: string; // Only present if broadcast
  signedTransactionBase64?: string; // Present if dryRun=true
  route: string[];
  inAmount: number;
  outAmount: number;
  slippageBps: number;
  quote: any;
  simulated?: boolean; // True if this was a simulation
}

export interface JupiterSimulateRequest {
  walletPublicKey?: string;
  inputMint: string;
  outputMint: string;
  amount: number;
  slippageBps?: number;
  reasoningReference?: string;
  agent?: string;
}

export interface JupiterSimulateResult {
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

export const JupiterSwapModule = {
  fetchQuote: async (request: JupiterQuoteRequest) => {
    const response = await axios.get(`${env.jupiterQuoteApi}/quote`, {
      params: {
        inputMint: request.inputMint,
        outputMint: request.outputMint,
        amount: request.amount,
        slippageBps: request.slippageBps ?? 100,
      },
    });
    return response.data;
  },

  simulateSwap: async (
    request: JupiterSimulateRequest
  ): Promise<JupiterSimulateResult> => {
    assertDevnetExecution();

    const signerPublicKey =
      request.walletPublicKey ?? getActiveWalletPublicKey();
    if (!signerPublicKey) {
      throw new Error(
        "No active wallet is available for Jupiter swap simulation."
      );
    }

    try {
      const quote = await JupiterSwapModule.fetchQuote({
        inputMint: request.inputMint,
        outputMint: request.outputMint,
        amount: request.amount,
        slippageBps: request.slippageBps ?? 100,
      });

      await assertSufficientInputBalance({
        walletPublicKey: signerPublicKey,
        inputMint: request.inputMint,
        amount: request.amount,
      });

      const swapResponse = await axios.post(`${env.jupiterQuoteApi}/swap`, {
        quoteResponse: quote,
        userPublicKey: signerPublicKey,
        wrapAndUnwrapSol: true,
        dynamicComputeUnitLimit: true,
        prioritizationFeeLamports: "auto",
      });

      const unsignedTransactionBase64 = swapResponse.data?.swapTransaction;
      if (!unsignedTransactionBase64) {
        throw new Error(
          "Jupiter swap API did not return swapTransaction payload"
        );
      }

      // Deserialize and simulate the transaction
      const unsignedTx = VersionedTransaction.deserialize(
        Buffer.from(unsignedTransactionBase64, "base64")
      );

      const simulation = await devnetConnection.simulateTransaction(
        unsignedTx,
        {
          replaceRecentBlockhash: true,
          sigVerify: false,
        }
      );

      const routeLabels = parseRouteLabels(quote);
      const inAmount = parseQuoteNumber(quote.inAmount);
      const outAmount = parseQuoteNumber(quote.outAmount);
      const effectiveSlippage = request.slippageBps ?? 100;

      if (simulation.value.err) {
        emitLog({
          level: "warn",
          message: `Jupiter swap simulation failed: ${JSON.stringify(simulation.value.err)}`,
          agent: request.agent,
          source: "ai",
          action: "SIMULATE_SWAP",
          inputMint: request.inputMint,
          outputMint: request.outputMint,
          inAmount,
          outAmount,
          reason: request.reasoningReference,
          data: {
            route: routeLabels,
            slippageBps: effectiveSlippage,
            simulationError: simulation.value.err,
            logs: simulation.value.logs,
          },
        });

        return {
          success: false,
          simulatedOutput: 0,
          error: JSON.stringify(simulation.value.err),
          route: routeLabels,
          inAmount,
          outAmount,
          slippageBps: effectiveSlippage,
          quote,
          logs: simulation.value.logs ?? undefined,
        };
      }

      emitLog({
        level: "success",
        message: "Jupiter swap simulation completed",
        agent: request.agent,
        source: "ai",
        action: "SIMULATE_SWAP",
        inputMint: request.inputMint,
        outputMint: request.outputMint,
        inAmount,
        outAmount,
        reason: request.reasoningReference,
        data: {
          route: routeLabels,
          slippageBps: effectiveSlippage,
          computeUnits: simulation.value.unitsConsumed ?? undefined,
          logs: simulation.value.logs ?? undefined,
        },
      });

      return {
        success: true,
        simulatedOutput: outAmount,
        computeUnits: simulation.value.unitsConsumed ?? undefined,
        logs: simulation.value.logs ?? undefined,
        route: routeLabels,
        inAmount,
        outAmount,
        slippageBps: effectiveSlippage,
        quote,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      emitLog({
        level: "error",
        message: `Jupiter swap simulation error: ${errorMessage}`,
        agent: request.agent,
        source: "ai",
        action: "SIMULATE_SWAP",
        inputMint: request.inputMint,
        outputMint: request.outputMint,
        reason: request.reasoningReference,
      });
      throw error;
    }
  },

  executeSwap: async (request: JupiterSwapRequest): Promise<JupiterSwapResult> => {
    assertDevnetExecution();

    const quote = await JupiterSwapModule.fetchQuote({
      inputMint: request.inputMint,
      outputMint: request.outputMint,
      amount: request.amount,
      slippageBps: request.slippageBps ?? 100,
    });

    const effectiveSlippage = request.slippageBps ?? 100;
    if (effectiveSlippage > request.maxAllowedSlippageBps) {
      throw new Error(
        `Swap rejected: slippage ${effectiveSlippage} bps exceeds max ${request.maxAllowedSlippageBps} bps`
      );
    }

    const signerPublicKey =
      request.walletPublicKey ?? getActiveWalletPublicKey();
    if (!signerPublicKey) {
      throw new Error(
        "No active wallet is available for Jupiter swap execution."
      );
    }

    await assertSufficientInputBalance({
      walletPublicKey: signerPublicKey,
      inputMint: request.inputMint,
      amount: request.amount,
    });

    const swapResponse = await axios.post(`${env.jupiterQuoteApi}/swap`, {
      quoteResponse: quote,
      userPublicKey: signerPublicKey,
      wrapAndUnwrapSol: true,
      dynamicComputeUnitLimit: true,
      prioritizationFeeLamports: "auto",
    });

    const unsignedTransactionBase64 = swapResponse.data?.swapTransaction;
    if (!unsignedTransactionBase64) {
      throw new Error(
        "Jupiter swap API did not return swapTransaction payload"
      );
    }

    const signed = signUnsignedVersionedTransaction({
      unsignedTransactionBase64,
      walletPublicKey: signerPublicKey,
    });

    const routeLabels = parseRouteLabels(quote);
    const inAmount = parseQuoteNumber(quote.inAmount);
    const outAmount = parseQuoteNumber(quote.outAmount);

    // If dryRun is true, return signed transaction without broadcasting
    if (request.dryRun === true) {
      emitLog({
        level: "info",
        message: "Jupiter swap prepared and signed (dry run, not broadcast)",
        agent: request.agent,
        source: request.source ?? "manual",
        action: "SPL_SWAP",
        inputMint: request.inputMint,
        outputMint: request.outputMint,
        inAmount,
        outAmount,
        reason: request.reasoningReference,
        data: {
          route: routeLabels,
          slippageBps: effectiveSlippage,
          dryRun: true,
        },
      });

      return {
        signedTransactionBase64: signed.signedTransactionBase64,
        route: routeLabels,
        inAmount,
        outAmount,
        slippageBps: effectiveSlippage,
        quote,
      };
    }

    // Otherwise, broadcast the transaction
    const signature = await broadcastSignedVersionedTransaction({
      connection: devnetConnection,
      signedTransactionBase64: signed.signedTransactionBase64,
    });

    emitLog({
      level: "success",
      message: "JupiterSwapModule executed swap",
      txSignature: signature,
      explorerUrl: toExplorerUrlForCluster(signature, "devnet"),
      agent: request.agent,
      source: request.source ?? "manual",
      action: "SPL_SWAP",
      inputMint: request.inputMint,
      outputMint: request.outputMint,
      inAmount,
      outAmount,
      reason: request.reasoningReference,
      data: {
        route: routeLabels,
        slippageBps: effectiveSlippage,
      },
    });

    return {
      signature,
      explorerUrl: toExplorerUrlForCluster(signature, "devnet"),
      route: routeLabels,
      inAmount,
      outAmount,
      slippageBps: effectiveSlippage,
      quote,
    };
  },
};
