"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.decrypt = exports.encrypt = void 0;
const crypto_1 = __importDefault(require("crypto"));
const env_1 = require("../config/env");
const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;
const key = crypto_1.default
    .createHash("sha256")
    .update(env_1.env.encryptionSecret, "utf8")
    .digest();
const encrypt = (plainText) => {
    const iv = crypto_1.default.randomBytes(IV_LENGTH);
    const cipher = crypto_1.default.createCipheriv(ALGORITHM, key, iv, {
        authTagLength: AUTH_TAG_LENGTH,
    });
    const encrypted = Buffer.concat([
        cipher.update(Buffer.from(plainText, "utf8")),
        cipher.final(),
    ]);
    const authTag = cipher.getAuthTag();
    return `${iv.toString("base64")}:${authTag.toString("base64")}:${encrypted.toString("base64")}`;
};
exports.encrypt = encrypt;
const decrypt = (payload) => {
    const [ivB64, tagB64, encryptedB64] = payload.split(":");
    if (!ivB64 || !tagB64 || !encryptedB64) {
        throw new Error("Invalid encrypted payload format");
    }
    const iv = Buffer.from(ivB64, "base64");
    const authTag = Buffer.from(tagB64, "base64");
    const encrypted = Buffer.from(encryptedB64, "base64");
    const decipher = crypto_1.default.createDecipheriv(ALGORITHM, key, iv, {
        authTagLength: AUTH_TAG_LENGTH,
    });
    decipher.setAuthTag(authTag);
    const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
    return decrypted.toString("utf8");
};
exports.decrypt = decrypt;
