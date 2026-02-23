import { env } from "../config/env";

const sleep = (ms: number) =>
  new Promise((resolve) => setTimeout(resolve, ms));

const isTransientRpcError = (message: string) => {
  const lower = message.toLowerCase();
  return (
    lower.includes("fetch failed") ||
    lower.includes("econnreset") ||
    lower.includes("etimedout") ||
    lower.includes("enotfound") ||
    lower.includes("socket hang up") ||
    lower.includes("503")
  );
};

export const withRpcRetry = async <T>(
  label: string,
  fn: () => Promise<T>,
  maxAttempts = 3
) => {
  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      const message = error instanceof Error ? error.message : String(error);
      const shouldRetry = attempt < maxAttempts && isTransientRpcError(message);
      if (!shouldRetry) {
        throw new Error(`${label} failed against RPC ${env.rpcUrl}: ${message}`);
      }

      await sleep(200 * attempt);
    }
  }

  throw new Error(
    `${label} failed against RPC ${env.rpcUrl}: ${
      lastError instanceof Error ? lastError.message : String(lastError)
    }`
  );
};
