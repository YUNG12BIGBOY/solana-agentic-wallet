# Deep Dive: Agentic Execution System

## 1. Secure Wallet Custody

- Wallets are generated with `@solana/web3.js` keypairs.
- Secret keys are serialized to base64 and encrypted with AES-256-GCM.
- Encrypted payloads are persisted in `backend/src/data/wallet-store.json`.
- Decryption occurs only in execution paths requiring signing.
- Frontend receives only wallet metadata and balances.

## 2. Agent Decision Contract

Primary execution logic is deterministic in `backend/src/agent/jupiterDecisionLogic.ts`:

- Inputs:
  - SOL balance
  - USDC balance
  - allocation ratio vs target
  - last trade timestamp
  - daily trade count
  - historical success/failure performance
- Output intent:
  - `action`: `SWAP | HOLD`
  - `direction`: `SOL_TO_USDC | USDC_TO_SOL`
  - `amountPct`
  - `confidence`
  - `reason`

An LLM reference path still exists for simulation comparison only and is not trusted for execution.

## 3. Risk Engine

`backend/src/agent/riskEngine.ts` gates all executable decisions:

- `maxTradeSizeSol`
- `maxSlippageBps`
- `minIntervalMs` (rate limiting)
- `maxConsecutiveFailures`
- `allowedProtocols`

Runtime state tracks:

- consecutive failures
- last execution timestamp
- last error
- circuit breaker status

No transaction is signed if policy validation fails.

`backend/src/agent/jupiterGovernor.ts` adds Jupiter-specific controls before swap broadcast:

- min SOL reserve
- max percentage per swap
- max daily swap count
- slippage threshold
- risk score threshold

## 4. Protocol Abstraction

`backend/src/protocols/execution.ts` isolates execution intent from strategy logic.

Supported protocol actions:

- Jupiter swap adapter (`backend/src/protocols/jupiterSwapModule.ts`)
- SOL transfer
- SPL transfer
- AGENT token mint/distribution/transfer (`backend/src/protocols/splTokenModule.ts`)
- HOLD (no-op)

This abstraction allows the agent loop to reason at policy level, not instruction level.

Wallet signing separation:

- `backend/src/wallet/walletEngine.ts` signs unsigned transaction payloads.
- Jupiter module never stores keys and never decides strategy.

## 5. Autonomous Loop

`backend/src/agent/agentEngine.ts` manages:

- single-cycle execution (`POST /agent/run`)
- continuous mode (`POST /agent/start`)
- pause (`POST /agent/pause`)

Execution chain:

1. collect market + wallet context
2. compute deterministic swap/hold intent
3. enforce risk + Jupiter governor checks
4. execute Jupiter adapter (quote -> unsigned tx -> wallet sign -> broadcast)
5. run SPL reward/redistribution behaviors
6. confirm tx
7. emit structured logs
8. update status snapshot

## 6. Real-time Observability

`backend/src/websocket.ts` emits structured events:

- `timestamp`
- `level`
- `message`
- optional `txSignature` + `explorerUrl`

Clients receive:

- live `log` events
- `logs:snapshot` on connect

The UI renders event stream and transaction links.

## 7. API Control Plane

The frontend controls execution exclusively through REST/WebSocket.

No signing occurs client-side.

Endpoints exposed for:

- wallet lifecycle
- risk updates
- agent lifecycle
- protocol preview/execution
- token inventory (`GET /wallet/tokens`)
- sandbox mint provisioning (`POST /wallet/mint-test-token`)
- AGENT economy initialization and transfers (`/spl/*`)
- advisory recommendations (`GET /agent/advisor` or `GET /agents/advisor`)
- transaction history (`GET /transactions`)

Cluster handling:

- default RPC profile is devnet
- RPC endpoint is configurable (`RPC_URL`)
- explorer links are cluster-aware (`SOLANA_CLUSTER`)
- Jupiter adapter execution RPC is configurable (`JUPITER_EXECUTION_RPC_URL`, devnet default)
- Jupiter can be explicitly toggled (`ENABLE_JUPITER_SWAP`)
- the same execution engine can run on devnet, testnet, or mainnet-beta

## 8. Safety Boundary

The LLM is not trusted executor logic in live cycles.

Execution is constrained by:

- deterministic intent policy
- risk policy gate
- Jupiter governor gate
- protocol allowlist
- circuit breaker
- explicit transaction confirmation

This preserves autonomous behavior while preventing uncontrolled execution.
