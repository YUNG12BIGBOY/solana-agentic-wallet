import {
  Connection as SolanaConnection,
  Keypair,
  PublicKey,
  Transaction,
  SystemProgram,
  sendAndConfirmTransaction,
  LAMPORTS_PER_SOL,
} from "@solana/web3.js";
import {
  createMint,
  createAssociatedTokenAccountInstruction,
  createTransferInstruction,
  getAssociatedTokenAddress,
  getOrCreateAssociatedTokenAccount,
  getMint,
  mintTo,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import { env } from "../config/env";
import { connection } from "../config/solana";
import { decrypt, encrypt } from "../security/encryption";
import {
  addWalletRecord,
  getActivePublicKey,
  getWalletRecord,
  listWalletRecords,
  removeWalletRecord,
  reserveNextGeneratedWalletLabel,
  setActivePublicKey,
} from "./keyStore";
import { toAddressExplorerUrl, toExplorerUrl } from "../utils/explorer";
import { withRpcRetry } from "../utils/rpc";

export interface WalletSummary {
  label: string;
  publicKey: string;
  solBalance: number;
  usdcBalance: number;
  tokenBalances: TokenBalance[];
  createdAt: string;
}

export interface WalletState {
  wallets: WalletSummary[];
  activeWallet: WalletSummary | null;
}

export interface TokenBalance {
  mint: string;
  amount: number;
  decimals: number;
}

export interface WalletReceiveInfo {
  publicKey: string;
  explorerUrl: string;
}

export interface WalletSplReceiveInfo {
  ownerPublicKey: string;
  ownerExplorerUrl: string;
  mint: string;
  associatedTokenAccount: string;
  associatedTokenAccountExplorerUrl: string;
  exists: boolean;
  prepared: boolean;
  preparationSignature?: string;
  preparationExplorerUrl?: string;
}

const round = (value: number, digits = 4) =>
  Number(value.toFixed(digits));

const toUniqueLabel = (requestedLabel: string, existing: Set<string>) => {
  const base = requestedLabel.trim();
  if (!base) {
    throw new Error("Wallet label cannot be empty");
  }

  if (!existing.has(base.toLowerCase())) {
    return base;
  }

  let suffix = 2;
  while (existing.has(`${base} (${suffix})`.toLowerCase())) {
    suffix += 1;
  }

  return `${base} (${suffix})`;
};

const pow10 = (decimals: number) => BigInt(10) ** BigInt(decimals);

const toRawAmount = (amount: number, decimals: number) => {
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error("amount must be greater than 0");
  }

  const normalized = amount.toFixed(decimals);
  const [whole, fractional = ""] = normalized.split(".");
  const wholePart = BigInt(whole || "0");
  const fractionalPart = BigInt(
    (fractional + "0".repeat(decimals)).slice(0, decimals) || "0"
  );

  return wholePart * pow10(decimals) + fractionalPart;
};

const getTokenBalances = async (owner: PublicKey): Promise<TokenBalance[]> => {
  try {
    const accounts = await withRpcRetry("getParsedTokenAccountsByOwner", () =>
      connection.getParsedTokenAccountsByOwner(owner, {
        programId: TOKEN_PROGRAM_ID,
      })
    );

    return accounts.value
      .map((account) => {
        const parsed = account.account.data.parsed.info;
        return {
          mint: parsed.mint as string,
          amount: round(parsed.tokenAmount.uiAmount ?? 0, 8),
          decimals: parsed.tokenAmount.decimals as number,
        };
      })
      .filter((token) => token.amount > 0);
  } catch {
    return [];
  }
};

