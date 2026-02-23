import React from "react";
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  ReactNode,
} from "react";
import { LogEvent } from "../types";

interface AppContextValue {
  logs: LogEvent[];
  addLog: (event: LogEvent | string) => void;
  setLogs: (events: LogEvent[]) => void;
  clearLogs: () => void;
}

const AppContext = createContext<AppContextValue | undefined>(undefined);

const normalizeLog = (event: LogEvent | string): LogEvent => {
  if (typeof event === "string") {
    return {
      timestamp: new Date().toISOString(),
      level: "info",
      message: event,
    };
  }

  return {
    timestamp: event.timestamp ?? new Date().toISOString(),
    level: event.level ?? "info",
    message: event.message,
    txSignature: event.txSignature,
    explorerUrl: event.explorerUrl,
    agent: event.agent,
    source: event.source,
    action: event.action,
    inputMint: event.inputMint,
    outputMint: event.outputMint,
    inAmount: event.inAmount,
    outAmount: event.outAmount,
    confidence: event.confidence,
    reason: event.reason,
    data: event.data,
  };
};

export const AppProvider = ({ children }: { children: ReactNode }) => {
  const [logs, setLogsState] = useState<LogEvent[]>([]);

  const addLog = useCallback((event: LogEvent | string) => {
    const normalized = normalizeLog(event);
    setLogsState((current) => [...current, normalized].slice(-200));
  }, []);

  const setLogs = useCallback((events: LogEvent[]) => {
    setLogsState(events.map(normalizeLog).slice(-200));
  }, []);

  const clearLogs = useCallback(() => {
    setLogsState([]);
  }, []);

  const value = useMemo(
    () => ({
      logs,
      addLog,
      setLogs,
      clearLogs,
    }),
    [logs, addLog, setLogs, clearLogs]
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
};

export const useApp = () => {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error("useApp must be used within AppProvider");
  }

  return context;
};
