import React, { useState } from "react";
import { fetchJupiterQuote } from "../../services/agentService";

export default function JupiterPreview() {
  const [quote, setQuote] = useState<string>("");

  const fetchQuote = async () => {
    const data = await fetchJupiterQuote();
    const outAmount = Number(data.outAmount ?? 0) / 1_000_000;
    setQuote(`${outAmount.toFixed(2)} USDC for 1 SOL`);
  };

  return (
    <div className="protocol-item">
      <h3>Jupiter Swap Preview</h3>
      <button type="button" className="small-action" onClick={fetchQuote}>
        Preview Swap
      </button>

      {quote && (
        <p className="protocol-hint">{quote}</p>
      )}
    </div>
  );
}
