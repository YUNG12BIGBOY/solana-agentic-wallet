"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.mintTestTokenToActiveWallet = exports.transferSplFromActiveWallet = exports.transferSolFromActiveWallet = exports.airdropActiveWallet = exports.getActiveWalletTokenBalances = exports.mintTokensToOwner = exports.transferSplBetweenWallets = exports.ensureAssociatedTokenAccountForOwner = exports.createMintForWallet = exports.getActiveWalletPublicKey = exports.loadSignerForWallet = exports.loadActiveSigner = exports.getActiveWalletSplReceiveInfo = exports.getActiveWalletReceiveInfo = exports.deleteWallet = exports.ensureWalletByLabel = exports.findWalletByLabel = exports.switchWallet = exports.getWalletSummaryByPublicKey = exports.getWalletState = exports.createWallet = void 0;
const web3_js_1 = require("@solana/web3.js");
const spl_token_1 = require("@solana/spl-token");
const env_1 = require("../config/env");
const solana_1 = require("../config/solana");
const encryption_1 = require("../security/encryption");
const keyStore_1 = require("./keyStore");
const explorer_1 = require("../utils/explorer");
const rpc_1 = require("../utils/rpc");
const round = (value, digits = 4) => Number(value.toFixed(digits));
const toUniqueLabel = (requestedLabel, existing) => {
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
const pow10 = (decimals) => BigInt(10) ** BigInt(decimals);
const toRawAmount = (amount, decimals) => {
    if (!Number.isFinite(amount) || amount <= 0) {
        throw new Error("amount must be greater than 0");
    }
    const normalized = amount.toFixed(decimals);
    const [whole, fractional = ""] = normalized.split(".");
    const wholePart = BigInt(whole || "0");
    const fractionalPart = BigInt((fractional + "0".repeat(decimals)).slice(0, decimals) || "0");
    return wholePart * pow10(decimals) + fractionalPart;
};
const getTokenBalances = async (owner) => {
    try {
        const accounts = await (0, rpc_1.withRpcRetry)("getParsedTokenAccountsByOwner", () => solana_1.connection.getParsedTokenAccountsByOwner(owner, {
            programId: spl_token_1.TOKEN_PROGRAM_ID,
        }));
        return accounts.value
            .map((account) => {
            const parsed = account.account.data.parsed.info;
            return {
                mint: parsed.mint,
                amount: round(parsed.tokenAmount.uiAmount ?? 0, 8),
                decimals: parsed.tokenAmount.decimals,
            };
        })
            .filter((token) => token.amount > 0);
    }
    catch {
        return [];
    }
};
const toSummary = async (record) => {
    const owner = new web3_js_1.PublicKey(record.publicKey);
    const [balanceLamports, tokenBalances] = await Promise.all([
        (0, rpc_1.withRpcRetry)("getBalance", () => solana_1.connection.getBalance(owner, "confirmed")),
        getTokenBalances(owner),
    ]);
    const usdcBalance = tokenBalances.find((token) => token.mint === env_1.env.defaultUsdcMint)?.amount ?? 0;
    return {
        label: record.label,
        publicKey: record.publicKey,
        solBalance: round(balanceLamports / web3_js_1.LAMPORTS_PER_SOL, 4),
        usdcBalance,
        tokenBalances,
        createdAt: record.createdAt,
    };
};
const toFallbackSummary = (record) => ({
    label: record.label,
    publicKey: record.publicKey,
    solBalance: 0,
    usdcBalance: 0,
    tokenBalances: [],
    createdAt: record.createdAt,
});
const toSummarySafe = async (record) => {
    try {
        return await toSummary(record);
    }
    catch {
        return toFallbackSummary(record);
    }
};
const resolveSigner = (publicKey) => {
    const targetPublicKey = publicKey ?? (0, keyStore_1.getActivePublicKey)();
    if (!targetPublicKey) {
        throw new Error("No active wallet selected");
    }
    const walletRecord = (0, keyStore_1.getWalletRecord)(targetPublicKey);
    if (!walletRecord) {
        throw new Error("Wallet not found");
    }
    const secretKeyB64 = (0, encryption_1.decrypt)(walletRecord.encryptedSecret);
    const secretKey = Uint8Array.from(Buffer.from(secretKeyB64, "base64"));
    const signer = web3_js_1.Keypair.fromSecretKey(secretKey);
    return {
        signer,
        walletRecord,
    };
};
const createWallet = async (label) => {
    const keypair = web3_js_1.Keypair.generate();
    const existingLabels = new Set((0, keyStore_1.listWalletRecords)().map((wallet) => wallet.label.toLowerCase()));
    let walletLabel = "";
    if (label?.trim()) {
        walletLabel = toUniqueLabel(label, existingLabels);
    }
    else {
        walletLabel = (0, keyStore_1.reserveNextGeneratedWalletLabel)();
        while (existingLabels.has(walletLabel.toLowerCase())) {
            walletLabel = (0, keyStore_1.reserveNextGeneratedWalletLabel)();
        }
    }
    const secretKeyB64 = Buffer.from(keypair.secretKey).toString("base64");
    const createdAt = new Date().toISOString();
    (0, keyStore_1.addWalletRecord)({
        label: walletLabel,
        publicKey: keypair.publicKey.toBase58(),
        encryptedSecret: (0, encryption_1.encrypt)(secretKeyB64),
        createdAt,
    });
    return toSummarySafe({
        label: walletLabel,
        publicKey: keypair.publicKey.toBase58(),
        createdAt,
    });
};
exports.createWallet = createWallet;
const getWalletState = async () => {
    const records = (0, keyStore_1.listWalletRecords)();
    const wallets = [];
    for (const record of records) {
        wallets.push(await toSummarySafe(record));
    }
    const activePublicKey = (0, keyStore_1.getActivePublicKey)();
    return {
        wallets,
        activeWallet: wallets.find((wallet) => wallet.publicKey === activePublicKey) ?? null,
    };
};
exports.getWalletState = getWalletState;
const getWalletSummaryByPublicKey = async (publicKey) => {
    const record = (0, keyStore_1.getWalletRecord)(publicKey);
    if (!record) {
        return null;
    }
    return toSummarySafe(record);
};
exports.getWalletSummaryByPublicKey = getWalletSummaryByPublicKey;
const switchWallet = async (publicKey) => {
    (0, keyStore_1.setActivePublicKey)(publicKey);
    const record = (0, keyStore_1.getWalletRecord)(publicKey);
    if (!record) {
        throw new Error("Wallet not found");
    }
    return toSummarySafe(record);
};
exports.switchWallet = switchWallet;
const findWalletByLabel = (label) => (0, keyStore_1.listWalletRecords)().find((wallet) => wallet.label.toLowerCase() === label.toLowerCase()) ??
    null;
exports.findWalletByLabel = findWalletByLabel;
const ensureWalletByLabel = async (label) => {
    const existing = (0, exports.findWalletByLabel)(label);
    if (existing) {
        return toSummarySafe(existing);
    }
    return (0, exports.createWallet)(label);
};
exports.ensureWalletByLabel = ensureWalletByLabel;
const deleteWallet = async (publicKey) => {
    const existing = (0, keyStore_1.getWalletRecord)(publicKey);
    if (!existing) {
        const activePublicKey = (0, keyStore_1.getActivePublicKey)();
        const activeRecord = activePublicKey ? (0, keyStore_1.getWalletRecord)(activePublicKey) : null;
        return {
            removedPublicKey: publicKey,
            removedLabel: "Already removed",
            activeWallet: activeRecord ? await toSummarySafe(activeRecord) : null,
            alreadyDeleted: true,
        };
    }
    const records = (0, keyStore_1.listWalletRecords)();
    if (records.length <= 1) {
        throw new Error("Cannot delete the last wallet. Create another wallet first.");
    }
    const result = (0, keyStore_1.removeWalletRecord)(publicKey);
    const nextWallet = result.nextActivePublicKey ? (0, keyStore_1.getWalletRecord)(result.nextActivePublicKey) : null;
    return {
        removedPublicKey: result.removed.publicKey,
        removedLabel: result.removed.label,
        activeWallet: nextWallet ? await toSummarySafe(nextWallet) : null,
        alreadyDeleted: false,
    };
};
exports.deleteWallet = deleteWallet;
const getActiveWalletReceiveInfo = () => {
    const signer = (0, exports.loadActiveSigner)();
    const publicKey = signer.publicKey.toBase58();
    return {
        publicKey,
        explorerUrl: (0, explorer_1.toAddressExplorerUrl)(publicKey),
    };
};
exports.getActiveWalletReceiveInfo = getActiveWalletReceiveInfo;
const getActiveWalletSplReceiveInfo = async (params) => {
    const { signer } = resolveSigner();
    const mint = new web3_js_1.PublicKey(params.mint);
    const ata = await (0, spl_token_1.getAssociatedTokenAddress)(mint, signer.publicKey);
    const ataInfo = await (0, rpc_1.withRpcRetry)("getAccountInfo", () => solana_1.connection.getAccountInfo(ata, "confirmed"));
    let exists = Boolean(ataInfo);
    let prepared = false;
    let preparationSignature;
    if (params.prepare && !exists) {
        const tx = new web3_js_1.Transaction().add((0, spl_token_1.createAssociatedTokenAccountInstruction)(signer.publicKey, ata, signer.publicKey, mint));
        preparationSignature = await (0, web3_js_1.sendAndConfirmTransaction)(solana_1.connection, tx, [signer], {
            commitment: "confirmed",
        });
        prepared = true;
        exists = true;
    }
    return {
        ownerPublicKey: signer.publicKey.toBase58(),
        ownerExplorerUrl: (0, explorer_1.toAddressExplorerUrl)(signer.publicKey.toBase58()),
        mint: mint.toBase58(),
        associatedTokenAccount: ata.toBase58(),
        associatedTokenAccountExplorerUrl: (0, explorer_1.toAddressExplorerUrl)(ata.toBase58()),
        exists,
        prepared,
        preparationSignature,
        preparationExplorerUrl: preparationSignature
            ? (0, explorer_1.toExplorerUrl)(preparationSignature)
            : undefined,
    };
};
exports.getActiveWalletSplReceiveInfo = getActiveWalletSplReceiveInfo;
const loadActiveSigner = () => resolveSigner().signer;
exports.loadActiveSigner = loadActiveSigner;
const loadSignerForWallet = (publicKey) => resolveSigner(publicKey).signer;
exports.loadSignerForWallet = loadSignerForWallet;
const getActiveWalletPublicKey = () => (0, keyStore_1.getActivePublicKey)();
exports.getActiveWalletPublicKey = getActiveWalletPublicKey;
const createMintForWallet = async (params) => {
    const signer = (0, exports.loadSignerForWallet)(params.walletPublicKey);
    const targetConnection = params.rpcConnection ?? solana_1.connection;
    const mint = await (0, spl_token_1.createMint)(targetConnection, signer, signer.publicKey, signer.publicKey, params.decimals);
    return mint.toBase58();
};
exports.createMintForWallet = createMintForWallet;
const ensureAssociatedTokenAccountForOwner = async (params) => {
    const payerSigner = (0, exports.loadSignerForWallet)(params.payerWalletPublicKey);
    const targetConnection = params.rpcConnection ?? solana_1.connection;
    const ata = await (0, spl_token_1.getOrCreateAssociatedTokenAccount)(targetConnection, payerSigner, new web3_js_1.PublicKey(params.mintAddress), new web3_js_1.PublicKey(params.ownerPublicKey));
    return ata.address.toBase58();
};
exports.ensureAssociatedTokenAccountForOwner = ensureAssociatedTokenAccountForOwner;
const transferSplBetweenWallets = async (params) => {
    if (!Number.isFinite(params.amount) || params.amount <= 0) {
        throw new Error("amount must be greater than 0");
    }
    const fromSigner = (0, exports.loadSignerForWallet)(params.fromWalletPublicKey);
    const targetConnection = params.rpcConnection ?? solana_1.connection;
    const mintPublicKey = new web3_js_1.PublicKey(params.mintAddress);
    const recipientPublicKey = new web3_js_1.PublicKey(params.toWalletPublicKey);
    const senderAta = await (0, spl_token_1.getAssociatedTokenAddress)(mintPublicKey, fromSigner.publicKey);
    const recipientAta = await (0, spl_token_1.getAssociatedTokenAddress)(mintPublicKey, recipientPublicKey);
    const recipientAtaInfo = await (0, rpc_1.withRpcRetry)("getAccountInfo", () => targetConnection.getAccountInfo(recipientAta, "confirmed"));
    const mintInfo = await (0, rpc_1.withRpcRetry)("getMint", () => (0, spl_token_1.getMint)(targetConnection, mintPublicKey, "confirmed"));
    const rawAmount = toRawAmount(params.amount, mintInfo.decimals);
    if (rawAmount <= BigInt(0)) {
        throw new Error("Token amount is too small for mint decimals");
    }
    const tx = new web3_js_1.Transaction();
    if (!recipientAtaInfo) {
        tx.add((0, spl_token_1.createAssociatedTokenAccountInstruction)(fromSigner.publicKey, recipientAta, recipientPublicKey, mintPublicKey));
    }
    tx.add((0, spl_token_1.createTransferInstruction)(senderAta, recipientAta, fromSigner.publicKey, rawAmount));
    const signature = await (0, web3_js_1.sendAndConfirmTransaction)(targetConnection, tx, [fromSigner], {
        commitment: "confirmed",
    });
    return {
        signature,
        explorerUrl: (0, explorer_1.toExplorerUrl)(signature),
    };
};
exports.transferSplBetweenWallets = transferSplBetweenWallets;
const mintTokensToOwner = async (params) => {
    if (!Number.isFinite(params.amount) || params.amount <= 0) {
        throw new Error("amount must be greater than 0");
    }
    const authoritySigner = (0, exports.loadSignerForWallet)(params.mintAuthorityWalletPublicKey);
    const targetConnection = params.rpcConnection ?? solana_1.connection;
    const mintPublicKey = new web3_js_1.PublicKey(params.mintAddress);
    const ownerPublicKey = new web3_js_1.PublicKey(params.ownerWalletPublicKey);
    const ownerAta = await (0, spl_token_1.getOrCreateAssociatedTokenAccount)(targetConnection, authoritySigner, mintPublicKey, ownerPublicKey);
    const decimals = params.decimals ??
        (await (0, rpc_1.withRpcRetry)("getMint", () => (0, spl_token_1.getMint)(targetConnection, mintPublicKey, "confirmed"))).decimals;
    const rawAmount = toRawAmount(params.amount, decimals);
    const signature = await (0, spl_token_1.mintTo)(targetConnection, authoritySigner, mintPublicKey, ownerAta.address, authoritySigner, rawAmount);
    return {
        signature,
        explorerUrl: (0, explorer_1.toExplorerUrl)(signature),
    };
};
exports.mintTokensToOwner = mintTokensToOwner;
const getActiveWalletTokenBalances = async () => {
    const { signer } = resolveSigner();
    return getTokenBalances(signer.publicKey);
};
exports.getActiveWalletTokenBalances = getActiveWalletTokenBalances;
const airdropActiveWallet = async (amountSol) => {
    if (!Number.isFinite(amountSol) || amountSol <= 0) {
        throw new Error("amountSol must be greater than 0");
    }
    const { signer, walletRecord } = resolveSigner();
    const lamports = Math.floor(amountSol * web3_js_1.LAMPORTS_PER_SOL);
    const signature = await (0, rpc_1.withRpcRetry)("requestAirdrop", () => solana_1.connection.requestAirdrop(signer.publicKey, lamports));
    const latest = await (0, rpc_1.withRpcRetry)("getLatestBlockhash", () => solana_1.connection.getLatestBlockhash("confirmed"));
    await (0, rpc_1.withRpcRetry)("confirmTransaction", () => solana_1.connection.confirmTransaction({
        signature,
        blockhash: latest.blockhash,
        lastValidBlockHeight: latest.lastValidBlockHeight,
    }, "confirmed"));
    return {
        signature,
        explorerUrl: (0, explorer_1.toExplorerUrl)(signature),
        wallet: await toSummarySafe(walletRecord),
    };
};
exports.airdropActiveWallet = airdropActiveWallet;
const transferSolFromActiveWallet = async (to, amountSol) => {
    if (!Number.isFinite(amountSol) || amountSol <= 0) {
        throw new Error("amountSol must be greater than 0");
    }
    const { signer, walletRecord } = resolveSigner();
    const recipient = new web3_js_1.PublicKey(to);
    const lamports = Math.floor(amountSol * web3_js_1.LAMPORTS_PER_SOL);
    const tx = new web3_js_1.Transaction().add(web3_js_1.SystemProgram.transfer({
        fromPubkey: signer.publicKey,
        toPubkey: recipient,
        lamports,
    }));
    const signature = await (0, web3_js_1.sendAndConfirmTransaction)(solana_1.connection, tx, [signer], {
        commitment: "confirmed",
    });
    return {
        signature,
        explorerUrl: (0, explorer_1.toExplorerUrl)(signature),
        wallet: await toSummarySafe(walletRecord),
    };
};
exports.transferSolFromActiveWallet = transferSolFromActiveWallet;
const transferSplFromActiveWallet = async (params) => {
    const { to, mint, amount } = params;
    if (!Number.isFinite(amount) || amount <= 0) {
        throw new Error("amount must be greater than 0");
    }
    const { signer, walletRecord } = resolveSigner();
    const mintPublicKey = new web3_js_1.PublicKey(mint);
    const recipientPublicKey = new web3_js_1.PublicKey(to);
    const senderAta = await (0, spl_token_1.getAssociatedTokenAddress)(mintPublicKey, signer.publicKey);
    const recipientAta = await (0, spl_token_1.getAssociatedTokenAddress)(mintPublicKey, recipientPublicKey);
    const recipientAtaInfo = await (0, rpc_1.withRpcRetry)("getAccountInfo", () => solana_1.connection.getAccountInfo(recipientAta, "confirmed"));
    const mintInfo = await (0, rpc_1.withRpcRetry)("getMint", () => (0, spl_token_1.getMint)(solana_1.connection, mintPublicKey, "confirmed"));
    const rawAmount = toRawAmount(amount, mintInfo.decimals);
    if (rawAmount <= BigInt(0)) {
        throw new Error("Token amount is too small for mint decimals");
    }
    const tx = new web3_js_1.Transaction();
    if (!recipientAtaInfo) {
        tx.add((0, spl_token_1.createAssociatedTokenAccountInstruction)(signer.publicKey, recipientAta, recipientPublicKey, mintPublicKey));
    }
    tx.add((0, spl_token_1.createTransferInstruction)(senderAta, recipientAta, signer.publicKey, rawAmount));
    const signature = await (0, web3_js_1.sendAndConfirmTransaction)(solana_1.connection, tx, [signer], {
        commitment: "confirmed",
    });
    return {
        signature,
        explorerUrl: (0, explorer_1.toExplorerUrl)(signature),
        wallet: await toSummarySafe(walletRecord),
    };
};
exports.transferSplFromActiveWallet = transferSplFromActiveWallet;
const mintTestTokenToActiveWallet = async (params) => {
    const decimals = params.decimals ?? 6;
    if (!Number.isInteger(decimals) || decimals < 0 || decimals > 9) {
        throw new Error("decimals must be an integer between 0 and 9");
    }
    const { signer, walletRecord } = resolveSigner();
    const mintAddress = await (0, spl_token_1.createMint)(solana_1.connection, signer, signer.publicKey, signer.publicKey, decimals);
    const ownerAta = await (0, spl_token_1.getOrCreateAssociatedTokenAccount)(solana_1.connection, signer, mintAddress, signer.publicKey);
    const rawAmount = toRawAmount(params.amount, decimals);
    const signature = await (0, spl_token_1.mintTo)(solana_1.connection, signer, mintAddress, ownerAta.address, signer, rawAmount);
    return {
        mint: mintAddress.toBase58(),
        amount: params.amount,
        decimals,
        signature,
        explorerUrl: (0, explorer_1.toExplorerUrl)(signature),
        wallet: await toSummarySafe(walletRecord),
    };
};
exports.mintTestTokenToActiveWallet = mintTestTokenToActiveWallet;
