import { Connection, VersionedTransaction } from "@solana/web3.js";
import { loadActiveSigner, loadSignerForWallet } from "./walletManager";

export interface SignRequest {
  unsignedTransactionBase64: string;
  walletPublicKey?: string;
}

export interface SignResponse {
  signedTransactionBase64: string;
}

export const signUnsignedVersionedTransaction = ({
  unsignedTransactionBase64,
  walletPublicKey,
}: SignRequest): SignResponse => {
  const signer = walletPublicKey
    ? loadSignerForWallet(walletPublicKey)
    : loadActiveSigner();

  const tx = VersionedTransaction.deserialize(
    Buffer.from(unsignedTransactionBase64, "base64")
  );
  tx.sign([signer]);

  return {
    signedTransactionBase64: Buffer.from(tx.serialize()).toString("base64"),
  };
};

export const broadcastSignedVersionedTransaction = async (params: {
  connection: Connection;
  signedTransactionBase64: string;
}) => {
  const signature = await params.connection.sendRawTransaction(
    Buffer.from(params.signedTransactionBase64, "base64"),
    {
      skipPreflight: false,
      maxRetries: 3,
    }
  );

  await params.connection.confirmTransaction(signature, "confirmed");
  return signature;
};
