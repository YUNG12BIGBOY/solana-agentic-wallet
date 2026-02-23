"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getSplEconomyStatus = exports.maybeMintActivityRewards = exports.maybeRedistributeFromTreasury = exports.handleTraderSwapOutcome = exports.initializeSplEconomy = void 0;
const env_1 = require("../config/env");
const splTokenModule_1 = require("../protocols/splTokenModule");
const websocket_1 = require("../websocket");
const runtime = {
    initialized: false,
    mintAddress: null,
    traderConsecutiveLosses: 0,
    traderActivityCount: 0,
    activity: {},
};
const nowIso = () => new Date().toISOString();
const markActivity = (walletPublicKey) => {
    const current = runtime.activity[walletPublicKey] ?? {
        count: 0,
        lastActiveAt: null,
    };
    runtime.activity[walletPublicKey] = {
        count: current.count + 1,
        lastActiveAt: nowIso(),
    };
};
const isActive = (walletPublicKey, inactiveMs = 24 * 60 * 60 * 1000) => {
    const data = runtime.activity[walletPublicKey];
    if (!data?.lastActiveAt)
        return false;
    return Date.now() - new Date(data.lastActiveAt).getTime() <= inactiveMs;
};
const initializeSplEconomy = async (topology) => {
    const result = await splTokenModule_1.SPLTokenModule.initializeAgentTokenEconomy({
        treasuryWalletPublicKey: topology.treasuryWalletPublicKey,
        operationalWalletPublicKeys: topology.operationalWalletPublicKeys,
    });
    runtime.initialized = true;
    runtime.mintAddress = result.mintAddress;
    markActivity(topology.treasuryWalletPublicKey);
    for (const wallet of topology.operationalWalletPublicKeys) {
        markActivity(wallet);
    }
    return result;
};
exports.initializeSplEconomy = initializeSplEconomy;
const handleTraderSwapOutcome = async (params) => {
    if (!runtime.initialized || !runtime.mintAddress) {
        await (0, exports.initializeSplEconomy)(params.topology);
    }
    markActivity(params.topology.traderWalletPublicKey);
    runtime.traderActivityCount += 1;
    if (!params.successful) {
        runtime.traderConsecutiveLosses += 1;
        if (runtime.traderConsecutiveLosses >= 3) {
            (0, websocket_1.emitLog)({
                level: "warn",
                message: "Trader Agent requested reward reduction after consecutive losses.",
                data: {
                    consecutiveLosses: runtime.traderConsecutiveLosses,
                },
            });
        }
        return;
    }
    if (!params.profitable) {
        runtime.traderConsecutiveLosses += 1;
        return;
    }
    runtime.traderConsecutiveLosses = 0;
    const rewardPct = 0.07;
    const rewardAmount = Math.max(1, Number((params.notionalUsdc * rewardPct).toFixed(2)));
    await splTokenModule_1.SPLTokenModule.transferBetweenAgents({
        mintAddress: runtime.mintAddress,
        fromWalletPublicKey: params.topology.traderWalletPublicKey,
        toWalletPublicKey: params.topology.treasuryWalletPublicKey,
        amount: rewardAmount,
        reason: "Trader reward transfer after profitable Jupiter swap",
    });
};
exports.handleTraderSwapOutcome = handleTraderSwapOutcome;
const maybeRedistributeFromTreasury = async (topology) => {
    if (!runtime.initialized || !runtime.mintAddress) {
        return;
    }
    const activeOperational = topology.operationalWalletPublicKeys.filter((wallet) => isActive(wallet));
    if (activeOperational.length !== topology.operationalWalletPublicKeys.length) {
        (0, websocket_1.emitLog)({
            level: "warn",
            message: "Treasury distribution skipped: inactive agent detected.",
            data: {
                active: activeOperational.length,
                total: topology.operationalWalletPublicKeys.length,
            },
        });
        return;
    }
    const balances = await splTokenModule_1.SPLTokenModule.queryBalances(runtime.mintAddress, [
        topology.treasuryWalletPublicKey,
        ...topology.operationalWalletPublicKeys,
    ]);
    const treasuryBalance = balances.find((row) => row.walletPublicKey === topology.treasuryWalletPublicKey)?.amount ??
        0;
    if (treasuryBalance < env_1.env.agentRedistributionThreshold) {
        return;
    }
    const perAgent = Number((treasuryBalance * 0.1 / topology.operationalWalletPublicKeys.length).toFixed(2));
    if (perAgent <= 0) {
        return;
    }
    for (const wallet of topology.operationalWalletPublicKeys) {
        await splTokenModule_1.SPLTokenModule.transferBetweenAgents({
            mintAddress: runtime.mintAddress,
            fromWalletPublicKey: topology.treasuryWalletPublicKey,
            toWalletPublicKey: wallet,
            amount: perAgent,
            reason: "Treasury redistribution",
        });
    }
    markActivity(topology.treasuryWalletPublicKey);
};
exports.maybeRedistributeFromTreasury = maybeRedistributeFromTreasury;
const maybeMintActivityRewards = async (topology) => {
    if (!runtime.initialized || !runtime.mintAddress) {
        return;
    }
    if (runtime.traderActivityCount < env_1.env.agentActivityMintThreshold) {
        return;
    }
    await splTokenModule_1.SPLTokenModule.mintRewardToTreasury({
        treasuryWalletPublicKey: topology.treasuryWalletPublicKey,
        amount: env_1.env.agentRewardMintAmount,
        reason: "Trader activity threshold reached",
    });
    runtime.traderActivityCount = 0;
    markActivity(topology.treasuryWalletPublicKey);
};
exports.maybeMintActivityRewards = maybeMintActivityRewards;
const getSplEconomyStatus = () => ({
    ...runtime,
});
exports.getSplEconomyStatus = getSplEconomyStatus;
