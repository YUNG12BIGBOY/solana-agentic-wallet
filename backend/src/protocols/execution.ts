import { LAMPORTS_PER_SOL } from "@solana/web3.js";
import { env } from "../config/env";
import {
  getActiveWalletReceiveInfo,
  transferSolFromActiveWallet,
  transferSplFromActiveWallet,
} from "../wallet/walletManager";
import { executeJupiterSwapFromIntent } from "./jupiter";
import { SupportedProtocol } from "../agent/riskEngine";

interface BaseIntent {
  protocol: SupportedProtocol;
  amountSol: number;
  slippageBps?: number;
}

export interface ExecuteIntent extends BaseIntent {
  inputMint?: string;
  outputMint?: string;
  recipient?: string;
  splMint?: string;
  reasoningReference?: string;
  walletPublicKey?: string;
}

export const executeProtocolIntent = async (intent: ExecuteIntent) => {
  if (intent.protocol === "hold") {
    return {
      protocol: intent.protocol,
      message: "No transaction executed (HOLD)",
    };
  }

  if (intent.protocol === "jupiter_swap") {
    if (!env.enableJupiterSwap) {
      throw new Error("Jupiter swap is disabled for the current network profile");
    }

    const activeReceive = getActiveWalletReceiveInfo();
    const inputMint =
      intent.inputMint ?? "So11111111111111111111111111111111111111112";
    const outputMint = intent.outputMint ?? env.defaultUsdcMint;
    const amountLamports = Math.floor(intent.amountSol * LAMPORTS_PER_SOL);

    const swap = await executeJupiterSwapFromIntent({
      walletPublicKey: intent.walletPublicKey ?? activeReceive.publicKey,
      inputMint,
      outputMint,
      amount: amountLamports,
      slippageBps: intent.slippageBps,
      reasoningReference: intent.reasoningReference ?? "protocol intent execution",
    });

    return {
      protocol: intent.protocol,
      message: "Jupiter swap executed",
      txSignature: swap.signature,
      explorerUrl: swap.explorerUrl,
      quote: swap.quote,
    };
  }

  if (intent.protocol === "sol_transfer") {
    const recipient =
      intent.recipient || env.defaultRecipient || getActiveWalletReceiveInfo().publicKey;

    const transfer = await transferSolFromActiveWallet(recipient, intent.amountSol);
    return {
      protocol: intent.protocol,
      message: "SOL transfer executed",
      txSignature: transfer.signature,
      explorerUrl: transfer.explorerUrl,
      wallet: transfer.wallet,
    };
  }

  if (intent.protocol === "spl_transfer") {
    const recipient = intent.recipient || env.defaultRecipient;
    if (!recipient) {
      throw new Error("DEFAULT_RECIPIENT is required for spl_transfer");
    }

    const transfer = await transferSplFromActiveWallet({
      to: recipient,
      mint: intent.splMint ?? env.defaultUsdcMint,
      amount: intent.amountSol,
    });

    return {
      protocol: intent.protocol,
      message: "SPL transfer executed",
      txSignature: transfer.signature,
      explorerUrl: transfer.explorerUrl,
      wallet: transfer.wallet,
    };
  }

  throw new Error(`Unsupported protocol intent: ${intent.protocol}`);
};
