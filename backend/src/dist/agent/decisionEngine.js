"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getLLMDecision = void 0;
const axios_1 = __importDefault(require("axios"));
const zod_1 = require("zod");
const env_1 = require("../config/env");
const decisionSchema = zod_1.z.object({
    action: zod_1.z.enum(["BUY", "SELL", "HOLD"]),
    protocol: zod_1.z.enum(["hold", "jupiter_swap", "sol_transfer", "spl_transfer"]),
    inputMint: zod_1.z.string().optional(),
    outputMint: zod_1.z.string().optional(),
    amountSol: zod_1.z.number().positive().max(10),
    slippageBps: zod_1.z.number().int().positive().max(1000).optional(),
    confidence: zod_1.z.number().min(0).max(100),
    reason: zod_1.z.string().min(5).max(400),
});
const fallbackDecision = {
    action: "HOLD",
    protocol: "hold",
    amountSol: 0.1,
    slippageBps: 100,
    confidence: 62,
    reason: "Fallback HOLD decision while model output is unavailable.",
};
const extractJson = (content) => {
    const start = content.indexOf("{");
    const end = content.lastIndexOf("}");
    if (start === -1 || end === -1 || end <= start) {
        throw new Error("No JSON object found in LLM output");
    }
    return content.slice(start, end + 1);
};
const getLLMDecision = async (marketContext) => {
    if (!env_1.env.openAiApiKey) {
        return fallbackDecision;
    }
    try {
        const protocolInstruction = env_1.env.enableJupiterSwap
            ? "protocol must be one of hold|jupiter_swap|sol_transfer|spl_transfer."
            : "protocol must be one of hold|sol_transfer|spl_transfer. Do not use jupiter_swap on testnet.";
        const response = await axios_1.default.post("https://api.openai.com/v1/chat/completions", {
            model: env_1.env.openAiModel,
            temperature: 0.1,
            messages: [
                {
                    role: "system",
                    content: `You are an autonomous Solana execution agent. Return ONLY JSON with keys: action, protocol, inputMint, outputMint, amountSol, slippageBps, confidence, reason. ${protocolInstruction}`,
                },
                {
                    role: "user",
                    content: JSON.stringify(marketContext),
                },
            ],
        }, {
            headers: {
                Authorization: `Bearer ${env_1.env.openAiApiKey}`,
                "Content-Type": "application/json",
            },
        });
        const content = response.data?.choices?.[0]?.message?.content;
        if (!content || typeof content !== "string") {
            return fallbackDecision;
        }
        const parsed = JSON.parse(extractJson(content));
        const decision = decisionSchema.parse(parsed);
        if (!env_1.env.enableJupiterSwap && decision.protocol === "jupiter_swap") {
            return {
                ...fallbackDecision,
                reason: "Jupiter is disabled for testnet profile; forcing HOLD.",
            };
        }
        return decision;
    }
    catch {
        return fallbackDecision;
    }
};
exports.getLLMDecision = getLLMDecision;
