"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.removeWalletRecord = exports.setActivePublicKey = exports.getActivePublicKey = exports.reserveNextGeneratedWalletLabel = exports.addWalletRecord = exports.getWalletRecord = exports.listWalletRecords = void 0;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const dataDir = path_1.default.resolve(__dirname, "..", "..", "data");
const storePath = path_1.default.join(dataDir, "wallet-store.json");
const ensureStore = () => {
    if (!fs_1.default.existsSync(dataDir)) {
        fs_1.default.mkdirSync(dataDir, { recursive: true });
    }
    if (!fs_1.default.existsSync(storePath)) {
        const initialStore = {
            activePublicKey: null,
            wallets: [],
            walletNameCounter: 1,
        };
        fs_1.default.writeFileSync(storePath, JSON.stringify(initialStore, null, 2), "utf8");
    }
};
const readStore = () => {
    ensureStore();
    try {
        const raw = fs_1.default.readFileSync(storePath, "utf8");
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed.wallets)) {
            throw new Error("Invalid wallet store");
        }
        const highestExistingIndex = parsed.wallets.reduce((max, wallet) => {
            const match = /^Wallet #(\d+)$/i.exec(wallet.label);
            if (!match)
                return max;
            const num = Number(match[1]);
            return Number.isFinite(num) ? Math.max(max, num) : max;
        }, 0);
        const walletNameCounter = typeof parsed.walletNameCounter === "number" && parsed.walletNameCounter > 0
            ? parsed.walletNameCounter
            : highestExistingIndex + 1;
        return {
            activePublicKey: typeof parsed.activePublicKey === "string" ? parsed.activePublicKey : null,
            wallets: parsed.wallets,
            walletNameCounter,
        };
    }
    catch {
        return {
            activePublicKey: null,
            wallets: [],
            walletNameCounter: 1,
        };
    }
};
const writeStore = (store) => {
    ensureStore();
    fs_1.default.writeFileSync(storePath, JSON.stringify(store, null, 2), "utf8");
};
const listWalletRecords = () => readStore().wallets;
exports.listWalletRecords = listWalletRecords;
const getWalletRecord = (publicKey) => readStore().wallets.find((wallet) => wallet.publicKey === publicKey) ?? null;
exports.getWalletRecord = getWalletRecord;
const addWalletRecord = (record) => {
    const store = readStore();
    store.wallets.push(record);
    store.activePublicKey = record.publicKey;
    writeStore(store);
};
exports.addWalletRecord = addWalletRecord;
const reserveNextGeneratedWalletLabel = () => {
    const store = readStore();
    const label = `Wallet #${store.walletNameCounter}`;
    store.walletNameCounter += 1;
    writeStore(store);
    return label;
};
exports.reserveNextGeneratedWalletLabel = reserveNextGeneratedWalletLabel;
const getActivePublicKey = () => readStore().activePublicKey;
exports.getActivePublicKey = getActivePublicKey;
const setActivePublicKey = (publicKey) => {
    const store = readStore();
    const exists = store.wallets.some((wallet) => wallet.publicKey === publicKey);
    if (!exists) {
        throw new Error("Wallet not found");
    }
    store.activePublicKey = publicKey;
    writeStore(store);
};
exports.setActivePublicKey = setActivePublicKey;
const removeWalletRecord = (publicKey) => {
    const store = readStore();
    const index = store.wallets.findIndex((wallet) => wallet.publicKey === publicKey);
    if (index === -1) {
        throw new Error("Wallet not found");
    }
    const [removed] = store.wallets.splice(index, 1);
    if (store.activePublicKey === publicKey) {
        store.activePublicKey = store.wallets[0]?.publicKey ?? null;
    }
    writeStore(store);
    return {
        removed,
        nextActivePublicKey: store.activePublicKey,
    };
};
exports.removeWalletRecord = removeWalletRecord;
