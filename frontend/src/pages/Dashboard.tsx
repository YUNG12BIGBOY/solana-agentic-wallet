import React, { useEffect, useMemo, useRef, useState } from "react";
import { socket } from "../config/socket";
import Header from "../components/layout/Header";
import Sidebar from "../components/layout/Sidebar";
import LogsPanel from "../components/logs/LogsPanel";
import WalletSelector from "../components/wallet/WalletSelector";
import RiskControls from "../components/agents/RiskControls";
import AgentCard from "../components/agents/AgentCard";
import ActivityChart from "../components/analytics/ActivityChart";
import { useApp } from "../context/AppContext";
import {
  airdropSol,
  createWallet,
  deleteWallet,
  fetchActiveTokenBalances,
  fetchReceiveInfo,
  fetchReceiveSplInfo,
  fetchWalletState,
  mintTestToken,
  sendTokens,
  switchWallet,
  transferSol,
} from "../services/walletService";
import {
  executeTrade,
  fetchAgentStatus,
  fetchJupiterQuote,
  fetchRiskStatus,
  fetchTradeAdvisory,
  pauseAgent,
  resetCircuitBreaker,
  runAgent,
  runSimulation,
  simulateJupiterSwap,
  startAgent,
  updateRiskSettings,
} from "../services/agentService";
import { fetchSystemHealth } from "../services/systemService";
import { fetchLogs } from "../services/logService";
import {
  fetchSplBalances,
  fetchSplState,
  initializeSplEconomy,
} from "../services/splService";
import {
  AgentStatus,
  LogEvent,
  RiskSettings,
  SplModuleBalances,
  SplModuleState,
  SystemHealth,
  TradeAdvisory,
  TokenBalance,
  WalletSplReceiveInfo,
  WalletState,
} from "../types";
import tradingIcon from "../assets/icons/agent-trading.svg";
import liquidityIcon from "../assets/icons/agent-liquidity.svg";
import arbitrageIcon from "../assets/icons/agent-arbitrage.svg";

const PAGE_VIEWS = [
  "Dashboard",
  "Wallets",
  "Agents & Wallets",
  "Agent Control",
  "Transaction History",
  "Settings",
  "Logs",
] as const;

type PageView = (typeof PAGE_VIEWS)[number];

const initialWalletState: WalletState = { wallets: [], activeWallet: null };
const initialRisk: RiskSettings = {
  maxTradeSizeSol: 0.5,
  maxSlippageBps: 100,
  minIntervalMs: 10_000,
  maxConsecutiveFailures: 3,
  allowedProtocols: ["hold", "sol_transfer", "spl_transfer"],
};

const toErrorMessage = (error: unknown) => {
  if (typeof error === "object" && error !== null) {
    const candidate = error as { response?: { data?: { error?: string } }; message?: string };
    return candidate.response?.data?.error ?? candidate.message ?? "Unexpected request failure";
  }
  return String(error);
};

const isPageView = (value: string): value is PageView =>
  PAGE_VIEWS.includes(value as PageView);

