# AI Agentic Wallet (Solana Agentic Execution Engine)

Production-structured autonomous AI wallet that can create wallets, evaluate AI trade decisions, enforce risk policy, sign transactions, interact with DeFi protocols, and stream real-time execution logs to a React dashboard.

Step 1: Clone the repo

Open a terminal (Command Prompt, PowerShell, or Git Bash):

git clone https://github.com/YUNG12BIGBOY/solana-agentic-wallet.git
cd solana-agentic-wallet

✅ This downloads the full repo and moves you into the project folder.

Step 2: Set up the backend
2.1 Navigate to the backend folder
cd backend/src

Here is where all backend source code lives.

2.2 Copy the example .env

Windows:

copy .env.example .env

Mac/Linux:

cp .env.example .env

This creates a .env file that the server reads for configuration.

You don’t need to modify it for devnet testing. The defaults are safe for demo purposes.

2.3 Install dependencies
npm install

This installs all required packages like @solana/web3.js, express, etc.

2.4 Start the backend
npm run dev

The server should start and print something like:

Backend running at http://localhost:4000

✅ Your backend is now live locally.

Frontend Setup: Step-by-Step
Step 1: Navigate to the frontend folder

After cloning your repo:

cd solana-agentic-wallet/frontend

This is where all the frontend code lives (package.json, vite.config.ts, src/, etc.)

Step 2: Install dependencies
npm install

This installs Vite, React, and all other required packages.

Watch for any warnings; most are harmless (like optional funding notices).

Step 3: Connect frontend to backend (optional)

The frontend uses an environment variable VITE_API_URL to know where your backend is.

If you have the backend running locally on http://localhost:4000:

Windows (Command Prompt):

set VITE_API_URL=http://localhost:4000 && npm run dev

Windows (PowerShell):

$env:VITE_API_URL="http://localhost:4000"; npm run dev

Mac/Linux:

VITE_API_URL=http://localhost:4000 npm run dev

If you don’t want backend (just to show UI), you can leave VITE_API_URL unset.

The UI will still render all panels, sidebar, and layout, but API calls will fail (this is fine for demo-only purposes).

Step 4: Run the dev server
npm run dev

Vite will compile and serve your frontend.

Output will look like:

  Local:   http://localhost:5173/
  Network: use --host to expose
Step 5: Open the UI in a browser

Go to http://localhost:5173/

## Core Capabilities

- Programmatic wallet creation and switching
- Wallet labels with optional custom naming and automatic uniqueness (`Wallet #N`)
- Encrypted private-key custody (AES-256-GCM) with persisted keystore
- Autonomous agent execution loop (single-run or continuous)
- Deterministic Jupiter intent logic (allocation drift + cooldown + confidence scoring)
- Optional AI trade advisory endpoint (advisory-only, no signing/broadcast)
- Risk engine with:
  - max trade size
  - max slippage
  - rate limit
  - protocol allowlist
  - circuit breaker
- Jupiter governor checks:
  - min SOL reserve
  - max swap percentage
  - daily swap cap
  - slippage threshold
  - risk score threshold
- Protocol abstraction for:
  - Jupiter swap quote/execute adapter with unsigned->signed wallet engine flow
  - SOL transfer
  - SPL token transfer
  - autonomous AGENT SPL token economy (mint, distribute, transfer, balances)
- WebSocket log stream with tx signatures + explorer links
- Transaction history endpoint backed by structured execution logs
- React dashboard for control and observability

## Architecture

- `backend/src`: secure execution layer (wallet, risk, decisions, protocols, APIs)
- `frontend/src`: control plane + live observability UI

Key backend modules:

- `backend/src/wallet/walletManager.ts`
- `backend/src/agent/agentEngine.ts`
- `backend/src/agent/riskEngine.ts`
- `backend/src/agent/jupiterDecisionLogic.ts`
- `backend/src/agent/jupiterGovernor.ts`
- `backend/src/agent/splEconomyEngine.ts`
- `backend/src/protocols/execution.ts`
- `backend/src/protocols/jupiterSwapModule.ts`
- `backend/src/protocols/splTokenModule.ts`
- `backend/src/wallet/walletEngine.ts`
- `backend/src/websocket.ts`

## Quick Start

### 1. Backend

```powershell
cd c:\..\..\backend\src
copy .env.example .env
npm.cmd install
npm.cmd run dev
```

### 2. Frontend

```powershell
cd c:\..\..\frontend
npm.cmd install
npm.cmd run dev
```

Open `http://localhost:5173`.

## Environment (`backend/src/.env`)

Required for production-grade use:

