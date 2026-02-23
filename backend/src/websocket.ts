import { Server } from "socket.io";
import { Server as HTTPServer } from "http";

export type LogLevel = "info" | "warn" | "error" | "success";

export interface AgentLogEvent {
  timestamp: string;
  level: LogLevel;
  message: string;
  txSignature?: string;
  explorerUrl?: string;
  agent?: string; // e.g., "Trader Agent", "Liquidity Agent", "Manual"
  source?: "ai" | "manual"; // Whether action was AI-initiated or user-initiated
  action?: string; // e.g., "SPL_SWAP", "SOL_SWAP", "SPL_TRANSFER", "SIMULATE_SWAP"
  inputMint?: string;
  outputMint?: string;
  inAmount?: number;
  outAmount?: number;
  confidence?: number;
  reason?: string;
  data?: unknown;
}

let io: Server | null = null;
const logBuffer: AgentLogEvent[] = [];
const LOG_BUFFER_LIMIT = 200;

const appendLog = (event: AgentLogEvent) => {
  logBuffer.push(event);
  if (logBuffer.length > LOG_BUFFER_LIMIT) {
    logBuffer.shift();
  }
};

export const initWebsocket = (server: HTTPServer) => {
  io = new Server(server, { cors: { origin: "*" } });

  io.on("connection", (socket) => {
    socket.emit("logs:snapshot", logBuffer);
  });
};

export const emitLog = (
  messageOrEvent: string | Omit<AgentLogEvent, "timestamp">
) => {
  const event: AgentLogEvent =
    typeof messageOrEvent === "string"
      ? {
          timestamp: new Date().toISOString(),
          level: "info",
          message: messageOrEvent,
        }
      : {
          ...messageOrEvent,
          timestamp: new Date().toISOString(),
        };

  appendLog(event);
  io?.emit("log", event);
};

export const getRecentLogs = () => [...logBuffer];
