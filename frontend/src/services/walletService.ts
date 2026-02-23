import { api } from "../config/api";
import {
  TokenBalance,
  WalletReceiveInfo,
  WalletSplReceiveInfo,
  WalletState,
  WalletSummary,
} from "../types";

interface WalletMutationResponse {
  wallet: WalletSummary;
  state?: WalletState;
}

interface WalletDeleteResponse {
  removedPublicKey: string;
  removedLabel: string;
  activeWallet: WalletSummary | null;
  state: WalletState;
}

interface WalletTxResponse {
  signature: string;
  explorerUrl: string;
  wallet: WalletSummary;
}

interface MintTestTokenResponse extends WalletTxResponse {
  mint: string;
  amount: number;
  decimals: number;
}

interface ActiveTokensResponse {
  tokens: TokenBalance[];
}

export const fetchWalletState = async () => {
  const { data } = await api.get<WalletState>("/wallet");
  return data;
};

export const createWallet = async (label?: string) => {
  const { data } = await api.post<WalletMutationResponse>("/wallet/create", { label });
  return data;
};

export const switchWallet = async (publicKey: string) => {
  const { data } = await api.post<WalletMutationResponse>("/wallet/switch", {
    publicKey,
  });
  return data;
};

export const deleteWallet = async (publicKey: string) => {
  const { data } = await api.post<WalletDeleteResponse>("/wallet/delete", {
    publicKey,
  });
  return data;
};

export const airdropSol = async (amountSol = 1) => {
  const { data } = await api.post<WalletTxResponse>("/wallet/airdrop", {
    amountSol,
  });
  return data;
};

export const transferSol = async (to: string, amountSol: number) => {
  const { data } = await api.post<WalletTxResponse>("/wallet/transfer-sol", {
    to,
    amountSol,
  });
  return data;
};

export const sendTokens = async (mint: string, to: string, amount: number) => {
  const { data } = await api.post<WalletTxResponse>("/wallet/transfer-spl", {
    mint,
    to,
    amount,
  });
  return data;
};

export const mintTestToken = async (amount: number, decimals = 6) => {
  const { data } = await api.post<MintTestTokenResponse>("/wallet/mint-test-token", {
    amount,
    decimals,
  });
  return data;
};

export const fetchActiveTokenBalances = async () => {
  const { data } = await api.get<ActiveTokensResponse>("/wallet/tokens");
  return data.tokens;
};

export const fetchReceiveInfo = async () => {
  const { data } = await api.get<WalletReceiveInfo>("/wallet/receive");
  return data;
};

export const fetchReceiveSplInfo = async (mint: string, prepare = false) => {
  const { data } = await api.get<WalletSplReceiveInfo>("/wallet/receive-spl", {
    params: { mint, prepare },
  });
  return data;
};