```env
PORT=4000
RPC_URL=https://api.devnet.solana.com
SOLANA_CLUSTER=devnet
ENABLE_JUPITER_SWAP=true
JUPITER_EXECUTION_RPC_URL=https://api.devnet.solana.com
SANDBOX_DEVNET_ONLY=true
ENCRYPTION_SECRET=change-this-to-a-strong-secret
OPENAI_KEY=
OPENAI_MODEL=gpt-4o-mini
AGENT_LOOP_MS=30000
ENABLE_LIVE_TRADES=false
DEFAULT_RECIPIENT=
USDC_MINT=EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v
JUPITER_QUOTE_API=https://lite-api.jup.ag/swap/v1
TARGET_SOL_ALLOCATION_RATIO=0.55
ALLOCATION_DRIFT_THRESHOLD=0.08
JUPITER_COOLDOWN_MS=300000
JUPITER_MAX_SWAP_PCT=0.25
JUPITER_MIN_SOL_RESERVE=0.05
JUPITER_MAX_DAILY_SWAPS=20
JUPITER_RISK_SCORE_THRESHOLD=70
AGENT_TOKEN_SYMBOL=AGENT
AGENT_INITIAL_SUPPLY=1000000
AGENT_TOKEN_DECIMALS=6
AGENT_REDISTRIBUTION_THRESHOLD=50000
AGENT_ACTIVITY_MINT_THRESHOLD=5
AGENT_REWARD_MINT_AMOUNT=5000
```

## API Overview

- `GET /health`
- `POST /wallet/create`
- `POST /wallet/delete`
- `GET /wallet`
- `GET /wallets` (alias)
- `POST /wallet/switch`
- `GET /wallet/receive`
- `GET /wallet/receive-spl?mint=<MINT>&prepare=<true|false>`
- `POST /wallet/airdrop`
- `POST /wallet/transfer-sol`
- `POST /wallet/transfer-spl`
- `GET /wallet/tokens`
- `POST /wallet/mint-test-token`
- `GET /agent/status`
- `GET /agents/status` (alias)
- `POST /agent/start`
- `POST /agent/pause`
- `POST /agent/run`
- `POST /agent/execute`
- `POST /agent/simulate`
- `GET /agent/advisor`
- `GET /agents/advisor` (alias)
- `GET /risk`
- `POST /risk/update`
- `POST /risk/reset-circuit-breaker`
- `GET /jupiter/quote`
- `POST /jupiter/simulate` - Simulate swap transaction without broadcasting (devnet-only)
- `POST /jupiter/swap` - Execute swap (supports `dryRun: true` for signed tx without broadcast)
- `POST /spl/initialize`
- `GET /spl/status`
- `GET /spl/balances`
- `POST /spl/transfer`
- `GET /logs` - Structured logs with agent, source, action, tokens, amounts, reasoning
- `GET /transactions` - Transaction history filtered from logs

## Enhanced Structured Logging

All trade and swap actions emit structured logs with:
- `agent`: Agent role (e.g., "Trader Agent", "Manual")
- `source`: "ai" or "manual"
- `action`: Action type (e.g., "SPL_SWAP", "SIMULATE_SWAP")
- `inputMint`, `outputMint`: Token addresses
- `inAmount`, `outAmount`: Swap amounts
- `confidence`, `reason`: AI reasoning (for AI-initiated trades)
- `txSignature`, `explorerUrl`: Transaction details (if executed)

Logs are streamed via WebSocket (`log` event) and available via `GET /logs`.

## Swap Simulation & Dry-Run

**Simulation (`POST /jupiter/simulate`):**
- Fetches Jupiter quote and builds unsigned transaction
- Simulates transaction via Solana RPC `simulateTransaction()`
- Returns simulated output, compute units, and logs
- Does not sign or broadcast (devnet-only)

**Dry-Run (`POST /jupiter/swap` with `dryRun: true`):**
- Builds and signs transaction normally
- Returns signed transaction (base64) without broadcasting
- Useful for inspection before on-chain execution

## Security Notes

- Private keys are encrypted at rest (AES-256-GCM) and never sent to frontend.
- Decision outputs are validated against a strict schema before execution.
- All non-hold actions pass through risk policy checks.
- Circuit breaker opens automatically after repeated execution failures.
- Signing is isolated in wallet engine; agent logic never touches private keys.

## Production Considerations

- Move keystore to KMS/HSM-backed storage.
- Add authenticated API gateway and RBAC.
- Add persistent metrics + alerting.
- Add deterministic strategy sandbox tests before enabling live trades.

## Network Notes

- Default wallet profile is `devnet`.
- `RPC_URL` can target `devnet`, `testnet`, or `mainnet-beta`.
- Set `SOLANA_CLUSTER` to match the selected RPC network for correct explorer links.
- Jupiter execution adapter broadcasts through `JUPITER_EXECUTION_RPC_URL` (devnet by default).
- `ENABLE_JUPITER_SWAP` defaults to `true` outside testnet profile and can be explicitly overridden.
- `SANDBOX_DEVNET_ONLY=true` enforces devnet-only startup for wallet and Jupiter execution RPCs.
- The wallet can hold and transfer arbitrary SPL mints on the selected cluster.
