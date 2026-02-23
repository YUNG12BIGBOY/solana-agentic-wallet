import { Keypair } from "@solana/web3.js";
import { env } from "../config/env";
import {
  JupiterQuoteRequest,
  JupiterSwapModule,
} from "./jupiterSwapModule";

export { JupiterQuoteRequest };

export const getSwapQuote = (request: JupiterQuoteRequest) =>
  JupiterSwapModule.fetchQuote(request);

export const executeJupiterSwap = async (params: {
  signer: Keypair;
  inputMint: string;
  outputMint: string;
  amount: number;
  slippageBps?: number;
}) =>
  JupiterSwapModule.executeSwap({
    walletPublicKey: params.signer.publicKey.toBase58(),
    inputMint: params.inputMint,
    outputMint: params.outputMint,
    amount: params.amount,
    slippageBps: params.slippageBps,
    maxAllowedSlippageBps: params.slippageBps ?? 100,
    reasoningReference: "Legacy executeJupiterSwap invocation",
  });

export const executeJupiterSwapFromIntent = (params: {
  walletPublicKey?: string;
  inputMint: string;
  outputMint: string;
  amount: number;
  slippageBps?: number;
  reasoningReference: string;
}) =>
  JupiterSwapModule.executeSwap({
    walletPublicKey: params.walletPublicKey,
    inputMint: params.inputMint,
    outputMint: params.outputMint,
    amount: params.amount,
    slippageBps: params.slippageBps,
    maxAllowedSlippageBps: env.enableJupiterSwap ? 1_000 : 100,
    reasoningReference: params.reasoningReference,
  });
