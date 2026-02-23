import { env } from "../config/env";

type ExplorerCluster = "devnet" | "testnet" | "mainnet-beta";

const buildClusterParam = (cluster: ExplorerCluster) => `?cluster=${cluster}`;

export const toExplorerUrl = (signature: string) =>
  `https://explorer.solana.com/tx/${signature}${buildClusterParam(env.solanaCluster)}`;

export const toExplorerUrlForCluster = (
  signature: string,
  cluster: ExplorerCluster
) => `https://explorer.solana.com/tx/${signature}${buildClusterParam(cluster)}`;

export const toAddressExplorerUrl = (address: string) =>
  `https://explorer.solana.com/address/${address}${buildClusterParam(env.solanaCluster)}`;