const toSummary = async (record: {
  label: string;
  publicKey: string;
  createdAt: string;
}): Promise<WalletSummary> => {
  const owner = new PublicKey(record.publicKey);
  const [balanceLamports, tokenBalances] = await Promise.all([
    withRpcRetry("getBalance", () => connection.getBalance(owner, "confirmed")),
    getTokenBalances(owner),
  ]);

  const usdcBalance =
    tokenBalances.find((token) => token.mint === env.defaultUsdcMint)?.amount ?? 0;

  return {
    label: record.label,
    publicKey: record.publicKey,
    solBalance: round(balanceLamports / LAMPORTS_PER_SOL, 4),
    usdcBalance,
    tokenBalances,
    createdAt: record.createdAt,
  };
};

const toFallbackSummary = (record: {
  label: string;
  publicKey: string;
  createdAt: string;
}): WalletSummary => ({
  label: record.label,
  publicKey: record.publicKey,
  solBalance: 0,
  usdcBalance: 0,
  tokenBalances: [],
  createdAt: record.createdAt,
});

const toSummarySafe = async (record: {
  label: string;
  publicKey: string;
  createdAt: string;
}) => {
  try {
    return await toSummary(record);
  } catch {
    return toFallbackSummary(record);
  }
};

const resolveSigner = (publicKey?: string) => {
  const targetPublicKey = publicKey ?? getActivePublicKey();
  if (!targetPublicKey) {
    throw new Error("No active wallet selected");
  }

  const walletRecord = getWalletRecord(targetPublicKey);
  if (!walletRecord) {
    throw new Error("Wallet not found");
  }

  const secretKeyB64 = decrypt(walletRecord.encryptedSecret);
  const secretKey = Uint8Array.from(Buffer.from(secretKeyB64, "base64"));
  const signer = Keypair.fromSecretKey(secretKey);

  return {
    signer,
    walletRecord,
  };
};

export const createWallet = async (label?: string) => {
  const keypair = Keypair.generate();
  const existingLabels = new Set(
    listWalletRecords().map((wallet) => wallet.label.toLowerCase())
  );
  let walletLabel = "";

  if (label?.trim()) {
    walletLabel = toUniqueLabel(label, existingLabels);
  } else {
    walletLabel = reserveNextGeneratedWalletLabel();
    while (existingLabels.has(walletLabel.toLowerCase())) {
      walletLabel = reserveNextGeneratedWalletLabel();
    }
  }

  const secretKeyB64 = Buffer.from(keypair.secretKey).toString("base64");
  const createdAt = new Date().toISOString();

  addWalletRecord({
    label: walletLabel,
    publicKey: keypair.publicKey.toBase58(),
    encryptedSecret: encrypt(secretKeyB64),
    createdAt,
  });

  return toSummarySafe({
    label: walletLabel,
    publicKey: keypair.publicKey.toBase58(),
    createdAt,
  });
};

export const getWalletState = async (): Promise<WalletState> => {
  const records = listWalletRecords();
  const wallets: WalletSummary[] = [];
  for (const record of records) {
    wallets.push(await toSummarySafe(record));
  }
  const activePublicKey = getActivePublicKey();

  return {
    wallets,
    activeWallet:
      wallets.find((wallet) => wallet.publicKey === activePublicKey) ?? null,
  };
};

export const getWalletSummaryByPublicKey = async (publicKey: string) => {
  const record = getWalletRecord(publicKey);
  if (!record) {
    return null;
  }
  return toSummarySafe(record);
};

export const switchWallet = async (publicKey: string) => {
  setActivePublicKey(publicKey);
  const record = getWalletRecord(publicKey);
  if (!record) {
    throw new Error("Wallet not found");
  }

  return toSummarySafe(record);
};

export const findWalletByLabel = (label: string) =>
  listWalletRecords().find((wallet) => wallet.label.toLowerCase() === label.toLowerCase()) ??
  null;

export const ensureWalletByLabel = async (label: string) => {
  const existing = findWalletByLabel(label);
  if (existing) {
    return toSummarySafe(existing);
  }

  return createWallet(label);
};

