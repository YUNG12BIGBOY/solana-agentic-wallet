# Reproducibility Guide

This guide explains how to reproduce AI agent decisions and trade simulations on Solana devnet.

## Prerequisites

1. **Environment Setup**
   - Node.js 18+ installed
   - Backend dependencies: `cd backend/src && npm install`
   - Frontend dependencies: `cd frontend && npm install`

2. **Devnet Configuration**
   - Copy `.env.example` to `.env` in `backend/src/`
   - Ensure `RPC_URL=https://api.devnet.solana.com`
   - Ensure `SOLANA_CLUSTER=devnet`
   - Ensure `JUPITER_EXECUTION_RPC_URL=https://api.devnet.solana.com`
   - Set `SANDBOX_DEVNET_ONLY=true` (enforced at startup)

3. **Wallet Funding**
   - Start backend: `cd backend/src && npm run dev`
   - Use `POST /wallet/airdrop` to fund wallets with devnet SOL
   - Or manually transfer SOL from faucet: https://faucet.solana.com

## Reproducing Deterministic Intent Decisions

The agent uses deterministic logic that produces reproducible intents for the same inputs.

### Step 1: Start Backend

```bash
cd backend/src
npm run dev
```

### Step 2: Initialize Agent Wallets

```bash
# Start agent (creates wallets on first run)
curl -X POST http://localhost:4000/agent/start
```

This creates:
- Treasury Agent wallet
- Trader Agent wallet
- Liquidity Agent wallet (if configured)
- Arbitrage Agent wallet (if configured)

### Step 3: Fund Trader Wallet

```bash
# Get trader wallet public key
curl http://localhost:4000/agent/status | jq '.topology.traderWalletPublicKey'

# Fund via airdrop (or use Solana faucet)
curl -X POST http://localhost:4000/wallet/airdrop \
  -H "Content-Type: application/json" \
  -d '{"publicKey": "YOUR_TRADER_WALLET_PUBKEY"}'
```

### Step 4: Run Single Cycle

```bash
# Execute one deterministic cycle
curl -X POST http://localhost:4000/agent/run
```

**Response includes:**
- `lastIntent`: Deterministic intent (action, direction, amountPct, confidence, reason)
- `lastDecision`: Mapped trading decision (protocol, amounts, mints)
- `lastTxSignature`: Transaction signature if swap executed

### Step 5: Inspect Intent Context

The intent is computed from:
- Current SOL/USDC balances
- SOL price estimate
- Last trade timestamp
- Daily trade count
- Success rate history

View current state:
```bash
curl http://localhost:4000/agent/status | jq '.jupiterSwapStats'
```

## Reproducing Swap Simulations

### Simulate Swap Without Execution

```bash
curl -X POST http://localhost:4000/jupiter/simulate \
  -H "Content-Type: application/json" \
  -d '{
    "walletPublicKey": "YOUR_WALLET_PUBKEY",
    "inputMint": "So11111111111111111111111111111111111111112",
    "outputMint": "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
    "amountSol": 0.1,
    "slippageBps": 100,
    "reasoningReference": "Test simulation"
  }'
```

**Response:**
```json
{
  "success": true,
  "simulatedOutput": 12345678,
  "computeUnits": 150000,
  "logs": ["Program log: ..."],
  "route": ["Raydium", "Orca"],
  "inAmount": 100000000,
  "outAmount": 12345678,
  "slippageBps": 100,
  "quote": { ... }
}
```

### Dry-Run: Prepare Signed Transaction Without Broadcast

```bash
curl -X POST http://localhost:4000/jupiter/swap \
  -H "Content-Type: application/json" \
  -d '{
    "walletPublicKey": "YOUR_WALLET_PUBKEY",
    "inputMint": "So11111111111111111111111111111111111111112",
    "outputMint": "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
    "amountSol": 0.1,
    "slippageBps": 100,
    "dryRun": true,
    "reasoningReference": "Dry run test"
  }'
```

**Response includes:**
- `signedTransactionBase64`: Signed transaction ready for broadcast
- `route`, `inAmount`, `outAmount`: Swap details
- No `signature` or `explorerUrl` (not broadcast)

## Reproducing Manual SPL Swaps

### Execute Manual Swap

```bash
curl -X POST http://localhost:4000/jupiter/swap \
  -H "Content-Type: application/json" \
  -d '{
    "walletPublicKey": "YOUR_WALLET_PUBKEY",
    "inputMint": "So11111111111111111111111111111111111111112",
    "outputMint": "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
    "amountSol": 0.1,
    "slippageBps": 100,
    "reasoningReference": "Manual swap test"
  }'
```

**Response:**
```json
{
  "signature": "5j7s8...",
  "explorerUrl": "https://explorer.solana.com/tx/5j7s8...?cluster=devnet",
  "route": ["Raydium"],
  "inAmount": 100000000,
  "outAmount": 12345678,
  "slippageBps": 100,
  "quote": { ... }
}
```

## Inspecting Logs

### View Structured Logs

```bash
curl http://localhost:4000/logs?limit=50
```

**Log entries include:**
- `agent`: "Trader Agent", "Manual", etc.
- `source`: "ai" or "manual"
- `action`: "SPL_SWAP", "SIMULATE_SWAP", etc.
- `inputMint`, `outputMint`: Token addresses
- `inAmount`, `outAmount`: Swap amounts
- `confidence`, `reason`: AI reasoning
- `txSignature`: Transaction signature if executed

### Filter by Source

```bash
# AI-initiated trades
curl http://localhost:4000/logs | jq '.transactions[] | select(.source == "ai")'

# Manual trades
curl http://localhost:4000/logs | jq '.transactions[] | select(.source == "manual")'
```

## Example: Full Autonomous Cycle

```bash
# 1. Start backend and frontend
cd backend/src && npm run dev &
cd frontend && npm run dev &

# 2. Initialize agent (creates wallets)
curl -X POST http://localhost:4000/agent/start

# 3. Fund trader wallet
TRADER_PK=$(curl -s http://localhost:4000/agent/status | jq -r '.topology.traderWalletPublicKey')
curl -X POST http://localhost:4000/wallet/airdrop \
  -H "Content-Type: application/json" \
  -d "{\"publicKey\": \"$TRADER_PK\"}"

# 4. Run autonomous cycle
curl -X POST http://localhost:4000/agent/run

# 5. Check logs
curl http://localhost:4000/logs | jq '.transactions[-5:]'
```

## Reproducing with Fixed Inputs

For deterministic testing, you can:
1. Set fixed balances (transfer exact amounts)
2. Set fixed SOL price (modify `estimateSolPriceUsdc()` temporarily)
3. Clear trade history (reset `runtime.swapStats`)

The deterministic intent logic will produce identical outputs for identical inputs.

## Troubleshooting

- **"Insufficient SOL balance"**: Fund wallet via airdrop or faucet
- **"Governor rejected swap"**: Check min SOL reserve, daily limits, slippage thresholds
- **"Swap simulation failed"**: Check Jupiter API availability, token mint addresses
- **"No active wallet"**: Ensure wallet exists and is set as active

## Network Verification

Verify devnet-only execution:
```bash
curl http://localhost:4000/health
```

Response should show:
```json
{
  "ok": true,
  "cluster": "devnet",
  "rpcUrl": "https://api.devnet.solana.com",
  "jupiterEnabled": true
}
```

If `SANDBOX_DEVNET_ONLY=true`, startup will fail if RPC URLs are not devnet.
