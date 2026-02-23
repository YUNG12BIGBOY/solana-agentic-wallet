export const toClientError = (error: unknown) => {
  const fromErrorMessage =
    error instanceof Error ? error.message : String(error ?? "");
  const extended = error as
    | {
        transactionMessage?: string;
        response?: { data?: { error?: string } };
      }
    | undefined;

  const raw = (
    fromErrorMessage ||
    extended?.transactionMessage ||
    extended?.response?.data?.error ||
    ""
  ).trim();
  if (!raw) {
    return "Request failed due to an unknown chain/runtime error. Check logs for details.";
  }
  const lower = raw.toLowerCase();

  if (
    lower.includes("attempt to debit an account but found no record of a prior credit")
  ) {
    return "Wallet has no SOL for fees. Fund the active wallet on the selected cluster and retry.";
  }

  if (lower.includes("too many requests") && lower.includes("airdrop")) {
    return "Airdrop faucet rate-limited. Use faucet.solana.com or transfer test SOL manually.";
  }

  if (
    lower.includes("address table account") &&
    (lower.includes("doesn't exist") || lower.includes("does not exist"))
  ) {
    return "Protocol transaction references an unavailable address lookup table on this cluster. Retry on a supported route or cluster.";
  }

  return raw;
};