export const deleteWallet = async (publicKey: string) => {
  const existing = getWalletRecord(publicKey);
  if (!existing) {
    const activePublicKey = getActivePublicKey();
    const activeRecord = activePublicKey ? getWalletRecord(activePublicKey) : null;

    return {
      removedPublicKey: publicKey,
      removedLabel: "Already removed",
      activeWallet: activeRecord ? await toSummarySafe(activeRecord) : null,
      alreadyDeleted: true,
    };
  }

  const records = listWalletRecords();
  if (records.length <= 1) {
    throw new Error("Cannot delete the last wallet. Create another wallet first.");
  }

  const result = removeWalletRecord(publicKey);
  const nextWallet =
    result.nextActivePublicKey ? getWalletRecord(result.nextActivePublicKey) : null;

  return {
    removedPublicKey: result.removed.publicKey,
    removedLabel: result.removed.label,
    activeWallet: nextWallet ? await toSummarySafe(nextWallet) : null,
    alreadyDeleted: false,
  };
};

export const getActiveWalletReceiveInfo = (): WalletReceiveInfo => {
  const signer = loadActiveSigner();
  const publicKey = signer.publicKey.toBase58();
  return {
    publicKey,
    explorerUrl: toAddressExplorerUrl(publicKey),
  };
};

export const getActiveWalletSplReceiveInfo = async (params: {
  mint: string;
  prepare?: boolean;
}): Promise<WalletSplReceiveInfo> => {
  const { signer } = resolveSigner();
  const mint = new PublicKey(params.mint);
  const ata = await getAssociatedTokenAddress(mint, signer.publicKey);

  const ataInfo = await withRpcRetry("getAccountInfo", () =>
    connection.getAccountInfo(ata, "confirmed")
  );

  let exists = Boolean(ataInfo);
  let prepared = false;
  let preparationSignature: string | undefined;

  if (params.prepare && !exists) {
    const tx = new Transaction().add(
      createAssociatedTokenAccountInstruction(
        signer.publicKey,
        ata,
        signer.publicKey,
        mint
      )
    );

    preparationSignature = await sendAndConfirmTransaction(connection, tx, [signer], {
      commitment: "confirmed",
    });
    prepared = true;
    exists = true;
  }

  return {
    ownerPublicKey: signer.publicKey.toBase58(),
    ownerExplorerUrl: toAddressExplorerUrl(signer.publicKey.toBase58()),
    mint: mint.toBase58(),
    associatedTokenAccount: ata.toBase58(),
    associatedTokenAccountExplorerUrl: toAddressExplorerUrl(ata.toBase58()),
    exists,
    prepared,
    preparationSignature,
    preparationExplorerUrl: preparationSignature
      ? toExplorerUrl(preparationSignature)
      : undefined,
  };
};

export const loadActiveSigner = () => resolveSigner().signer;

export const loadSignerForWallet = (publicKey: string) => resolveSigner(publicKey).signer;

export const getActiveWalletPublicKey = () => getActivePublicKey();

export const createMintForWallet = async (params: {
  walletPublicKey: string;
  decimals: number;
  rpcConnection?: SolanaConnection;
}) => {
  const signer = loadSignerForWallet(params.walletPublicKey);
  const targetConnection = params.rpcConnection ?? connection;

  const mint = await createMint(
    targetConnection,
    signer,
    signer.publicKey,
    signer.publicKey,
    params.decimals
  );

  return mint.toBase58();
};

export const ensureAssociatedTokenAccountForOwner = async (params: {
  payerWalletPublicKey: string;
  ownerPublicKey: string;
  mintAddress: string;
  rpcConnection?: SolanaConnection;
}) => {
  const payerSigner = loadSignerForWallet(params.payerWalletPublicKey);
  const targetConnection = params.rpcConnection ?? connection;

  const ata = await getOrCreateAssociatedTokenAccount(
    targetConnection,
    payerSigner,
    new PublicKey(params.mintAddress),
    new PublicKey(params.ownerPublicKey)
  );

  return ata.address.toBase58();
};

