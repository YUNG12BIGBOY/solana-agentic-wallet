import { env } from "../config/env";
import { SPLTokenModule } from "../protocols/splTokenModule";
import { emitLog } from "../websocket";

export interface AgentTopology {
  treasuryWalletPublicKey: string;
  traderWalletPublicKey: string;
  operationalWalletPublicKeys: string[];
}

interface AgentActivity {
  count: number;
  lastActiveAt: string | null;
}

interface EconomyRuntime {
  initialized: boolean;
  mintAddress: string | null;
  testTokenOneMint: string | null;
  testTokenTwoMint: string | null;
  traderConsecutiveLosses: number;
  traderActivityCount: number;
  activity: Record<string, AgentActivity>;
}

const runtime: EconomyRuntime = {
  initialized: false,
  mintAddress: null,
  testTokenOneMint: null,
  testTokenTwoMint: null,
  traderConsecutiveLosses: 0,
  traderActivityCount: 0,
  activity: {},
};

const nowIso = () => new Date().toISOString();

const markActivity = (walletPublicKey: string) => {
  const current = runtime.activity[walletPublicKey] ?? {
    count: 0,
    lastActiveAt: null,
  };

  runtime.activity[walletPublicKey] = {
    count: current.count + 1,
    lastActiveAt: nowIso(),
  };
};

const isActive = (walletPublicKey: string, inactiveMs = 24 * 60 * 60 * 1000) => {
  const data = runtime.activity[walletPublicKey];
  if (!data?.lastActiveAt) return false;
  return Date.now() - new Date(data.lastActiveAt).getTime() <= inactiveMs;
};

export const initializeSplEconomy = async (topology: AgentTopology) => {
  const [result, testPair] = await Promise.all([
    SPLTokenModule.initializeAgentTokenEconomy({
      treasuryWalletPublicKey: topology.treasuryWalletPublicKey,
      operationalWalletPublicKeys: topology.operationalWalletPublicKeys,
    }),
    SPLTokenModule.initializeTestTokenPair({
      treasuryWalletPublicKey: topology.treasuryWalletPublicKey,
      operationalWalletPublicKeys: topology.operationalWalletPublicKeys,
    }),
  ]);

  runtime.initialized = true;
  runtime.mintAddress = result.mintAddress;
  runtime.testTokenOneMint = testPair.testTokenOneMint;
  runtime.testTokenTwoMint = testPair.testTokenTwoMint;
  markActivity(topology.treasuryWalletPublicKey);
  for (const wallet of topology.operationalWalletPublicKeys) {
    markActivity(wallet);
  }

  return {
    ...result,
    ...testPair,
  };
};

export const handleTraderSwapOutcome = async (params: {
  topology: AgentTopology;
  successful: boolean;
  profitable: boolean;
  notionalUsdc: number;
}) => {
  if (!runtime.initialized || !runtime.mintAddress) {
    await initializeSplEconomy(params.topology);
  }

  markActivity(params.topology.traderWalletPublicKey);
  runtime.traderActivityCount += 1;

  if (!params.successful) {
    runtime.traderConsecutiveLosses += 1;
    if (runtime.traderConsecutiveLosses >= 3) {
      emitLog({
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

  await SPLTokenModule.transferBetweenAgents({
    mintAddress: runtime.mintAddress!,
    fromWalletPublicKey: params.topology.traderWalletPublicKey,
    toWalletPublicKey: params.topology.treasuryWalletPublicKey,
    amount: rewardAmount,
    reason: "Trader reward transfer after profitable Jupiter swap",
  });
};

export const maybeRedistributeFromTreasury = async (topology: AgentTopology) => {
  if (!runtime.initialized || !runtime.mintAddress) {
    return;
  }

  const activeOperational = topology.operationalWalletPublicKeys.filter((wallet) =>
    isActive(wallet)
  );

  if (activeOperational.length !== topology.operationalWalletPublicKeys.length) {
    emitLog({
      level: "warn",
      message: "Treasury distribution skipped: inactive agent detected.",
      data: {
        active: activeOperational.length,
        total: topology.operationalWalletPublicKeys.length,
      },
    });
    return;
  }

  const balances = await SPLTokenModule.queryBalances(runtime.mintAddress, [
    topology.treasuryWalletPublicKey,
    ...topology.operationalWalletPublicKeys,
  ]);
  const treasuryBalance =
    balances.find((row) => row.walletPublicKey === topology.treasuryWalletPublicKey)?.amount ??
    0;

  if (treasuryBalance < env.agentRedistributionThreshold) {
    return;
  }

  const perAgent = Number(
    (treasuryBalance * 0.1 / topology.operationalWalletPublicKeys.length).toFixed(2)
  );
  if (perAgent <= 0) {
    return;
  }

  for (const wallet of topology.operationalWalletPublicKeys) {
    await SPLTokenModule.transferBetweenAgents({
      mintAddress: runtime.mintAddress,
      fromWalletPublicKey: topology.treasuryWalletPublicKey,
      toWalletPublicKey: wallet,
      amount: perAgent,
      reason: "Treasury redistribution",
    });
  }

  markActivity(topology.treasuryWalletPublicKey);
};

export const maybeMintActivityRewards = async (topology: AgentTopology) => {
  if (!runtime.initialized || !runtime.mintAddress) {
    return;
  }

  if (runtime.traderActivityCount < env.agentActivityMintThreshold) {
    return;
  }

  await SPLTokenModule.mintRewardToTreasury({
    treasuryWalletPublicKey: topology.treasuryWalletPublicKey,
    amount: env.agentRewardMintAmount,
    reason: "Trader activity threshold reached",
  });

  runtime.traderActivityCount = 0;
  markActivity(topology.treasuryWalletPublicKey);
};

export const getSplEconomyStatus = () => ({
  ...runtime,
});
