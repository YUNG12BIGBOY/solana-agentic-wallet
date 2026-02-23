import React from "react";
import { SystemHealth, WalletSummary } from "../../types";
import logoStack from "../../assets/icons/logo-stack.svg";

interface HeaderProps {
  wallet: WalletSummary | null;
  network: SystemHealth | null;
}

export default function Header({ wallet, network }: HeaderProps) {
  return (
    <header className="app-header">
      <div className="brand">
        <img src={logoStack} alt="" className="brand-mark" />
        <h1>AI Agentic Wallet Dashboard</h1>
      </div>

      <div className="wallet-balance">
        <span className="wallet-label-inline">Cluster:</span>
        <span>{network?.cluster ?? "testnet"}</span>
        <span className="divider">|</span>
        <span className="wallet-label-inline">Wallet Balance:</span>
        <span>
          {wallet ? wallet.solBalance.toFixed(2) : "0.00"} SOL
        </span>
        <span className="divider">|</span>
        <span>
          {wallet ? wallet.usdcBalance.toFixed(2) : "0.00"} USDC
        </span>
        <span className="divider">|</span>
        <span>{wallet ? wallet.tokenBalances.length : 0} SPL</span>
        {!network?.jupiterEnabled && (
          <>
            <span className="divider">|</span>
            <span className="wallet-label-inline">Jupiter Off</span>
          </>
        )}
        <span className="status-dot" aria-hidden />
      </div>
    </header>
  );
}