export const transferSplBetweenWallets = async (params: {
  fromWalletPublicKey: string;
  toWalletPublicKey: string;
  mintAddress: string;
  amount: number;
  rpcConnection?: SolanaConnection;
}) => {
  if (!Number.isFinite(params.amount) || params.amount <= 0) {
    throw new Error("amount must be greater than 0");
  }

  const fromSigner = loadSignerForWallet(params.fromWalletPublicKey);
  const targetConnection = params.rpcConnection ?? connection;
  const mintPublicKey = new PublicKey(params.mintAddress);
  const recipientPublicKey = new PublicKey(params.toWalletPublicKey);

  const senderAta = await getAssociatedTokenAddress(mintPublicKey, fromSigner.publicKey);
  const recipientAta = await getAssociatedTokenAddress(
    mintPublicKey,
    recipientPublicKey
  );

  const recipientAtaInfo = await withRpcRetry("getAccountInfo", () =>
    targetConnection.getAccountInfo(recipientAta, "confirmed")
  );
  const mintInfo = await withRpcRetry("getMint", () =>
    getMint(targetConnection, mintPublicKey, "confirmed")
  );
  const rawAmount = toRawAmount(params.amount, mintInfo.decimals);

  if (rawAmount <= BigInt(0)) {
    throw new Error("Token amount is too small for mint decimals");
  }

  const tx = new Transaction();

  if (!recipientAtaInfo) {
    tx.add(
      createAssociatedTokenAccountInstruction(
        fromSigner.publicKey,
        recipientAta,
        recipientPublicKey,
        mintPublicKey
      )
    );
  }

  tx.add(
    createTransferInstruction(senderAta, recipientAta, fromSigner.publicKey, rawAmount)
  );

  const signature = await sendAndConfirmTransaction(targetConnection, tx, [fromSigner], {
    commitment: "confirmed",
  });

  return {
    signature,
    explorerUrl: toExplorerUrl(signature),
  };
};

export const mintTokensToOwner = async (params: {
  mintAddress: string;
  mintAuthorityWalletPublicKey: string;
  ownerWalletPublicKey: string;
  amount: number;
  decimals?: number;
  rpcConnection?: SolanaConnection;
}) => {
  if (!Number.isFinite(params.amount) || params.amount <= 0) {
    throw new Error("amount must be greater than 0");
  }

  const authoritySigner = loadSignerForWallet(params.mintAuthorityWalletPublicKey);
  const targetConnection = params.rpcConnection ?? connection;
  const mintPublicKey = new PublicKey(params.mintAddress);
  const ownerPublicKey = new PublicKey(params.ownerWalletPublicKey);

  const ownerAta = await getOrCreateAssociatedTokenAccount(
    targetConnection,
    authoritySigner,
    mintPublicKey,
    ownerPublicKey
  );

  const decimals =
    params.decimals ??
    (await withRpcRetry("getMint", () =>
      getMint(targetConnection, mintPublicKey, "confirmed")
    )).decimals;

  const rawAmount = toRawAmount(params.amount, decimals);
  const signature = await mintTo(
    targetConnection,
    authoritySigner,
    mintPublicKey,
    ownerAta.address,
    authoritySigner,
    rawAmount
  );

  return {
    signature,
    explorerUrl: toExplorerUrl(signature),
  };
};

export const getActiveWalletTokenBalances = async () => {
  const { signer } = resolveSigner();
  return getTokenBalances(signer.publicKey);
};

export const airdropActiveWallet = async (amountSol: number) => {
  if (!Number.isFinite(amountSol) || amountSol <= 0) {
    throw new Error("amountSol must be greater than 0");
  }

  const { signer, walletRecord } = resolveSigner();
  const lamports = Math.floor(amountSol * LAMPORTS_PER_SOL);
  const signature = await withRpcRetry("requestAirdrop", () =>
    connection.requestAirdrop(signer.publicKey, lamports)
  );
  const latest = await withRpcRetry("getLatestBlockhash", () =>
    connection.getLatestBlockhash("confirmed")
  );

  await withRpcRetry("confirmTransaction", () =>
    connection.confirmTransaction(
      {
        signature,
        blockhash: latest.blockhash,
        lastValidBlockHeight: latest.lastValidBlockHeight,
      },
      "confirmed"
    )
  );

  return {
    signature,
    explorerUrl: toExplorerUrl(signature),
    wallet: await toSummarySafe(walletRecord),
  };
};

