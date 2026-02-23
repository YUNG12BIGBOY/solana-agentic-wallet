import { Router } from "express";
import {
  airdropActiveWallet,
  createWallet,
  deleteWallet,
  getActiveWalletTokenBalances,
  getActiveWalletReceiveInfo,
  getActiveWalletSplReceiveInfo,
  getWalletState,
  mintTestTokenToActiveWallet,
  switchWallet,
  transferSolFromActiveWallet,
  transferSplFromActiveWallet,
} from "../wallet/walletManager";
import { emitLog } from "../websocket";
import { env } from "../config/env";
import { toClientError } from "../utils/errors";

const router = Router();

router.post("/create", async (req, res) => {
  try {
    const { label } = req.body as { label?: string };
    const wallet = await createWallet(label);

    emitLog({
      level: "success",
      message: `Wallet created: ${wallet.label}`,
      data: { publicKey: wallet.publicKey },
    });

    res.json({
      wallet,
      state: await getWalletState(),
    });
  } catch (error) {
    res.status(500).json({ error: toClientError(error) });
  }
});

router.get("/", async (_req, res) => {
  try {
    res.json(await getWalletState());
  } catch (error) {
    res.status(500).json({ error: toClientError(error) });
  }
});

router.get("/tokens", async (_req, res) => {
  try {
    const tokens = await getActiveWalletTokenBalances();
    res.json({ tokens });
  } catch (error) {
    res.status(400).json({ error: toClientError(error) });
  }
});

router.post("/switch", async (req, res) => {
  try {
    const { publicKey } = req.body as { publicKey?: string };
    if (!publicKey) {
      return res.status(400).json({ error: "publicKey is required" });
    }

    const wallet = await switchWallet(publicKey);
    emitLog({
      level: "info",
      message: `Active wallet switched to ${wallet.label}`,
      data: { publicKey: wallet.publicKey },
    });

    return res.json({ wallet, state: await getWalletState() });
  } catch (error) {
    return res.status(400).json({ error: toClientError(error) });
  }
});

router.post("/delete", async (req, res) => {
  try {
    const { publicKey } = req.body as { publicKey?: string };
    if (!publicKey) {
      return res.status(400).json({ error: "publicKey is required" });
    }

    const result = await deleteWallet(publicKey);
    emitLog(
      result.alreadyDeleted
        ? {
            level: "info",
            message: `Wallet already removed: ${result.removedPublicKey}`,
            data: { publicKey: result.removedPublicKey },
          }
        : {
            level: "warn",
            message: `Wallet deleted: ${result.removedLabel}`,
            data: {
              publicKey: result.removedPublicKey,
              nextActivePublicKey: result.activeWallet?.publicKey ?? null,
            },
          }
    );

    return res.json({
      ...result,
      state: await getWalletState(),
    });
  } catch (error) {
    return res.status(400).json({ error: toClientError(error) });
  }
});

router.post("/airdrop", async (req, res) => {
  try {
    const { amountSol } = req.body as { amountSol?: number };
    const result = await airdropActiveWallet(amountSol ?? 1);

    emitLog({
      level: "success",
      message: `Airdrop requested (${amountSol ?? 1} SOL)`,
      txSignature: result.signature,
      explorerUrl: result.explorerUrl,
    });

    res.json(result);
  } catch (error) {
    res.status(400).json({ error: toClientError(error) });
  }
});

router.post("/transfer-sol", async (req, res) => {
  try {
    const { to, amountSol } = req.body as { to?: string; amountSol?: number };
    const recipient =
      to || env.defaultRecipient || getActiveWalletReceiveInfo().publicKey;
    if (!recipient) {
      return res.status(400).json({ error: "Recipient address is required" });
    }

    const result = await transferSolFromActiveWallet(recipient, amountSol ?? 0.01);
    emitLog({
      level: "success",
      message: `SOL transfer executed (${amountSol ?? 0.01} SOL)`,
      txSignature: result.signature,
      explorerUrl: result.explorerUrl,
    });

    return res.json(result);
  } catch (error) {
    return res.status(400).json({ error: toClientError(error) });
  }
});

router.post("/transfer-spl", async (req, res) => {
  try {
    const { to, mint, amount } = req.body as {
      to?: string;
      mint?: string;
      amount?: number;
    };

    const recipient =
      to || env.defaultRecipient || getActiveWalletReceiveInfo().publicKey;
    if (!recipient) {
      return res.status(400).json({ error: "Recipient address is required" });
    }

    if (!mint) {
      return res.status(400).json({ error: "mint is required" });
    }

    const result = await transferSplFromActiveWallet({
      to: recipient,
      mint,
      amount: amount ?? 1,
    });

    emitLog({
      level: "success",
      message: `SPL transfer executed (${amount ?? 1})`,
      txSignature: result.signature,
      explorerUrl: result.explorerUrl,
    });

    return res.json(result);
  } catch (error) {
    return res.status(400).json({ error: toClientError(error) });
  }
});

router.post("/mint-test-token", async (req, res) => {
  try {
    const { amount, decimals } = req.body as { amount?: number; decimals?: number };
    const result = await mintTestTokenToActiveWallet({
      amount: amount ?? 1_000,
      decimals,
    });

    emitLog({
      level: "success",
      message: `Minted test SPL token (${result.amount})`,
      txSignature: result.signature,
      explorerUrl: result.explorerUrl,
      data: { mint: result.mint, decimals: result.decimals },
    });

    return res.json(result);
  } catch (error) {
    return res.status(400).json({ error: toClientError(error) });
  }
});

router.get("/receive", (_req, res) => {
  try {
    const receive = getActiveWalletReceiveInfo();
    return res.json(receive);
  } catch (error) {
    return res.status(400).json({ error: toClientError(error) });
  }
});

router.get("/receive-spl", async (req, res) => {
  try {
    const mint = String(req.query.mint ?? "").trim();
    const prepare = String(req.query.prepare ?? "false").toLowerCase() === "true";

    if (!mint) {
      return res.status(400).json({ error: "mint is required" });
    }

    const receive = await getActiveWalletSplReceiveInfo({ mint, prepare });
    if (receive.prepared) {
      emitLog({
        level: "success",
        message: "Prepared SPL receive account (ATA)",
        txSignature: receive.preparationSignature,
        explorerUrl: receive.preparationExplorerUrl,
        data: {
          mint: receive.mint,
          associatedTokenAccount: receive.associatedTokenAccount,
        },
      });
    }

    return res.json(receive);
  } catch (error) {
    return res.status(400).json({ error: toClientError(error) });
  }
});

export default router;
