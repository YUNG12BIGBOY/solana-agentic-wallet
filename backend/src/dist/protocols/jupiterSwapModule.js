"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.JupiterSwapModule = void 0;
const axios_1 = __importDefault(require("axios"));
const web3_js_1 = require("@solana/web3.js");
const env_1 = require("../config/env");
const walletEngine_1 = require("../wallet/walletEngine");
const walletManager_1 = require("../wallet/walletManager");
const websocket_1 = require("../websocket");
const explorer_1 = require("../utils/explorer");
const devnetConnection = new web3_js_1.Connection(env_1.env.jupiterExecutionRpcUrl, "confirmed");
const WSOL_MINT = "So11111111111111111111111111111111111111112";
const assertDevnetExecution = () => {
    if (!env_1.env.jupiterExecutionRpcUrl.toLowerCase().includes("devnet")) {
        throw new Error("JupiterSwapModule requires a devnet execution RPC. Set JUPITER_EXECUTION_RPC_URL to a devnet endpoint.");
    }
};
const parseRouteLabels = (quote) => {
    const data = quote;
    return (data.routePlan ?? [])
        .map((step) => step.swapInfo?.label?.trim() ?? "")
        .filter(Boolean);
};
const parseQuoteNumber = (value) => {
    if (typeof value === "string") {
        const parsed = Number(value);
        return Number.isFinite(parsed) ? parsed : 0;
    }
    if (typeof value === "number") {
        return Number.isFinite(value) ? value : 0;
    }
    return 0;
};
const assertSufficientInputBalance = async (params) => {
    const wallet = await (0, walletManager_1.getWalletSummaryByPublicKey)(params.walletPublicKey);
    if (!wallet) {
        throw new Error("Wallet not found for Jupiter swap execution.");
    }
    if (params.inputMint === WSOL_MINT) {
        const amountSol = params.amount / web3_js_1.LAMPORTS_PER_SOL;
        if (wallet.solBalance < amountSol) {
            throw new Error(`Insufficient SOL balance: requires ${amountSol.toFixed(6)} SOL, wallet has ${wallet.solBalance.toFixed(6)} SOL.`);
        }
        return;
    }
    const token = wallet.tokenBalances.find((entry) => entry.mint === params.inputMint);
    if (!token) {
        throw new Error(`Input mint ${params.inputMint} not found in wallet token balances.`);
    }
    const requestedAmount = params.amount / 10 ** token.decimals;
    if (token.amount < requestedAmount) {
        throw new Error(`Insufficient token balance for ${params.inputMint}: requires ${requestedAmount.toFixed(6)}, wallet has ${token.amount.toFixed(6)}.`);
    }
};
exports.JupiterSwapModule = {
    fetchQuote: async (request) => {
        const response = await axios_1.default.get(`${env_1.env.jupiterQuoteApi}/quote`, {
            params: {
                inputMint: request.inputMint,
                outputMint: request.outputMint,
                amount: request.amount,
                slippageBps: request.slippageBps ?? 100,
            },
        });
        return response.data;
    },
    executeSwap: async (request) => {
        assertDevnetExecution();
        const quote = await exports.JupiterSwapModule.fetchQuote(request);
        const effectiveSlippage = request.slippageBps ?? 100;
        if (effectiveSlippage > request.maxAllowedSlippageBps) {
            throw new Error(`Swap rejected: slippage ${effectiveSlippage} bps exceeds max ${request.maxAllowedSlippageBps} bps`);
        }
        const signerPublicKey = request.walletPublicKey ?? (0, walletManager_1.getActiveWalletPublicKey)();
        if (!signerPublicKey) {
            throw new Error("No active wallet is available for Jupiter swap execution.");
        }
        await assertSufficientInputBalance({
            walletPublicKey: signerPublicKey,
            inputMint: request.inputMint,
            amount: request.amount,
        });
        const swapResponse = await axios_1.default.post(`${env_1.env.jupiterQuoteApi}/swap`, {
            quoteResponse: quote,
            userPublicKey: signerPublicKey,
            wrapAndUnwrapSol: true,
            dynamicComputeUnitLimit: true,
            prioritizationFeeLamports: "auto",
        });
        const unsignedTransactionBase64 = swapResponse.data?.swapTransaction;
        if (!unsignedTransactionBase64) {
            throw new Error("Jupiter swap API did not return swapTransaction payload");
        }
        const signed = (0, walletEngine_1.signUnsignedVersionedTransaction)({
            unsignedTransactionBase64,
            walletPublicKey: signerPublicKey,
        });
        const signature = await (0, walletEngine_1.broadcastSignedVersionedTransaction)({
            connection: devnetConnection,
            signedTransactionBase64: signed.signedTransactionBase64,
        });
        const routeLabels = parseRouteLabels(quote);
        const inAmount = parseQuoteNumber(quote.inAmount);
        const outAmount = parseQuoteNumber(quote.outAmount);
        (0, websocket_1.emitLog)({
            level: "success",
            message: "JupiterSwapModule executed swap",
            txSignature: signature,
            explorerUrl: (0, explorer_1.toExplorerUrlForCluster)(signature, "devnet"),
            data: {
                route: routeLabels,
                slippageBps: effectiveSlippage,
                inAmount,
                outAmount,
                reasoningReference: request.reasoningReference,
            },
        });
        return {
            signature,
            explorerUrl: (0, explorer_1.toExplorerUrlForCluster)(signature, "devnet"),
            route: routeLabels,
            inAmount,
            outAmount,
            slippageBps: effectiveSlippage,
            quote,
        };
    },
};
