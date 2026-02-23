import { Connection } from "@solana/web3.js";
import { env } from "./env";

export const connection = new Connection(env.rpcUrl, "confirmed");
