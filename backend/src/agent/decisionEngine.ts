import axios from "axios";
import { z } from "zod";
import { env } from "../config/env";
import { SupportedProtocol } from "./riskEngine";

const decisionSchema = z.object({
  action: z.enum(["BUY", "SELL", "HOLD"]),
  protocol: z.enum(["hold", "jupiter_swap", "sol_transfer", "spl_transfer"]),
  inputMint: z.string().optional(),
  outputMint: z.string().optional(),
  amountSol: z.number().positive().max(10),
  slippageBps: z.number().int().positive().max(1000).optional(),
  confidence: z.number().min(0).max(100),
  reason: z.string().min(5).max(400),
});

export type AgentDecision = z.infer<typeof decisionSchema> & {
  protocol: SupportedProtocol;
};

const fallbackDecision: AgentDecision = {
  action: "HOLD",
  protocol: "hold",
  amountSol: 0.1,
  slippageBps: 100,
  confidence: 62,
  reason: "Fallback HOLD decision while model output is unavailable.",
};

const extractJson = (content: string) => {
  const start = content.indexOf("{");
  const end = content.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) {
    throw new Error("No JSON object found in LLM output");
  }

  return content.slice(start, end + 1);
};

export const getLLMDecision = async (marketContext: unknown) => {
  if (!env.openAiApiKey) {
    return fallbackDecision;
  }

  try {
    const protocolInstruction = env.enableJupiterSwap
      ? "protocol must be one of hold|jupiter_swap|sol_transfer|spl_transfer."
      : "protocol must be one of hold|sol_transfer|spl_transfer. Do not use jupiter_swap on testnet.";

    const response = await axios.post(
      "https://api.openai.com/v1/chat/completions",
      {
        model: env.openAiModel,
        temperature: 0.1,
        messages: [
          {
            role: "system",
            content:
              `You are an autonomous Solana execution agent. Return ONLY JSON with keys: action, protocol, inputMint, outputMint, amountSol, slippageBps, confidence, reason. ${protocolInstruction}`,
          },
          {
            role: "user",
            content: JSON.stringify(marketContext),
          },
        ],
      },
      {
        headers: {
          Authorization: `Bearer ${env.openAiApiKey}`,
          "Content-Type": "application/json",
        },
      }
    );

    const content = response.data?.choices?.[0]?.message?.content;
    if (!content || typeof content !== "string") {
      return fallbackDecision;
    }

    const parsed = JSON.parse(extractJson(content));
    const decision = decisionSchema.parse(parsed);
    if (!env.enableJupiterSwap && decision.protocol === "jupiter_swap") {
      return {
        ...fallbackDecision,
        reason: "Jupiter is disabled for testnet profile; forcing HOLD.",
      };
    }

    return decision;
  } catch {
    return fallbackDecision;
  }
};
