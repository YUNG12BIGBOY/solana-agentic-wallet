"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.broadcastSignedVersionedTransaction = exports.signUnsignedVersionedTransaction = void 0;
const web3_js_1 = require("@solana/web3.js");
const walletManager_1 = require("./walletManager");
const signUnsignedVersionedTransaction = ({ unsignedTransactionBase64, walletPublicKey, }) => {
    const signer = walletPublicKey
        ? (0, walletManager_1.loadSignerForWallet)(walletPublicKey)
        : (0, walletManager_1.loadActiveSigner)();
    const tx = web3_js_1.VersionedTransaction.deserialize(Buffer.from(unsignedTransactionBase64, "base64"));
    tx.sign([signer]);
    return {
        signedTransactionBase64: Buffer.from(tx.serialize()).toString("base64"),
    };
};
exports.signUnsignedVersionedTransaction = signUnsignedVersionedTransaction;
const broadcastSignedVersionedTransaction = async (params) => {
    const signature = await params.connection.sendRawTransaction(Buffer.from(params.signedTransactionBase64, "base64"), {
        skipPreflight: false,
        maxRetries: 3,
    });
    await params.connection.confirmTransaction(signature, "confirmed");
    return signature;
};
exports.broadcastSignedVersionedTransaction = broadcastSignedVersionedTransaction;