export const transferSolFromActiveWallet = async (to: string, amountSol: number) => {
  if (!Number.isFinite(amountSol) || amountSol <= 0) {
    throw new Error("amountSol must be greater than 0");
  }

  const { signer, walletRecord } = resolveSigner();
  const recipient = new PublicKey(to);
  const lamports = Math.floor(amountSol * LAMPORTS_PER_SOL);

  const tx = new Transaction().add(
    SystemProgram.transfer({
      fromPubkey: signer.publicKey,
      toPubkey: recipient,
      lamports,
    })
  );

  const signature = await sendAndConfirmTransaction(connection, tx, [signer], {
    commitment: "confirmed",
  });

  return {
    signature,
    explorerUrl: toExplorerUrl(signature),
    wallet: await toSummarySafe(walletRecord),
  };
};

export const transferSplFromActiveWallet = async (params: {
  to: string;
  mint: string;
  amount: number;
}) => {
  const { to, mint, amount } = params;

  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error("amount must be greater than 0");
  }

  const { signer, walletRecord } = resolveSigner();
  const mintPublicKey = new PublicKey(mint);
  const recipientPublicKey = new PublicKey(to);

  const senderAta = await getAssociatedTokenAddress(mintPublicKey, signer.publicKey);
  const recipientAta = await getAssociatedTokenAddress(
    mintPublicKey,
    recipientPublicKey
  );

  const recipientAtaInfo = await withRpcRetry("getAccountInfo", () =>
    connection.getAccountInfo(recipientAta, "confirmed")
  );
  const mintInfo = await withRpcRetry("getMint", () =>
    getMint(connection, mintPublicKey, "confirmed")
  );
  const rawAmount = toRawAmount(amount, mintInfo.decimals);

  if (rawAmount <= BigInt(0)) {
    throw new Error("Token amount is too small for mint decimals");
  }

  const tx = new Transaction();

  if (!recipientAtaInfo) {
    tx.add(
      createAssociatedTokenAccountInstruction(
        signer.publicKey,
        recipientAta,
        recipientPublicKey,
        mintPublicKey
      )
    );
  }

  tx.add(
    createTransferInstruction(senderAta, recipientAta, signer.publicKey, rawAmount)
  );

  const signature = await sendAndConfirmTransaction(connection, tx, [signer], {
    commitment: "confirmed",
  });

  return {
    signature,
    explorerUrl: toExplorerUrl(signature),
    wallet: await toSummarySafe(walletRecord),
  };
};

export const mintTestTokenToActiveWallet = async (params: {
  amount: number;
  decimals?: number;
}) => {
  const decimals = params.decimals ?? 6;

  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 9) {
    throw new Error("decimals must be an integer between 0 and 9");
  }

  const { signer, walletRecord } = resolveSigner();
  const mintAddress = await createMint(
    connection,
    signer,
    signer.publicKey,
    signer.publicKey,
    decimals
  );

  const ownerAta = await getOrCreateAssociatedTokenAccount(
    connection,
    signer,
    mintAddress,
    signer.publicKey
  );

  const rawAmount = toRawAmount(params.amount, decimals);
  const signature = await mintTo(
    connection,
    signer,
    mintAddress,
    ownerAta.address,
    signer,
    rawAmount
  );

  return {
    mint: mintAddress.toBase58(),
    amount: params.amount,
    decimals,
    signature,
    explorerUrl: toExplorerUrl(signature),
    wallet: await toSummarySafe(walletRecord),
  };
};
