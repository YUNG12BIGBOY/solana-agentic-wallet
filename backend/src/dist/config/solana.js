"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.connection = void 0;
const web3_js_1 = require("@solana/web3.js");
const env_1 = require("./env");
exports.connection = new web3_js_1.Connection(env_1.env.rpcUrl, "confirmed");
