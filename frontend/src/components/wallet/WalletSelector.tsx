import React, { useEffect, useState } from "react";
import { WalletSummary } from "../../types";
import chevronDown from "../../assets/icons/chevron-down.svg";

interface WalletSelectorProps {
  wallets: WalletSummary[];
  activeWallet: WalletSummary | null;
  onSwitch: (publicKey: string) => Promise<void>;
}

export default function WalletSelector({
  wallets,
  activeWallet,
  onSwitch,
}: WalletSelectorProps) {
  const [selectedPublicKey, setSelectedPublicKey] = useState("");

  useEffect(() => {
    setSelectedPublicKey(activeWallet?.publicKey ?? "");
  }, [activeWallet]);

  return (
    <section className="panel-card">
      <h3>Wallet Selector</h3>
      <div className="panel-divider" />
      <label htmlFor="wallet-picker" className="wallet-label">
        {activeWallet?.label ?? "No Wallet Selected"}
      </label>
      {activeWallet && (
        <p className="wallet-balance-inline">
          {activeWallet.solBalance.toFixed(2)} SOL | {activeWallet.usdcBalance.toFixed(2)} USDC
        </p>
      )}
      <div className="wallet-picker-wrap">
        <select
          id="wallet-picker"
          className="wallet-picker"
          value={selectedPublicKey}
          onChange={(event) => setSelectedPublicKey(event.target.value)}
        >
          {wallets.map((wallet) => (
            <option key={wallet.publicKey} value={wallet.publicKey}>
              {wallet.label}
            </option>
          ))}
        </select>
        <img src={chevronDown} alt="" className="wallet-chevron" />
      </div>

      <button
        type="button"
        className="primary-outline-button"
        onClick={() => onSwitch(selectedPublicKey)}
        disabled={!selectedPublicKey || selectedPublicKey === activeWallet?.publicKey}
      >
        Switch Wallet
      </button>
    </section>
  );
}
