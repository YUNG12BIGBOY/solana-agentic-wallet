import fs from "fs";
import path from "path";
import { Connection, PublicKey } from "@solana/web3.js";
import { getAssociatedTokenAddress } from "@solana/spl-token";
import { env } from "../config/env";
import { emitLog } from "../websocket";
import {
  createMintForWallet,
  ensureAssociatedTokenAccountForOwner,
  mintTokensToOwner,
  transferSplBetweenWallets,
} from "../wallet/walletManager";

interface AgentTokenStore {
  mint: string | null;
  test1Mint: string | null;
  test2Mint: string | null;
  treasuryWallet: string | null;
  initializedAt: string | null;
  initialDistributionDone: boolean;
  testPairInitializedAt: string | null;
  testPairDistributionDone: boolean;
}

interface TransferResult {
  mint: string;
  from: string;
  to: string;
  amount: number;
  signature: string;
}

interface TestPairBalanceRow {
  walletPublicKey: string;
  test1Amount: number;
  test2Amount: number;
}

const devnetConnection = new Connection(env.jupiterExecutionRpcUrl, "confirmed");
const storePath = path.resolve(__dirname, "..", "data", "agent-token-store.json");

const ensureStore = () => {
  const dir = path.dirname(storePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  if (!fs.existsSync(storePath)) {
    const initial: AgentTokenStore = {
      mint: null,
      test1Mint: null,
      test2Mint: null,
      treasuryWallet: null,
      initializedAt: null,
      initialDistributionDone: false,
      testPairInitializedAt: null,
      testPairDistributionDone: false,
    };
    fs.writeFileSync(storePath, JSON.stringify(initial, null, 2), "utf8");
  }
};

const readStore = (): AgentTokenStore => {
  ensureStore();
  try {
    const parsed = JSON.parse(fs.readFileSync(storePath, "utf8")) as Partial<AgentTokenStore>;
    return {
      mint: typeof parsed.mint === "string" ? parsed.mint : null,
      test1Mint: typeof parsed.test1Mint === "string" ? parsed.test1Mint : null,
      test2Mint: typeof parsed.test2Mint === "string" ? parsed.test2Mint : null,
      treasuryWallet:
        typeof parsed.treasuryWallet === "string" ? parsed.treasuryWallet : null,
      initializedAt:
        typeof parsed.initializedAt === "string" ? parsed.initializedAt : null,
      initialDistributionDone: parsed.initialDistributionDone === true,
      testPairInitializedAt:
        typeof parsed.testPairInitializedAt === "string"
          ? parsed.testPairInitializedAt
          : null,
      testPairDistributionDone: parsed.testPairDistributionDone === true,
    };
  } catch {
    return {
      mint: null,
      test1Mint: null,
      test2Mint: null,
      treasuryWallet: null,
      initializedAt: null,
      initialDistributionDone: false,
      testPairInitializedAt: null,
      testPairDistributionDone: false,
    };
  }
};

const writeStore = (store: AgentTokenStore) => {
  ensureStore();
  fs.writeFileSync(storePath, JSON.stringify(store, null, 2), "utf8");
};

const assertDevnetMode = () => {
  if (!env.jupiterExecutionRpcUrl.toLowerCase().includes("devnet")) {
    throw new Error(
      "SPLTokenModule mint creation is restricted to devnet execution RPC."
    );
  }
};

const ensureMintByKey = async (params: {
  key: "mint" | "test1Mint" | "test2Mint";
  symbol: string;
  treasuryWalletPublicKey: string;
}) => {
  const store = readStore();
  const existing = store[params.key];
  if (existing) {
    return existing;
  }

  assertDevnetMode();
  const mintAddress = await createMintForWallet({
    walletPublicKey: params.treasuryWalletPublicKey,
    decimals: env.agentTokenDecimals,
    rpcConnection: devnetConnection,
  });

  writeStore({
    ...store,
    [params.key]: mintAddress,
    treasuryWallet: params.treasuryWalletPublicKey,
    initializedAt: store.initializedAt ?? new Date().toISOString(),
    testPairInitializedAt:
      params.key === "mint"
        ? store.testPairInitializedAt
        : store.testPairInitializedAt ?? new Date().toISOString(),
  });

  emitLog({
    level: "success",
    message: `SPLTokenModule created ${params.symbol} mint`,
    data: {
      category: "spl_mint",
      symbol: params.symbol,
      mint: mintAddress,
    },
  });

  return mintAddress;
};

const ensureAgentTokenAccount = async (params: {
  mintAddress: string;
  payerWalletPublicKey: string;
  ownerWalletPublicKey: string;
}) =>
  ensureAssociatedTokenAccountForOwner({
    payerWalletPublicKey: params.payerWalletPublicKey,
    ownerPublicKey: params.ownerWalletPublicKey,
    mintAddress: params.mintAddress,
    rpcConnection: devnetConnection,
  });

const transferBetweenAgents = async (params: {
  mintAddress: string;
  fromWalletPublicKey: string;
  toWalletPublicKey: string;
  amount: number;
  reason: string;
  actorIdentity?: string;
}): Promise<TransferResult> => {
  const transfer = await transferSplBetweenWallets({
    fromWalletPublicKey: params.fromWalletPublicKey,
    toWalletPublicKey: params.toWalletPublicKey,
    mintAddress: params.mintAddress,
    amount: params.amount,
    rpcConnection: devnetConnection,
  });

  emitLog({
    level: "info",
    message: "SPL transfer executed",
    txSignature: transfer.signature,
    explorerUrl: transfer.explorerUrl,
    data: {
      category: "spl_transfer",
      mint: params.mintAddress,
      from: params.fromWalletPublicKey,
      to: params.toWalletPublicKey,
      amount: params.amount,
      reason: params.reason,
      actorIdentity: params.actorIdentity ?? "system",
    },
  });

  return {
    mint: params.mintAddress,
    from: params.fromWalletPublicKey,
    to: params.toWalletPublicKey,
    amount: params.amount,
    signature: transfer.signature,
  };
};

const queryBalances = async (mintAddress: string, walletPublicKeys: string[]) => {
  const mint = new PublicKey(mintAddress);

  return Promise.all(
    walletPublicKeys.map(async (walletPublicKey) => {
      try {
        const owner = new PublicKey(walletPublicKey);
        const ata = await getAssociatedTokenAddress(mint, owner);
        const balance = await devnetConnection.getTokenAccountBalance(ata, "confirmed");
        return {
          walletPublicKey,
          amount: Number(balance.value.uiAmount ?? 0),
        };
      } catch {
        return {
          walletPublicKey,
          amount: 0,
        };
      }
    })
  );
};

const queryTestPairBalances = async (params: {
  testTokenOneMint: string;
  testTokenTwoMint: string;
  walletPublicKeys: string[];
}): Promise<TestPairBalanceRow[]> => {
  const [one, two] = await Promise.all([
    queryBalances(params.testTokenOneMint, params.walletPublicKeys),
    queryBalances(params.testTokenTwoMint, params.walletPublicKeys),
  ]);

  return params.walletPublicKeys.map((walletPublicKey) => ({
    walletPublicKey,
    test1Amount: one.find((row) => row.walletPublicKey === walletPublicKey)?.amount ?? 0,
    test2Amount: two.find((row) => row.walletPublicKey === walletPublicKey)?.amount ?? 0,
  }));
};

const initializeAgentTokenEconomy = async (params: {
  treasuryWalletPublicKey: string;
  operationalWalletPublicKeys: string[];
}) => {
  const mintAddress = await ensureMintByKey({
    key: "mint",
    symbol: env.agentTokenSymbol,
    treasuryWalletPublicKey: params.treasuryWalletPublicKey,
  });
  const store = readStore();

  await ensureAgentTokenAccount({
    mintAddress,
    payerWalletPublicKey: params.treasuryWalletPublicKey,
    ownerWalletPublicKey: params.treasuryWalletPublicKey,
  });
  await Promise.all(
    params.operationalWalletPublicKeys.map((wallet) =>
      ensureAgentTokenAccount({
        mintAddress,
        payerWalletPublicKey: params.treasuryWalletPublicKey,
        ownerWalletPublicKey: wallet,
      })
    )
  );

  if (!store.initialDistributionDone) {
    const minted = await mintTokensToOwner({
      mintAddress,
      mintAuthorityWalletPublicKey: params.treasuryWalletPublicKey,
      ownerWalletPublicKey: params.treasuryWalletPublicKey,
      amount: env.agentInitialSupply,
      decimals: env.agentTokenDecimals,
      rpcConnection: devnetConnection,
    });

    const allocationPool = env.agentInitialSupply * 0.2;
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
          actorIdentity: "system",
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

    emitLog({
      level: "success",
      message: "SPLTokenModule initialized AGENT economy",
      txSignature: minted.signature,
      explorerUrl: minted.explorerUrl,
      data: {
        category: "spl_mint",
        mint: mintAddress,
        treasury: params.treasuryWalletPublicKey,
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
    symbol: env.agentTokenSymbol,
  };
};

const initializeTestTokenPair = async (params: {
  treasuryWalletPublicKey: string;
  operationalWalletPublicKeys: string[];
}) => {
  const [testTokenOneMint, testTokenTwoMint] = await Promise.all([
    ensureMintByKey({
      key: "test1Mint",
      symbol: env.testTokenOneSymbol,
      treasuryWalletPublicKey: params.treasuryWalletPublicKey,
    }),
    ensureMintByKey({
      key: "test2Mint",
      symbol: env.testTokenTwoSymbol,
      treasuryWalletPublicKey: params.treasuryWalletPublicKey,
    }),
  ]);
  const store = readStore();

  const allWallets = [
    params.treasuryWalletPublicKey,
    ...params.operationalWalletPublicKeys,
  ];

  for (const walletPublicKey of allWallets) {
    await ensureAgentTokenAccount({
      mintAddress: testTokenOneMint,
      payerWalletPublicKey: params.treasuryWalletPublicKey,
      ownerWalletPublicKey: walletPublicKey,
    });
    await ensureAgentTokenAccount({
      mintAddress: testTokenTwoMint,
      payerWalletPublicKey: params.treasuryWalletPublicKey,
      ownerWalletPublicKey: walletPublicKey,
    });
  }

  if (!store.testPairDistributionDone) {
    const [mintOneTx, mintTwoTx] = await Promise.all([
      mintTokensToOwner({
        mintAddress: testTokenOneMint,
        mintAuthorityWalletPublicKey: params.treasuryWalletPublicKey,
        ownerWalletPublicKey: params.treasuryWalletPublicKey,
        amount: env.testTokenInitialSupply,
        decimals: env.agentTokenDecimals,
        rpcConnection: devnetConnection,
      }),
      mintTokensToOwner({
        mintAddress: testTokenTwoMint,
        mintAuthorityWalletPublicKey: params.treasuryWalletPublicKey,
        ownerWalletPublicKey: params.treasuryWalletPublicKey,
        amount: env.testTokenInitialSupply,
        decimals: env.agentTokenDecimals,
        rpcConnection: devnetConnection,
      }),
    ]);

    const perAgent = params.operationalWalletPublicKeys.length
      ? (env.testTokenInitialSupply * 0.25) / params.operationalWalletPublicKeys.length
      : 0;

    for (const walletPublicKey of params.operationalWalletPublicKeys) {
      if (perAgent > 0) {
        await transferBetweenAgents({
          mintAddress: testTokenOneMint,
          fromWalletPublicKey: params.treasuryWalletPublicKey,
          toWalletPublicKey: walletPublicKey,
          amount: perAgent,
          reason: "Initial TEST1 distribution",
          actorIdentity: "system",
        });
        await transferBetweenAgents({
          mintAddress: testTokenTwoMint,
          fromWalletPublicKey: params.treasuryWalletPublicKey,
          toWalletPublicKey: walletPublicKey,
          amount: perAgent,
          reason: "Initial TEST2 distribution",
          actorIdentity: "system",
        });
      }
    }

    writeStore({
      ...store,
      test1Mint: testTokenOneMint,
      test2Mint: testTokenTwoMint,
      treasuryWallet: params.treasuryWalletPublicKey,
      testPairInitializedAt: new Date().toISOString(),
      testPairDistributionDone: true,
    });

    emitLog({
      level: "success",
      message: "SPL test token pair initialized",
      txSignature: mintOneTx.signature,
      explorerUrl: mintOneTx.explorerUrl,
      data: {
        category: "spl_mint",
        testTokenOneMint,
        testTokenTwoMint,
        mintTwoSignature: mintTwoTx.signature,
      },
    });
  }

  return {
    testTokenOneMint,
    testTokenTwoMint,
    symbolOne: env.testTokenOneSymbol,
    symbolTwo: env.testTokenTwoSymbol,
    balances: await queryTestPairBalances({
      testTokenOneMint,
      testTokenTwoMint,
      walletPublicKeys: allWallets,
    }),
  };
};

const swapBetweenTestTokens = async (params: {
  treasuryWalletPublicKey: string;
  traderWalletPublicKey: string;
  inputMint: string;
  outputMint: string;
  amountIn: number;
  slippageBps: number;
  reason: string;
  actorIdentity: string;
  approvalTimestamp: string;
}) => {
  const store = readStore();
  if (!store.test1Mint || !store.test2Mint) {
    throw new Error("TEST token pair is not initialized.");
  }

  const allowedMints = new Set([store.test1Mint, store.test2Mint]);
  if (!allowedMints.has(params.inputMint) || !allowedMints.has(params.outputMint)) {
    throw new Error("Manual or autonomous swap is limited to TEST1/TEST2 mints.");
  }
  if (params.inputMint === params.outputMint) {
    throw new Error("inputMint and outputMint must be different");
  }
  if (!Number.isFinite(params.amountIn) || params.amountIn <= 0) {
    throw new Error("amountIn must be greater than 0");
  }

  const [traderInputBalance, treasuryOutputBalance] = await Promise.all([
    queryBalances(params.inputMint, [params.traderWalletPublicKey]).then(
      (rows) => rows[0]?.amount ?? 0
    ),
    queryBalances(params.outputMint, [params.treasuryWalletPublicKey]).then(
      (rows) => rows[0]?.amount ?? 0
    ),
  ]);

  if (traderInputBalance < params.amountIn) {
    throw new Error(
      `Insufficient input token balance for swap. Required ${params.amountIn.toFixed(
        6
      )}, available ${traderInputBalance.toFixed(6)}.`
    );
  }

  const amountOut = Number((params.amountIn * Math.max(env.testTokenSwapRate, 0.000001)).toFixed(6));
  if (treasuryOutputBalance < amountOut) {
    throw new Error(
      `Treasury output liquidity is too low for simulated swap. Required ${amountOut.toFixed(
        6
      )}, available ${treasuryOutputBalance.toFixed(6)}.`
    );
  }

  const inLeg = await transferBetweenAgents({
    mintAddress: params.inputMint,
    fromWalletPublicKey: params.traderWalletPublicKey,
    toWalletPublicKey: params.treasuryWalletPublicKey,
    amount: params.amountIn,
    reason: `Swap in leg: ${params.reason}`,
    actorIdentity: params.actorIdentity,
  });

  const outLeg = await transferBetweenAgents({
    mintAddress: params.outputMint,
    fromWalletPublicKey: params.treasuryWalletPublicKey,
    toWalletPublicKey: params.traderWalletPublicKey,
    amount: amountOut,
    reason: `Swap out leg: ${params.reason}`,
    actorIdentity: params.actorIdentity,
  });

  emitLog({
    level: "success",
    message: "SPL test-token swap executed",
    txSignature: outLeg.signature,
    data: {
      category: "spl_swap",
      actorIdentity: params.actorIdentity,
      inputMint: params.inputMint,
      outputMint: params.outputMint,
      amountIn: params.amountIn,
      amountOut,
      slippageBps: params.slippageBps,
      approvalTimestamp: params.approvalTimestamp,
      reason: params.reason,
      route: ["SPL_TEST_TREASURY_POOL"],
      signatures: {
        inLeg: inLeg.signature,
        outLeg: outLeg.signature,
      },
    },
  });

  return {
    route: ["SPL_TEST_TREASURY_POOL"],
    amountIn: params.amountIn,
    amountOut,
    inputMint: params.inputMint,
    outputMint: params.outputMint,
    signatures: {
      inLeg: inLeg.signature,
      outLeg: outLeg.signature,
    },
  };
};

const mintRewardToTreasury = async (params: {
  treasuryWalletPublicKey: string;
  amount: number;
  reason: string;
}) => {
  const mintAddress = await ensureMintByKey({
    key: "mint",
    symbol: env.agentTokenSymbol,
    treasuryWalletPublicKey: params.treasuryWalletPublicKey,
  });
  const minted = await mintTokensToOwner({
    mintAddress,
    mintAuthorityWalletPublicKey: params.treasuryWalletPublicKey,
    ownerWalletPublicKey: params.treasuryWalletPublicKey,
    amount: params.amount,
    decimals: env.agentTokenDecimals,
    rpcConnection: devnetConnection,
  });

  emitLog({
    level: "info",
    message: `${env.agentTokenSymbol} minted to treasury`,
    txSignature: minted.signature,
    explorerUrl: minted.explorerUrl,
    data: {
      category: "spl_mint",
      amount: params.amount,
      reason: params.reason,
      mintAddress,
    },
  });

  return {
    mintAddress,
    signature: minted.signature,
    explorerUrl: minted.explorerUrl,
  };
};

export const SPLTokenModule = {
  initializeAgentTokenEconomy,
  initializeTestTokenPair,
  transferBetweenAgents,
  queryBalances,
  queryTestPairBalances,
  swapBetweenTestTokens,
  mintRewardToTreasury,
  getState: () => readStore(),
};
