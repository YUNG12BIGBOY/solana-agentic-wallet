# Agent Skills Matrix

## Autonomous Trading Skill

- Evaluates market context with an LLM
- Produces strict JSON decisions
- Executes only after risk approval
- Supports deterministic rebalance intent generation (`SWAP` / `HOLD`)
- Exposes advisory-only recommendations without transaction execution

### Agent Logic & Intent Computation

The autonomous trading agent uses deterministic intent logic (`backend/src/agent/jupiterDecisionLogic.ts`) to compute swap decisions:

**Inputs:**
- SOL balance, USDC balance, SPL token balances
- SOL price in USDC (estimated from market data)
- Last trade timestamp (for cooldown enforcement)
- Daily trade count (for rate limiting)
- Historical success rate and consecutive failures
- Estimated slippage from Jupiter quote API

**Intent Output Structure:**
```typescript
{
  action: "SWAP" | "HOLD",
  direction?: "SOL_TO_USDC" | "USDC_TO_SOL" | "SPL1_TO_SPL2",
  amountPct: number,  // Percentage of portfolio to swap (0-1)
  confidence: number, // Confidence score (0-100)
  reason: string      // Human-readable explanation
}
```

**Decision Logic:**
1. **Portfolio Allocation Analysis**: Compares current SOL allocation ratio vs target (`TARGET_SOL_ALLOCATION_RATIO`, default 0.55)
2. **Drift Detection**: If allocation drift exceeds threshold (`ALLOCATION_DRIFT_THRESHOLD`, default 0.08), generates swap intent
3. **Cooldown Enforcement**: Blocks swaps if within cooldown window (`JUPITER_COOLDOWN_MS`, default 5 minutes)
4. **Daily Limits**: Blocks swaps if daily swap count exceeds limit (`JUPITER_MAX_DAILY_SWAPS`, default 20)
5. **Confidence Scoring**: Factors in consecutive failures, success rate, and allocation drift magnitude

**Execution Flow:**
1. Build intent context (balances, prices, history)
2. Compute deterministic intent via `decideJupiterIntent()`
3. Map intent to trading decision (protocol, amounts, mints)
4. Validate through Jupiter Governor (min SOL reserve, max swap %, slippage threshold, risk score)
5. Validate through Risk Engine (max trade size, max slippage, rate limit, circuit breaker)
6. Execute swap via JupiterSwapModule (quote → unsigned tx → sign → broadcast)
7. Log structured event with agent, source, action, tokens, amounts, reasoning

## Wallet Custody Skill

- Creates Solana wallets
- Encrypts and persists keys
- Loads signers only for execution

### Wallet Creation & Agent Binding

**Wallet Creation:**
- Wallets are created programmatically via `walletManager.createWallet(label)` using `Keypair.generate()`
- Each wallet's secret key is encrypted with AES-256-GCM and stored in `backend/data/wallet-store.json`
- Wallets are identified by label (e.g., "Treasury Agent", "Trader Agent") and public key

**Agent-Wallet Topology:**
The system maintains a fixed multi-agent topology:
- **Treasury Agent**: Holds reserve funds and manages SPL token distribution
- **Trader Agent**: Executes Jupiter swaps based on deterministic intent
- **Liquidity Agent**: Manages liquidity operations (optional)
- **Arbitrage Agent**: Performs arbitrage operations (optional)

Wallets are created on-demand via `ensureWalletByLabel()` when agents first run. Each agent role has a dedicated wallet that never exposes private keys to agent logic.

**Signing Flow:**
1. Agent logic computes swap intent and calls `JupiterSwapModule.executeSwap(walletPublicKey)`
2. Jupiter module fetches quote and builds unsigned transaction from Jupiter API
3. Wallet engine (`walletEngine.signUnsignedVersionedTransaction()`) loads signer:
   - Resolves wallet record from keystore by public key
   - Decrypts encrypted secret key (only at signing time)
   - Builds Keypair and signs transaction
4. Signed transaction is broadcast via `broadcastSignedVersionedTransaction()`
5. Agent logic never touches private keys; signing is isolated in wallet engine

**Security Guarantees:**
- Private keys are encrypted at rest (AES-256-GCM with IV + auth tag)
- Keys are only decrypted in `walletManager.resolveSigner()` during signing
- Frontend never receives private keys or raw secrets
- Protocol modules (Jupiter, SPL) never have key access; they only request signing by public key

## Risk Governance Skill

- Enforces configurable policy
- Tracks runtime failures
- Opens circuit breaker on repeated faults

## Protocol Execution Skill

- Jupiter quote + swap execution
- SOL transfers
- SPL token transfers
- Explorer URL tracing
- Unsigned versioned transaction signing via isolated wallet engine
- **Swap simulation** via `connection.simulateTransaction()` (devnet-only, no broadcast)
- **Dry-run mode** for signed transaction preparation without broadcast

### Swap Simulation

The system supports true transaction simulation via `POST /jupiter/simulate`:
- Fetches Jupiter quote for given input/output tokens and amount
- Builds unsigned transaction from Jupiter swap API
- Calls Solana RPC `simulateTransaction()` to preview execution
- Returns simulated output amount, compute units, logs, and route information
- Useful for testing swap outcomes before execution

### Dry-Run Mode

Swap execution supports `dryRun: true` parameter:
- Builds and signs transaction normally
- Returns signed transaction (base64) without broadcasting
- Allows inspection of signed transaction before on-chain execution
- Logs indicate "dry run" status

## Multi-Agent Economy Skill

- Maintains Treasury / Trader / Liquidity / Arbitrage wallet topology
- Initializes AGENT mint and token accounts on devnet
- Transfers and mints AGENT rewards based on runtime behavior

## Observability Skill

- Streams structured execution logs
- Supports snapshot replay on reconnect
- Exposes tx links and failure reasons

## Operator Control Skill

- Start/pause continuous loop
- Run one-shot cycle
- Update risk settings in runtime
- Reset circuit breaker when needed
