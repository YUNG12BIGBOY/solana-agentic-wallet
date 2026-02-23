import React, { useEffect, useState } from "react";
import { ProtocolName, RiskSettings } from "../../types";

interface RiskControlsProps {
  initialRisk: RiskSettings;
  onUpdate: (risk: Partial<RiskSettings>) => Promise<void>;
}

const parseProtocols = (value: string) =>
  value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean) as ProtocolName[];

export default function RiskControls({
  initialRisk,
  onUpdate,
}: RiskControlsProps) {
  const [maxTradeSizeSol, setMaxTradeSizeSol] = useState(initialRisk.maxTradeSizeSol);
  const [maxSlippageBps, setMaxSlippageBps] = useState(initialRisk.maxSlippageBps);
  const [minIntervalMs, setMinIntervalMs] = useState(initialRisk.minIntervalMs);
  const [maxConsecutiveFailures, setMaxConsecutiveFailures] = useState(
    initialRisk.maxConsecutiveFailures
  );
  const [allowedProtocols, setAllowedProtocols] = useState(
    initialRisk.allowedProtocols.join(", ")
  );

  useEffect(() => {
    setMaxTradeSizeSol(initialRisk.maxTradeSizeSol);
    setMaxSlippageBps(initialRisk.maxSlippageBps);
    setMinIntervalMs(initialRisk.minIntervalMs);
    setMaxConsecutiveFailures(initialRisk.maxConsecutiveFailures);
    setAllowedProtocols(initialRisk.allowedProtocols.join(", "));
  }, [initialRisk]);

  const updateRisk = async () => {
    await onUpdate({
      maxTradeSizeSol,
      maxSlippageBps,
      minIntervalMs,
      maxConsecutiveFailures,
      allowedProtocols: parseProtocols(allowedProtocols),
    });
  };

  return (
    <div className="risk-controls">
      <h3>Risk Controls</h3>
      <div className="panel-divider" />

      <label className="risk-field">
        Max Trade Size (SOL)
        <input
          type="number"
          value={maxTradeSizeSol}
          min={0.01}
          step={0.01}
          onChange={(event) => setMaxTradeSizeSol(Number(event.target.value))}
        />
      </label>

      <label className="risk-field">
        Max Slippage (bps)
        <input
          type="number"
          value={maxSlippageBps}
          min={1}
          step={1}
          onChange={(event) => setMaxSlippageBps(Number(event.target.value))}
        />
      </label>

      <label className="risk-field">
        Min Interval (ms)
        <input
          type="number"
          value={minIntervalMs}
          min={0}
          step={1000}
          onChange={(event) => setMinIntervalMs(Number(event.target.value))}
        />
      </label>

      <label className="risk-field">
        Max Consecutive Failures
        <input
          type="number"
          value={maxConsecutiveFailures}
          min={1}
          step={1}
          onChange={(event) =>
            setMaxConsecutiveFailures(Number(event.target.value))
          }
        />
      </label>

      <label className="risk-field">
        Allowed Protocols
        <input
          type="text"
          value={allowedProtocols}
          onChange={(event) => setAllowedProtocols(event.target.value)}
        />
      </label>

      <button type="button" className="small-action" onClick={updateRisk}>
        Update Risk
      </button>
    </div>
  );
}
