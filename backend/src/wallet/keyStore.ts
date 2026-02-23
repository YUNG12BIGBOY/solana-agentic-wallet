import fs from "fs";
import path from "path";

export interface WalletRecord {
  label: string;
  publicKey: string;
  encryptedSecret: string;
  createdAt: string;
}

interface WalletStore {
  activePublicKey: string | null;
  wallets: WalletRecord[];
  walletNameCounter: number;
}

export interface RemoveWalletResult {
  removed: WalletRecord;
  nextActivePublicKey: string | null;
}

const dataDir = path.resolve(__dirname, "..", "..", "data");
const storePath = path.join(dataDir, "wallet-store.json");

const ensureStore = () => {
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  if (!fs.existsSync(storePath)) {
    const initialStore: WalletStore = {
      activePublicKey: null,
      wallets: [],
      walletNameCounter: 1,
    };

    fs.writeFileSync(storePath, JSON.stringify(initialStore, null, 2), "utf8");
  }
};

const readStore = (): WalletStore => {
  ensureStore();

  try {
    const raw = fs.readFileSync(storePath, "utf8");
    const parsed = JSON.parse(raw) as Partial<WalletStore>;

    if (!Array.isArray(parsed.wallets)) {
      throw new Error("Invalid wallet store");
    }

    const highestExistingIndex = parsed.wallets.reduce((max, wallet) => {
      const match = /^Wallet #(\d+)$/i.exec(wallet.label);
      if (!match) return max;
      const num = Number(match[1]);
      return Number.isFinite(num) ? Math.max(max, num) : max;
    }, 0);

    const walletNameCounter =
      typeof parsed.walletNameCounter === "number" && parsed.walletNameCounter > 0
        ? parsed.walletNameCounter
        : highestExistingIndex + 1;

    return {
      activePublicKey:
        typeof parsed.activePublicKey === "string" ? parsed.activePublicKey : null,
      wallets: parsed.wallets,
      walletNameCounter,
    };
  } catch {
    return {
      activePublicKey: null,
      wallets: [],
      walletNameCounter: 1,
    };
  }
};

const writeStore = (store: WalletStore) => {
  ensureStore();
  fs.writeFileSync(storePath, JSON.stringify(store, null, 2), "utf8");
};

export const listWalletRecords = () => readStore().wallets;

export const getWalletRecord = (publicKey: string) =>
  readStore().wallets.find((wallet) => wallet.publicKey === publicKey) ?? null;

export const addWalletRecord = (record: WalletRecord) => {
  const store = readStore();
  store.wallets.push(record);
  store.activePublicKey = record.publicKey;
  writeStore(store);
};

export const reserveNextGeneratedWalletLabel = () => {
  const store = readStore();
  const label = `Wallet #${store.walletNameCounter}`;
  store.walletNameCounter += 1;
  writeStore(store);
  return label;
};

export const getActivePublicKey = () => readStore().activePublicKey;

export const setActivePublicKey = (publicKey: string) => {
  const store = readStore();
  const exists = store.wallets.some((wallet) => wallet.publicKey === publicKey);

  if (!exists) {
    throw new Error("Wallet not found");
  }

  store.activePublicKey = publicKey;
  writeStore(store);
};

export const removeWalletRecord = (publicKey: string): RemoveWalletResult => {
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
