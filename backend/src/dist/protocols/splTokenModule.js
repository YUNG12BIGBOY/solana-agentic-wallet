"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.SPLTokenModule = void 0;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const web3_js_1 = require("@solana/web3.js");
const spl_token_1 = require("@solana/spl-token");
const env_1 = require("../config/env");
const websocket_1 = require("../websocket");
const walletManager_1 = require("../wallet/walletManager");
const devnetConnection = new web3_js_1.Connection(env_1.env.jupiterExecutionRpcUrl, "confirmed");
const storePath = path_1.default.resolve(__dirname, "..", "data", "agent-token-store.json");
const ensureStore = () => {
    const dir = path_1.default.dirname(storePath);
    if (!fs_1.default.existsSync(dir)) {
        fs_1.default.mkdirSync(dir, { recursive: true });
    }
    if (!fs_1.default.existsSync(storePath)) {
        const initial = {
            mint: null,
            treasuryWallet: null,
            initializedAt: null,
            initialDistributionDone: false,
        };
        fs_1.default.writeFileSync(storePath, JSON.stringify(initial, null, 2), "utf8");
    }
};
const readStore = () => {
    ensureStore();
    try {
        const parsed = JSON.parse(fs_1.default.readFileSync(storePath, "utf8"));
        return {
            mint: typeof parsed.mint === "string" ? parsed.mint : null,
            treasuryWallet: typeof parsed.treasuryWallet === "string" ? parsed.treasuryWallet : null,
            initializedAt: typeof parsed.initializedAt === "string" ? parsed.initializedAt : null,
            initialDistributionDone: parsed.initialDistributionDone === true,
        };
    }
    catch {
        return {
            mint: null,
            treasuryWallet: null,
            initializedAt: null,
            initialDistributionDone: false,
        };
    }
};
const writeStore = (store) => {
    ensureStore();
    fs_1.default.writeFileSync(storePath, JSON.stringify(store, null, 2), "utf8");
};
const assertDevnetMode = () => {
    if (!env_1.env.jupiterExecutionRpcUrl.toLowerCase().includes("devnet")) {
        throw new Error("SPLTokenModule mint creation is restricted to devnet execution RPC.");
    }
};
const toRawAmount = (amount, decimals) => {
    const normalized = amount.toFixed(decimals);
    const [whole, fractional = ""] = normalized.split(".");
    const factor = BigInt(10) ** BigInt(decimals);
    return (BigInt(whole || "0") * factor +
        BigInt((fractional + "0".repeat(decimals)).slice(0, decimals) || "0"));
};
const ensureMint = async (treasuryWalletPublicKey) => {
    const store = readStore();
    if (store.mint) {
        return store.mint;
    }
    assertDevnetMode();
    const mintAddress = await (0, walletManager_1.createMintForWallet)({
        walletPublicKey: treasuryWalletPublicKey,
        decimals: env_1.env.agentTokenDecimals,
        rpcConnection: devnetConnection,
    });
    writeStore({
        ...store,
        mint: mintAddress,
        treasuryWallet: treasuryWalletPublicKey,
        initializedAt: new Date().toISOString(),
    });
    (0, websocket_1.emitLog)({
        level: "success",
        message: `SPLTokenModule created ${env_1.env.agentTokenSymbol} mint`,
        data: { mint: mintAddress },
    });
    return mintAddress;
};
const ensureAgentTokenAccount = async (params) => {
    return (0, walletManager_1.ensureAssociatedTokenAccountForOwner)({
        payerWalletPublicKey: params.payerWalletPublicKey,
        ownerPublicKey: params.ownerWalletPublicKey,
        mintAddress: params.mintAddress,
        rpcConnection: devnetConnection,
    });
};
const transferBetweenAgents = async (params) => {
    const mintAddress = params.mintAddress;
    const transfer = await (0, walletManager_1.transferSplBetweenWallets)({
        fromWalletPublicKey: params.fromWalletPublicKey,
        toWalletPublicKey: params.toWalletPublicKey,
        mintAddress,
        amount: params.amount,
        rpcConnection: devnetConnection,
    });
    const signature = transfer.signature;
    (0, websocket_1.emitLog)({
        level: "info",
        message: `${env_1.env.agentTokenSymbol} transfer executed`,
        txSignature: signature,
        data: {
            from: params.fromWalletPublicKey,
            to: params.toWalletPublicKey,
            amount: params.amount,
            reason: params.reason,
        },
    });
    return {
        mint: mintAddress,
        from: params.fromWalletPublicKey,
        to: params.toWalletPublicKey,
        amount: params.amount,
        signature,
    };
};
const queryBalances = async (mintAddress, walletPublicKeys) => {
    const mint = new web3_js_1.PublicKey(mintAddress);
    return Promise.all(walletPublicKeys.map(async (walletPublicKey) => {
        try {
            const owner = new web3_js_1.PublicKey(walletPublicKey);
            const ata = await (0, spl_token_1.getAssociatedTokenAddress)(mint, owner);
            const balance = await devnetConnection.getTokenAccountBalance(ata, "confirmed");
            return {
                walletPublicKey,
                amount: Number(balance.value.uiAmount ?? 0),
            };
        }
        catch {
            return {
                walletPublicKey,
                amount: 0,
            };
        }
    }));
};
const initializeAgentTokenEconomy = async (params) => {
    const mintAddress = await ensureMint(params.treasuryWalletPublicKey);
    const store = readStore();
    await ensureAgentTokenAccount({
        mintAddress,
        payerWalletPublicKey: params.treasuryWalletPublicKey,
        ownerWalletPublicKey: params.treasuryWalletPublicKey,
    });
    await Promise.all(params.operationalWalletPublicKeys.map((wallet) => ensureAgentTokenAccount({
        mintAddress,
        payerWalletPublicKey: params.treasuryWalletPublicKey,
        ownerWalletPublicKey: wallet,
    })));
    if (!store.initialDistributionDone) {
        const minted = await (0, walletManager_1.mintTokensToOwner)({
            mintAddress,
            mintAuthorityWalletPublicKey: params.treasuryWalletPublicKey,
            ownerWalletPublicKey: params.treasuryWalletPublicKey,
            amount: env_1.env.agentInitialSupply,
            decimals: env_1.env.agentTokenDecimals,
            rpcConnection: devnetConnection,
        });
        const signature = minted.signature;
        const allocationPool = env_1.env.agentInitialSupply * 0.2;
        const perAgent = params.operationalWalletPublicKeys.length
            ? allocationPool / params.operationalWalletPublicKeys.length
            : 0;
        for (const walletPublicKey of params.operationalWalletPublicKeys) {
            if (perAgent > 0) {
                await transferBetweenAgents({
                    mintAddress,
                    fromWalletPublicKey: params.treasuryWalletPublicKey,
                    toWalletPublicKey: walletPublicKey,
                    amount: perAgent,
                    reason: "Initial AGENT distribution",
                });
            }
        }
        writeStore({
            ...store,
            mint: mintAddress,
            treasuryWallet: params.treasuryWalletPublicKey,
            initializedAt: new Date().toISOString(),
            initialDistributionDone: true,
        });
        (0, websocket_1.emitLog)({
            level: "success",
            message: "SPLTokenModule initialized AGENT economy",
            txSignature: signature,
            data: {
                mint: mintAddress,
                treasury: params.treasuryWalletPublicKey,
                distributedPerAgent: perAgent,
            },
        });
    }
    const balances = await queryBalances(mintAddress, [
        params.treasuryWalletPublicKey,
        ...params.operationalWalletPublicKeys,
    ]);
    return {
        mintAddress,
        balances,
        symbol: env_1.env.agentTokenSymbol,
    };
};
const mintRewardToTreasury = async (params) => {
    const mintAddress = await ensureMint(params.treasuryWalletPublicKey);
    const minted = await (0, walletManager_1.mintTokensToOwner)({
        mintAddress,
        mintAuthorityWalletPublicKey: params.treasuryWalletPublicKey,
        ownerWalletPublicKey: params.treasuryWalletPublicKey,
        amount: params.amount,
        decimals: env_1.env.agentTokenDecimals,
        rpcConnection: devnetConnection,
    });
    const signature = minted.signature;
    (0, websocket_1.emitLog)({
        level: "info",
        message: `${env_1.env.agentTokenSymbol} minted to treasury`,
        txSignature: signature,
        data: { amount: params.amount, reason: params.reason },
    });
    return {
        mintAddress,
        signature,
    };
};
exports.SPLTokenModule = {
    initializeAgentTokenEconomy,
    transferBetweenAgents,
    queryBalances,
    mintRewardToTreasury,
    getState: () => readStore(),
};