export default function Dashboard() {
  const { logs, addLog, setLogs } = useApp();
  const bootstrappedRef = useRef(false);
  const [activeView, setActiveView] = useState<PageView>("Dashboard");
  const [walletState, setWalletState] = useState<WalletState>(initialWalletState);
  const [agentStatus, setAgentStatus] = useState<AgentStatus | null>(null);
  const [riskSettings, setRiskSettings] = useState<RiskSettings>(initialRisk);
  const [network, setNetwork] = useState<SystemHealth | null>(null);
  const [tradeAdvisory, setTradeAdvisory] = useState<TradeAdvisory | null>(null);
  const [splState, setSplState] = useState<SplModuleState | null>(null);
  const [splBalances, setSplBalances] = useState<SplModuleBalances>({
    mintAddress: null,
    balances: [],
  });
  const [activeTokens, setActiveTokens] = useState<TokenBalance[]>([]);
  const [receiveInfo, setReceiveInfo] = useState<{
    publicKey: string;
    explorerUrl: string;
  } | null>(null);
  const [receiveSplMint, setReceiveSplMint] = useState("");
  const [receiveSplInfo, setReceiveSplInfo] = useState<WalletSplReceiveInfo | null>(null);
  const [transferRecipient, setTransferRecipient] = useState("");
  const [newWalletLabel, setNewWalletLabel] = useState("");
  const [transferMint, setTransferMint] = useState("");
  const [transferAmount, setTransferAmount] = useState(0.5);
  const [solTransferAmount, setSolTransferAmount] = useState(0.01);
  const [mintAmount, setMintAmount] = useState(1000);
  const [mintDecimals, setMintDecimals] = useState(6);
  const [quoteInputMint, setQuoteInputMint] = useState(
    "So11111111111111111111111111111111111111112"
  );
  const [quoteOutputMint, setQuoteOutputMint] = useState(
    "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"
  );
  const [quoteHint, setQuoteHint] = useState("");
  const [simulationResult, setSimulationResult] = useState<any>(null);
  const [error, setError] = useState("");
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const safeCall = async (actionName: string, callback: () => Promise<void>) => {
    try {
      setBusyAction(actionName);
      setError("");
      await callback();
    } catch (err) {
      setError(toErrorMessage(err));
    } finally {
      setBusyAction(null);
    }
  };

  const syncLogs = async () => {
    setLogs(await fetchLogs().catch(() => []));
  };

  const syncWalletState = async () => {
    const state = await fetchWalletState();
    if (state.wallets.length === 0) {
      await createWallet("Agent Wallet");
      const refreshed = await fetchWalletState();
      setWalletState(refreshed);
      return;
    }

    setWalletState(state);
    setActiveTokens(await fetchActiveTokenBalances().catch(() => []));
  };

  const syncReceiveInfo = async () => {
    setReceiveInfo(await fetchReceiveInfo().catch(() => null));
  };

  const syncReceiveSplInfo = async (mintOverride?: string, prepare = false) => {
    const mint = (mintOverride ?? receiveSplMint).trim();
    if (!mint) {
      setReceiveSplInfo(null);
      return;
    }

    setReceiveSplInfo(await fetchReceiveSplInfo(mint, prepare).catch(() => null));
  };

  const syncAgentStatus = async () => setAgentStatus(await fetchAgentStatus());
  const syncRiskSettings = async () => setRiskSettings((await fetchRiskStatus()).settings);
  const syncNetwork = async () => setNetwork(await fetchSystemHealth());
  const syncTradeAdvisory = async () =>
    setTradeAdvisory(await fetchTradeAdvisory().catch(() => null));
  const syncSplModule = async () => {
    const [state, balances] = await Promise.all([
      fetchSplState().catch(() => null),
      fetchSplBalances().catch(() => ({ mintAddress: null, balances: [] })),
    ]);
    setSplState(state);
    setSplBalances(balances);
  };

  useEffect(() => {
    if (bootstrappedRef.current) return;
    bootstrappedRef.current = true;
    safeCall("bootstrap", async () => {
      await Promise.all([
        syncWalletState(),
        syncReceiveInfo(),
        syncAgentStatus(),
        syncRiskSettings(),
        syncNetwork(),
        syncTradeAdvisory(),
        syncSplModule(),
        syncLogs(),
      ]);
    });
  }, []);

  useEffect(() => {
    const onLog = (event: LogEvent) => addLog(event);
    const onSnapshot = (events: LogEvent[]) => setLogs(events);
    socket.on("log", onLog);
    socket.on("logs:snapshot", onSnapshot);
    return () => {
      socket.off("log", onLog);
      socket.off("logs:snapshot", onSnapshot);
    };
  }, [addLog, setLogs]);

  useEffect(() => {
    if (walletState.activeWallet?.publicKey) {
      setTransferRecipient(walletState.activeWallet.publicKey);
    }
  }, [walletState.activeWallet?.publicKey]);

  useEffect(() => {
    if (walletState.activeWallet?.publicKey) {
      void syncReceiveInfo();
    }
  }, [walletState.activeWallet?.publicKey]);

  useEffect(() => {
    if (!transferMint && activeTokens[0]?.mint) {
      setTransferMint(activeTokens[0].mint);
    }

    if (!receiveSplMint && activeTokens[0]?.mint) {
      setReceiveSplMint(activeTokens[0].mint);
    }
  }, [activeTokens, transferMint, receiveSplMint]);

  useEffect(() => {
    if (!receiveSplMint) {
      setReceiveSplInfo(null);
      return;
    }

    void syncReceiveSplInfo(receiveSplMint);
  }, [receiveSplMint, walletState.activeWallet?.publicKey]);

  const running = agentStatus?.running ?? false;
  const lastIntent = agentStatus?.lastIntent ?? null;
  const jupiterSwapStats = agentStatus?.jupiterSwapStats ?? {
    lastSwapAt: null,
    successfulSwaps: 0,
    failedSwaps: 0,
    dailySwapCount: 0,
    dailyKey: "",
    consecutiveSwapFailures: 0,
  };
  const splEconomy = agentStatus?.splEconomy ?? {
    initialized: false,
    mintAddress: null,
    traderConsecutiveLosses: 0,
    traderActivityCount: 0,
    activity: {},
  };
  const topology = agentStatus?.topology ?? null;
  const txRows = useMemo(
    () => logs.filter((entry) => entry.txSignature || entry.explorerUrl).slice().reverse(),
    [logs]
  );
  const chartData = useMemo(
    () => [
      { label: "01", sol: 2.2, usdc: 1.8 },
      { label: "02", sol: 2.0, usdc: 1.5 },
      { label: "03", sol: 1.7, usdc: 1.55 },
      { label: "04", sol: 1.85, usdc: 1.52 },
      { label: "05", sol: 2.1, usdc: 1.82 },
      { label: "06", sol: 1.76, usdc: 1.48 },
      { label: "07", sol: 1.74, usdc: 1.31 },
      { label: "08", sol: 2.0, usdc: 1.68 },
      { label: "09", sol: 2.15, usdc: 1.8 },
      { label: "10", sol: 1.82, usdc: 1.57 },
      { label: "11", sol: 1.98, usdc: 1.45 },
      { label: "12", sol: 2.2, usdc: 1.34 },
    ],
    []
  );
  const agentCards = useMemo(
    () => [
      {
        title: "Trading Agent",
        subtitle: agentStatus?.lastAction ?? "Awaiting first cycle",
        icon: tradingIcon,
      },
      {
        title: "Liquidity Agent",
        subtitle: "Protocol intents enabled",
        icon: liquidityIcon,
      },
      {
        title: "Arbitrage Agent",
        subtitle: network?.jupiterEnabled ? "Jupiter available" : "Jupiter disabled",
        icon: arbitrageIcon,
      },
    ],
    [agentStatus?.lastAction, network?.jupiterEnabled]
  );
  const formatWhen = (timestamp: string) => new Date(timestamp).toLocaleString();
  const formatAddress = (value: string) =>
    `${value.slice(0, 8)}...${value.slice(-6)}`;
  const copyAddress = async (address: string) => {
    await navigator.clipboard.writeText(address);
    addLog(`Copied receive address: ${address.slice(0, 8)}...`);
  };
  const tokenMintOptions = useMemo(() => {
    const mints = new Set<string>();
    activeTokens.forEach((token) => mints.add(token.mint));
    if (transferMint.trim()) mints.add(transferMint.trim());
    if (receiveSplMint.trim()) mints.add(receiveSplMint.trim());
    return Array.from(mints);
  }, [activeTokens, transferMint, receiveSplMint]);

  const dashboardView = (
    <>
      <section className="main-section">
        <h2>Active Agents</h2>
        <div className="agent-grid">
          {agentCards.map((agent) => (
            <AgentCard
              key={agent.title}
              title={agent.title}
              subtitle={agent.subtitle}
              icon={agent.icon}
              running={running}
              onToggle={() =>
                safeCall("toggle-agent", async () => {
                  setAgentStatus(
                    running
                      ? await pauseAgent()
                      : await startAgent(agentStatus?.intervalMs ?? 30_000)
                  );
                  await syncTradeAdvisory();
                })
              }
              onLogs={() => setActiveView("Logs")}
            />
          ))}
        </div>
      </section>
      <section className="middle-layout">
        <ActivityChart data={chartData} />
        <section className="decision-card">
          <h2>AI Decision Output</h2>
          <div className="panel-divider" />
          <p>
            <strong>Action:</strong> {agentStatus?.lastDecision?.action ?? "HOLD"}{" "}
            {agentStatus?.lastDecision?.protocol ?? "hold"}
          </p>
          <p>
            <strong>Reason:</strong> "{agentStatus?.lastDecision?.reason ?? "No decision yet"}"
          </p>
          <button
            type="button"
            className="execute-button"
            onClick={() =>
              safeCall("execute", async () => {
                await executeTrade(agentStatus?.lastDecision?.amountSol ?? 0.1);
                await Promise.all([
                  syncAgentStatus(),
                  syncTradeAdvisory(),
                  syncWalletState(),
                  syncSplModule(),
                ]);
              })
            }
          >
            Execute Trade
          </button>
        </section>
      </section>
      <section className="settings-grid">
        <section className="panel-card">
          <h3>Jupiter Runtime</h3>
          <div className="panel-divider" />
          <p className="wallet-balance-inline">
            Last Intent: {lastIntent?.action ?? "N/A"} {lastIntent?.direction ?? ""}
          </p>
          <p className="wallet-balance-inline">
            Intent Confidence: {lastIntent?.confidence?.toFixed(2) ?? "0.00"}
          </p>
          <p className="wallet-balance-inline">
            Daily Swaps: {jupiterSwapStats.dailySwapCount}
          </p>
          <p className="wallet-balance-inline">
            Success/Fail: {jupiterSwapStats.successfulSwaps}/{jupiterSwapStats.failedSwaps}
          </p>
          <p className="wallet-balance-inline">
            Consecutive Failures: {jupiterSwapStats.consecutiveSwapFailures}
          </p>
          <p className="wallet-balance-inline">
            Last Swap:{" "}
            {jupiterSwapStats.lastSwapAt
              ? formatWhen(jupiterSwapStats.lastSwapAt)
              : "Never"}
          </p>
          <p className="wallet-balance-inline">
            Reason: {lastIntent?.reason ?? "No intent generated yet."}
          </p>
        </section>
        <section className="panel-card">
          <div className="logs-head">
            <h3>SPL Economy Runtime</h3>
            <button
              type="button"
              className="text-action"
              onClick={() => safeCall("refresh-spl-dashboard", syncSplModule)}
            >
              Refresh
            </button>
          </div>
          <div className="panel-divider" />
          <p className="wallet-balance-inline">
            Initialized: {splEconomy.initialized ? "Yes" : "No"}
          </p>
          <p className="wallet-balance-inline">
            Mint: {splState?.mint ? formatAddress(splState.mint) : "Not initialized"}
          </p>
          <p className="wallet-balance-inline">
            Trader Loss Streak: {splEconomy.traderConsecutiveLosses}
          </p>
          <p className="wallet-balance-inline">
            Trader Activity: {splEconomy.traderActivityCount}
          </p>
          <div className="action-row">
            <button
              type="button"
              className="small-action"
              onClick={() =>
                safeCall("init-spl-dashboard", async () => {
                  await initializeSplEconomy();
                  await Promise.all([syncSplModule(), syncAgentStatus()]);
                })
              }
            >
              Initialize SPL Economy
            </button>
          </div>
          <div className="token-list">
            <p className="token-list-title">AGENT Balances</p>
            {splBalances.balances.length === 0 ? (
              <p className="wallet-balance-inline">No AGENT balances yet.</p>
            ) : (
              splBalances.balances.map((row) => (
                <p key={row.walletPublicKey} className="token-row">
                  {formatAddress(row.walletPublicKey)} - {row.amount.toFixed(4)}
                </p>
              ))
            )}
          </div>
        </section>
      </section>
    </>
  );

  const walletsView = (
    <section className="settings-grid">
      <WalletSelector
        wallets={walletState.wallets}
        activeWallet={walletState.activeWallet}
        onSwitch={async (publicKey) =>
          safeCall("switch-wallet", async () => {
            await switchWallet(publicKey);
            await Promise.all([
              syncWalletState(),
              syncReceiveInfo(),
              syncReceiveSplInfo(),
              syncSplModule(),
            ]);
          })
        }
      />
      <section className="panel-card">
        <h3>Receive</h3>
        <div className="panel-divider" />
        <p className="wallet-balance-inline">
          Address: {receiveInfo?.publicKey ?? walletState.activeWallet?.publicKey ?? "N/A"}
        </p>
        <div className="action-row">
          <button
            type="button"
            className="small-action"
            onClick={() =>
              safeCall("copy-address", async () => {
                const address = receiveInfo?.publicKey ?? walletState.activeWallet?.publicKey;
                if (!address) throw new Error("No active wallet selected");
                await copyAddress(address);
              })
            }
          >
            Copy Address
          </button>
          {receiveInfo?.explorerUrl && (
            <a href={receiveInfo.explorerUrl} target="_blank" rel="noreferrer" className="log-link">
              View Explorer
            </a>
          )}
        </div>
      </section>
      <section className="panel-card">
        <h3>Wallet Actions</h3>
        <div className="panel-divider" />
        <label className="risk-field">
          New Wallet Name (optional)
          <input
            type="text"
            placeholder="e.g. Trading Vault"
            value={newWalletLabel}
            onChange={(event) => setNewWalletLabel(event.target.value)}
          />
        </label>
        <div className="action-row">
          <button
            type="button"
            className="small-action"
            onClick={() =>
              safeCall("create-wallet", async () => {
                await createWallet(newWalletLabel.trim() || undefined);
                setNewWalletLabel("");
                await Promise.all([
                  syncWalletState(),
                  syncReceiveInfo(),
                  syncReceiveSplInfo(),
                  syncSplModule(),
                ]);
              })
            }
          >
            Create Wallet
          </button>
          <button
            type="button"
            className="small-action muted"
            onClick={() =>
              safeCall("delete-wallet", async () => {
                const target = walletState.activeWallet?.publicKey;
                if (!target) throw new Error("No active wallet selected");
                await deleteWallet(target);
                await Promise.all([
                  syncWalletState(),
                  syncReceiveInfo(),
                  syncReceiveSplInfo(),
                  syncSplModule(),
                ]);
              })
            }
            disabled={
              !walletState.activeWallet ||
              walletState.wallets.length <= 1 ||
              busyAction !== null
            }
          >
            Delete Active Wallet
          </button>
          <button
            type="button"
            className="small-action muted"
            onClick={() =>
              safeCall("airdrop", async () => {
                await airdropSol(1);
                await syncWalletState();
              })
            }
          >
            Airdrop 1 SOL
          </button>
        </div>
        <label className="risk-field">
          Recipient
          <input
            type="text"
            value={transferRecipient}
            onChange={(event) => setTransferRecipient(event.target.value.trim())}
          />
        </label>
        <label className="risk-field">
          SOL Amount
          <input
            type="number"
            value={solTransferAmount}
            min={0.000001}
            step={0.000001}
            onChange={(event) => setSolTransferAmount(Number(event.target.value))}
          />
        </label>
        <div className="action-row">
          <button
            type="button"
            className="small-action"
            onClick={() =>
              safeCall("send-sol", async () => {
                await transferSol(transferRecipient, solTransferAmount);
                await Promise.all([syncWalletState(), syncSplModule()]);
              })
            }
          >
            Send SOL
          </button>
        </div>
      </section>
      <section className="panel-card">
        <h3>Token Operations</h3>
        <div className="panel-divider" />
        {tokenMintOptions.length > 0 && (
          <label className="risk-field">
            Known SPL Mints
            <select
              className="wallet-picker"
              value={transferMint}
              onChange={(event) => {
                const mint = event.target.value;
                setTransferMint(mint);
                if (!receiveSplMint) setReceiveSplMint(mint);
              }}
            >
              {tokenMintOptions.map((mint) => (
                <option key={mint} value={mint}>
                  {mint}
                </option>
              ))}
            </select>
          </label>
        )}
        <label className="risk-field">
          SPL Mint
          <input
            type="text"
            value={transferMint}
            onChange={(event) => setTransferMint(event.target.value.trim())}
          />
        </label>
        <label className="risk-field">
          SPL Amount
          <input
            type="number"
            value={transferAmount}
            min={0.000001}
            step={0.000001}
            onChange={(event) => setTransferAmount(Number(event.target.value))}
          />
        </label>
        <div className="action-row">
          <button
            type="button"
            className="small-action"
            onClick={() =>
              safeCall("send-spl", async () => {
                await sendTokens(transferMint, transferRecipient, transferAmount);
                await Promise.all([syncWalletState(), syncReceiveSplInfo(), syncSplModule()]);
              })
            }
          >
            Send SPL
          </button>
          <button
            type="button"
            className="small-action muted"
            onClick={() =>
              safeCall("mint-token", async () => {
                const minted = await mintTestToken(mintAmount, mintDecimals);
                setTransferMint(minted.mint);
                setReceiveSplMint(minted.mint);
                await Promise.all([
                  syncWalletState(),
                  syncReceiveSplInfo(minted.mint, true),
                  syncSplModule(),
                ]);
              })
            }
          >
            Mint Test Token
          </button>
        </div>
        <div className="mint-input-grid">
          <label className="risk-field">
            Mint Amount
            <input
              type="number"
              value={mintAmount}
              min={1}
              onChange={(event) => setMintAmount(Number(event.target.value))}
            />
          </label>
          <label className="risk-field">
            Mint Decimals
            <input
              type="number"
              value={mintDecimals}
              min={0}
              max={9}
              onChange={(event) => setMintDecimals(Number(event.target.value))}
            />
          </label>
        </div>
      </section>
      <section className="panel-card">
        <h3>Receive SPL Token</h3>
        <div className="panel-divider" />
        <label className="risk-field">
          Mint To Receive
          <input
            type="text"
            value={receiveSplMint}
            onChange={(event) => setReceiveSplMint(event.target.value.trim())}
          />
        </label>
        <div className="action-row">
          <button
            type="button"
            className="small-action"
            onClick={() => safeCall("load-receive-spl", async () => syncReceiveSplInfo())}
            disabled={!receiveSplMint}
          >
            Load Receive Account
          </button>
          <button
            type="button"
            className="small-action muted"
            onClick={() =>
              safeCall("prepare-receive-spl", async () => syncReceiveSplInfo(undefined, true))
            }
            disabled={!receiveSplMint}
          >
            Prepare Receive ATA
          </button>
        </div>
        {!receiveSplInfo ? (
          <p className="wallet-balance-inline">
            Enter SPL mint to load receive token account details.
          </p>
        ) : (
          <>
            <p className="wallet-balance-inline">
              Owner: {formatAddress(receiveSplInfo.ownerPublicKey)}
            </p>
            <p className="wallet-balance-inline">
              ATA: {formatAddress(receiveSplInfo.associatedTokenAccount)}
            </p>
            <p className="wallet-balance-inline">
              Ready: {receiveSplInfo.exists ? "Yes" : "No"}
            </p>
            <div className="action-row">
              <button
                type="button"
                className="small-action"
                onClick={() =>
                  safeCall("copy-receive-ata", async () =>
                    copyAddress(receiveSplInfo.associatedTokenAccount)
                  )
                }
              >
                Copy ATA
              </button>
              <a
                href={receiveSplInfo.associatedTokenAccountExplorerUrl}
                target="_blank"
                rel="noreferrer"
                className="log-link"
              >
                View ATA
              </a>
              {receiveSplInfo.preparationExplorerUrl && (
                <a
                  href={receiveSplInfo.preparationExplorerUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="log-link"
                >
                  View Prepare Tx
                </a>
              )}
            </div>
          </>
        )}
      </section>
      <section className="panel-card tx-history-card">
        <h3>Wallet Balances</h3>
        <div className="panel-divider" />
        <table className="tx-table">
          <thead>
            <tr>
              <th>Label</th>
              <th>Address</th>
              <th>SOL</th>
              <th>USDC</th>
              <th>Tokens</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {walletState.wallets.map((wallet) => (
              <tr key={wallet.publicKey}>
                <td>{wallet.label}</td>
                <td>{wallet.publicKey.slice(0, 8)}...{wallet.publicKey.slice(-6)}</td>
                <td>{wallet.solBalance.toFixed(4)}</td>
                <td>{wallet.usdcBalance.toFixed(4)}</td>
                <td>{wallet.tokenBalances.length}</td>
                <td>
                  <div className="action-row">
                    <button
                      type="button"
                      className="small-action"
                      onClick={() =>
                        safeCall("select-wallet", async () => {
                          await switchWallet(wallet.publicKey);
                          await Promise.all([
                            syncWalletState(),
                            syncReceiveInfo(),
                            syncReceiveSplInfo(),
                            syncSplModule(),
                          ]);
                        })
                      }
                    >
                      Select
                    </button>
                    <button
                      type="button"
                      className="small-action muted"
                      disabled={walletState.wallets.length <= 1 || busyAction !== null}
                      onClick={() =>
                        safeCall("delete-wallet-row", async () => {
                          await deleteWallet(wallet.publicKey);
                          await Promise.all([
                            syncWalletState(),
                            syncReceiveInfo(),
                            syncReceiveSplInfo(),
                            syncSplModule(),
                          ]);
                        })
                      }
                    >
                      Delete
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {activeTokens.length > 0 && (
          <div className="token-list">
            <p className="token-list-title">Active Wallet Tokens</p>
            {activeTokens.map((token) => (
              <p key={token.mint} className="token-row">
                {token.amount.toFixed(6)} - {token.mint}
              </p>
            ))}
          </div>
        )}
      </section>
    </section>
  );

  const agentControlView = (
    <section className="settings-grid">
      <section className="panel-card">
        <h3>Agent Runtime</h3>
        <div className="panel-divider" />
        <p className="wallet-balance-inline">Running: {running ? "Yes" : "No"}</p>
        <p className="wallet-balance-inline">Cycles: {agentStatus?.cycles ?? 0}</p>
        <p className="wallet-balance-inline">Failures: {agentStatus?.failures ?? 0}</p>
        <div className="action-row">
          <button
            type="button"
            className="small-action"
            onClick={() =>
              safeCall("toggle-agent", async () => {
                setAgentStatus(
                  running ? await pauseAgent() : await startAgent(agentStatus?.intervalMs ?? 30000)
                );
                await syncTradeAdvisory();
              })
            }
          >
            {running ? "Pause" : "Start"}
          </button>
          <button
            type="button"
            className="small-action muted"
              onClick={() =>
                safeCall("run-cycle", async () => {
                  setAgentStatus(await runAgent());
                  await Promise.all([syncTradeAdvisory(), syncWalletState(), syncSplModule()]);
                })
              }
            >
            Run Cycle
          </button>
        </div>
        <div className="action-row">
          <button
            type="button"
            className="small-action"
            onClick={() =>
              safeCall("simulate", async () => {
                const result = await runSimulation();
                addLog(`Simulation: ${result.decision.protocol}`);
                await Promise.all([syncTradeAdvisory(), syncSplModule()]);
              })
            }
          >
            Simulate
          </button>
          <button
            type="button"
            className="small-action muted"
            onClick={() => safeCall("reset-circuit", async () => void (await resetCircuitBreaker()))}
          >
            Reset Circuit
          </button>
        </div>
      </section>
      <section className="panel-card">
        <RiskControls
          initialRisk={riskSettings}
          onUpdate={async (risk) =>
            safeCall("update-risk", async () => {
              const updated = await updateRiskSettings(risk);
              setRiskSettings(updated.settings);
              await syncAgentStatus();
              await syncTradeAdvisory();
            })
          }
        />
      </section>
      <section className="panel-card">
        <h3>Jupiter Stats</h3>
        <div className="panel-divider" />
        <p className="wallet-balance-inline">
          Last Intent: {lastIntent?.action ?? "N/A"} {lastIntent?.direction ?? ""}
        </p>
        <p className="wallet-balance-inline">
          Intent Amount %: {lastIntent?.amountPct?.toFixed(4) ?? "0.0000"}
        </p>
        <p className="wallet-balance-inline">
          Confidence: {lastIntent?.confidence?.toFixed(2) ?? "0.00"}
        </p>
        <p className="wallet-balance-inline">
          Daily Swap Count: {jupiterSwapStats.dailySwapCount}
        </p>
        <p className="wallet-balance-inline">
          Successful Swaps: {jupiterSwapStats.successfulSwaps}
        </p>
        <p className="wallet-balance-inline">
          Failed Swaps: {jupiterSwapStats.failedSwaps}
        </p>
        <p className="wallet-balance-inline">
          Last Swap:{" "}
          {jupiterSwapStats.lastSwapAt
            ? formatWhen(jupiterSwapStats.lastSwapAt)
            : "Never"}
        </p>
        <p className="wallet-balance-inline">
          Trader Wallet:{" "}
          {topology?.traderWalletPublicKey
            ? formatAddress(topology.traderWalletPublicKey)
            : "N/A"}
        </p>
      </section>
      <section className="panel-card">
        <div className="logs-head">
          <h3>AI Trade Advisory</h3>
          <button
            type="button"
            className="text-action"
            onClick={() => safeCall("refresh-advisor", syncTradeAdvisory)}
          >
            Refresh
          </button>
        </div>
        <div className="panel-divider" />
        <p className="wallet-balance-inline">
          Recommendation: {tradeAdvisory?.recommendation ?? "HOLD"}{" "}
          {tradeAdvisory?.direction ?? ""}
        </p>
        <p className="wallet-balance-inline">
          Suggested %: {tradeAdvisory?.suggestedPercentage?.toFixed(4) ?? "0.0000"}
        </p>
        <p className="wallet-balance-inline">
          Confidence: {tradeAdvisory?.confidence?.toFixed(2) ?? "0.00"}
        </p>
        <p className="wallet-balance-inline">
          Risk: {tradeAdvisory?.riskLevel ?? "N/A"} (
          {tradeAdvisory?.inputs.riskScore?.toFixed(2) ?? "0.00"})
        </p>
        <p className="wallet-balance-inline">
          Trader Wallet:{" "}
          {tradeAdvisory?.inputs.traderWallet
            ? formatAddress(tradeAdvisory.inputs.traderWallet)
            : "N/A"}
        </p>
        <p className="wallet-balance-inline">
          Reason: {tradeAdvisory?.reason ?? "No advisory generated yet."}
        </p>
      </section>
      <section className="panel-card">
        <div className="logs-head">
          <h3>SPL Economy</h3>
          <button
            type="button"
            className="text-action"
            onClick={() => safeCall("refresh-spl-control", syncSplModule)}
          >
            Refresh
          </button>
        </div>
        <div className="panel-divider" />
        <p className="wallet-balance-inline">
          Initialized: {splState?.initialDistributionDone ? "Yes" : "No"}
        </p>
        <p className="wallet-balance-inline">
          Mint: {splState?.mint ?? "Not initialized"}
        </p>
        <p className="wallet-balance-inline">
          Treasury:{" "}
          {splState?.treasuryWallet ? formatAddress(splState.treasuryWallet) : "N/A"}
        </p>
        <p className="wallet-balance-inline">
          Trader Loss Streak: {splEconomy.traderConsecutiveLosses}
        </p>
        <p className="wallet-balance-inline">
          Trader Activity Count: {splEconomy.traderActivityCount}
        </p>
        <p className="wallet-balance-inline">
          Treasury Wallet:{" "}
          {topology?.treasuryWalletPublicKey
            ? formatAddress(topology.treasuryWalletPublicKey)
            : "N/A"}
        </p>
        <div className="action-row">
          <button
            type="button"
            className="small-action"
            onClick={() =>
              safeCall("init-spl-control", async () => {
                await initializeSplEconomy();
                await Promise.all([syncSplModule(), syncAgentStatus()]);
              })
            }
          >
            Initialize SPL
          </button>
        </div>
        <div className="token-list">
          <p className="token-list-title">Balances</p>
          {splBalances.balances.length === 0 ? (
            <p className="wallet-balance-inline">No balances available.</p>
          ) : (
            splBalances.balances.map((row) => (
              <p key={row.walletPublicKey} className="token-row">
                {formatAddress(row.walletPublicKey)} - {row.amount.toFixed(4)}
              </p>
            ))
          )}
        </div>
      </section>
    </section>
  );

  const historyView = (
    <section className="panel-card tx-history-card">
      <div className="logs-head">
        <h3>Transaction History</h3>
        <button
          type="button"
          className="text-action"
          onClick={() => safeCall("refresh-history", syncLogs)}
        >
          Refresh
        </button>
      </div>
      <div className="panel-divider" />
      {txRows.length === 0 ? (
        <p className="empty-logs">No transactions captured yet.</p>
      ) : (
        <table className="tx-table">
          <thead>
            <tr>
              <th>Time</th>
              <th>Level</th>
              <th>Source</th>
              <th>Agent</th>
              <th>Message</th>
              <th>Link</th>
            </tr>
          </thead>
          <tbody>
            {txRows.map((row, index) => (
              <tr key={`${row.timestamp}-${index}`}>
                <td>{formatWhen(row.timestamp)}</td>
                <td>{row.level}</td>
                <td>
                  <span className={`source-badge source-${row.source ?? "unknown"}`}>
                    {row.source === "ai" ? "AI" : row.source === "manual" ? "Manual" : "-"}
                  </span>
                </td>
                <td>{row.agent ?? "-"}</td>
                <td>{row.message}</td>
                <td>
                  {row.explorerUrl ? (
                    <a href={row.explorerUrl} target="_blank" rel="noreferrer" className="log-link">
                      {row.txSignature ? `${row.txSignature.slice(0, 10)}...` : "View Tx"}
                    </a>
                  ) : (
                    "-"
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );

  const settingsView = (
    <section className="settings-grid">
      <section className="panel-card">
        <h3>Network Profile</h3>
        <div className="panel-divider" />
        <p className="wallet-balance-inline">Cluster: {network?.cluster ?? "unknown"}</p>
        <p className="wallet-balance-inline">RPC: {network?.rpcUrl ?? "unknown"}</p>
        <p className="wallet-balance-inline">
          Jupiter Enabled: {network?.jupiterEnabled ? "Yes" : "No"}
        </p>
        <div className="mint-input-grid">
          <label className="risk-field">
            Quote Input Mint
            <input
              type="text"
              value={quoteInputMint}
              onChange={(event) => setQuoteInputMint(event.target.value.trim())}
            />
          </label>
          <label className="risk-field">
            Quote Output Mint
            <input
              type="text"
              value={quoteOutputMint}
              onChange={(event) => setQuoteOutputMint(event.target.value.trim())}
            />
          </label>
        </div>
        <button
          type="button"
          className="small-action"
          disabled={network?.jupiterEnabled === false}
          onClick={() =>
            safeCall("quote", async () => {
              const quote = await fetchJupiterQuote(0.1, {
                inputMint: quoteInputMint,
                outputMint: quoteOutputMint,
              });
              setQuoteHint(`Quote outAmount: ${quote.outAmount ?? "n/a"}`);
            })
          }
        >
          Preview Quote
        </button>
        {quoteHint && <p className="protocol-hint">{quoteHint}</p>}
        <div className="panel-divider" />
        <h4>Swap Simulation</h4>
        <div className="mint-input-grid">
          <label className="risk-field">
            Amount (SOL)
            <input
              type="number"
              step="0.01"
              value={0.1}
              onChange={(event) => {
                // Amount input for simulation
              }}
            />
          </label>
          <label className="risk-field">
            Slippage (bps)
            <input type="number" defaultValue={100} />
          </label>
        </div>
        <button
          type="button"
          className="small-action"
          disabled={network?.jupiterEnabled === false || !walletState.activeWallet}
          onClick={() =>
            safeCall("simulate", async () => {
              const result = await simulateJupiterSwap({
                walletPublicKey: walletState.activeWallet?.publicKey,
                inputMint: quoteInputMint,
                outputMint: quoteOutputMint,
                amountSol: 0.1,
                slippageBps: 100,
                reasoningReference: "Manual simulation from dashboard",
                agent: "Manual",
              });
              setSimulationResult(result);
            })
          }
        >
          Simulate Swap
        </button>
        {simulationResult && (
          <div className="simulation-results">
            <div className="panel-divider" />
            <h4>Simulation Results</h4>
            <p className="wallet-balance-inline">
              <strong>Status:</strong> {simulationResult.success ? "✅ Success" : "❌ Failed"}
            </p>
            {simulationResult.success ? (
              <>
                <p className="wallet-balance-inline">
                  <strong>Simulated Output:</strong> {simulationResult.simulatedOutput?.toLocaleString() ?? "N/A"}
                </p>
                <p className="wallet-balance-inline">
                  <strong>Compute Units:</strong> {simulationResult.computeUnits?.toLocaleString() ?? "N/A"}
                </p>
                <p className="wallet-balance-inline">
                  <strong>Route:</strong> {simulationResult.route?.join(" → ") ?? "N/A"}
                </p>
                <p className="wallet-balance-inline">
                  <strong>In Amount:</strong> {simulationResult.inAmount?.toLocaleString() ?? "N/A"}
                </p>
                <p className="wallet-balance-inline">
                  <strong>Out Amount:</strong> {simulationResult.outAmount?.toLocaleString() ?? "N/A"}
                </p>
                <p className="wallet-balance-inline">
                  <strong>Slippage:</strong> {simulationResult.slippageBps ?? "N/A"} bps
                </p>
                {simulationResult.logs && simulationResult.logs.length > 0 && (
                  <div className="token-list">
                    <p className="token-list-title">Simulation Logs</p>
                    {simulationResult.logs.slice(0, 5).map((log: string, idx: number) => (
                      <p key={idx} className="token-row" style={{ fontSize: "0.85em" }}>
                        {log}
                      </p>
                    ))}
                  </div>
                )}
              </>
            ) : (
              <p className="wallet-balance-inline" style={{ color: "var(--error)" }}>
                <strong>Error:</strong> {simulationResult.error ?? "Unknown error"}
              </p>
            )}
          </div>
        )}
      </section>
      <section className="panel-card">
        <RiskControls
          initialRisk={riskSettings}
          onUpdate={async (risk) =>
            safeCall("update-risk-settings", async () => {
              const updated = await updateRiskSettings(risk);
              setRiskSettings(updated.settings);
              await syncTradeAdvisory();
            })
          }
        />
      </section>
    </section>
  );

  const logsView = (
    <>
      <section className="panel-card">
        <div className="logs-head">
          <h3>Log Controls</h3>
          <button
            type="button"
            className="text-action"
            onClick={() => safeCall("refresh-logs", syncLogs)}
          >
            Refresh Snapshot
          </button>
        </div>
        <div className="panel-divider" />
        <p className="wallet-balance-inline">Live stream updates through WebSocket.</p>
      </section>
      <LogsPanel />
    </>
  );

  // Helper to get trade count for a wallet from logs
  const getTradeCountForWallet = (publicKey: string) => {
    return logs.filter(
      (log) =>
        (log.txSignature || log.explorerUrl) &&
        (log.action === "SPL_SWAP" || log.action === "SOL_SWAP") &&
        log.agent?.includes("Agent")
    ).length;
  };

  // Helper to get last trade timestamp for a wallet
  const getLastTradeForWallet = (publicKey: string) => {
    const trades = logs
      .filter(
        (log) =>
          (log.txSignature || log.explorerUrl) &&
          (log.action === "SPL_SWAP" || log.action === "SOL_SWAP")
      )
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    return trades[0]?.timestamp ?? null;
  };

  const agentsWalletsView = (
    <section className="panel-card">
      <div className="logs-head">
        <h3>Agents & Wallets</h3>
        <button
          type="button"
          className="text-action"
          onClick={() =>
            safeCall("refresh-agents-wallets", async () => {
              await Promise.all([syncWalletState(), syncAgentStatus(), syncLogs()]);
            })
          }
        >
          Refresh
        </button>
      </div>
      <div className="panel-divider" />
      <div className="agents-wallets-grid">
        {topology && (
          <>
            {[
              { label: "Treasury Agent", publicKey: topology.treasuryWalletPublicKey },
              { label: "Trader Agent", publicKey: topology.traderWalletPublicKey },
              ...(topology.operationalWalletPublicKeys || []).map((pk, idx) => ({
                label: idx === 0 ? "Liquidity Agent" : idx === 1 ? "Arbitrage Agent" : `Agent ${idx + 1}`,
                publicKey: pk,
              })),
            ].map((agent) => {
              const wallet = walletState.wallets.find((w) => w.publicKey === agent.publicKey);
              const tradeCount = getTradeCountForWallet(agent.publicKey);
              const lastTrade = getLastTradeForWallet(agent.publicKey);
              return (
                <div key={agent.publicKey} className="agent-wallet-card">
                  <h4>{agent.label}</h4>
                  <p className="wallet-balance-inline">
                    <strong>Public Key:</strong> {formatAddress(agent.publicKey)}
                  </p>
                  {wallet ? (
                    <>
                      <p className="wallet-balance-inline">
                        <strong>SOL Balance:</strong> {wallet.solBalance.toFixed(4)} SOL
                      </p>
                      <p className="wallet-balance-inline">
                        <strong>USDC Balance:</strong> {wallet.usdcBalance.toFixed(4)} USDC
                      </p>
                      {wallet.tokenBalances.length > 0 && (
                        <div className="token-list">
                          <p className="token-list-title">SPL Tokens</p>
                          {wallet.tokenBalances.map((token) => (
                            <p key={token.mint} className="token-row">
                              {formatAddress(token.mint)}: {token.amount.toFixed(4)}
                            </p>
                          ))}
                        </div>
                      )}
                    </>
                  ) : (
                    <p className="wallet-balance-inline">Wallet not found in wallet state</p>
                  )}
                  <p className="wallet-balance-inline">
                    <strong>Trade Count:</strong> {tradeCount}
                  </p>
                  {lastTrade && (
                    <p className="wallet-balance-inline">
                      <strong>Last Trade:</strong> {formatWhen(lastTrade)}
                    </p>
                  )}
                </div>
              );
            })}
          </>
        )}
        {!topology && (
          <p className="empty-logs">Agent topology not initialized. Start the agent to create agent wallets.</p>
        )}
      </div>
    </section>
  );

  const pageContent =
    activeView === "Dashboard"
      ? dashboardView
      : activeView === "Wallets"
      ? walletsView
      : activeView === "Agents & Wallets"
      ? agentsWalletsView
      : activeView === "Agent Control"
      ? agentControlView
      : activeView === "Transaction History"
      ? historyView
      : activeView === "Settings"
      ? settingsView
      : logsView;

  return (
    <div className="dashboard-root">
      <div className="ambient-shape ambient-left" />
      <div className="ambient-shape ambient-right" />
      <Header wallet={walletState.activeWallet} network={network} />
      <div className="dashboard-grid">
        <Sidebar
          onCreateAgent={() =>
            safeCall("create-sidebar-wallet", async () => {
              await createWallet();
              await Promise.all([syncWalletState(), syncReceiveInfo(), syncReceiveSplInfo(), syncSplModule()]);
              setActiveView("Wallets");
            })
          }
          activeItem={activeView}
          onNavigate={(label) => {
            if (isPageView(label)) setActiveView(label);
          }}
        />
        <main className="main-content">
          {error && <div className="error-banner">{error}</div>}
          <section className="main-section">
            <h2>{activeView}</h2>
          </section>
          {pageContent}
          {busyAction === "bootstrap" && <p className="wallet-balance-inline">Loading...</p>}
        </main>
      </div>
    </div>
  );
}
