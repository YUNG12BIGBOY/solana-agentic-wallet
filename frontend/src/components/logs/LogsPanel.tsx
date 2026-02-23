import React from "react";
import { useApp } from "../../context/AppContext";

const formatTime = (timestamp: string) =>
  new Date(timestamp).toLocaleTimeString();

export default function LogsPanel() {
  const { logs, clearLogs } = useApp();

  return (
    <section className="panel-card logs-card">
      <div className="logs-head">
        <h3>Live Logs</h3>
        <button type="button" className="text-action" onClick={clearLogs}>
          Clear
        </button>
      </div>
      <div className="panel-divider" />
      <div className="logs-stream">
        {logs.length === 0 ? (
          <p className="empty-logs">No events yet.</p>
        ) : (
          logs.map((entry, index) => (
            <div key={`${entry.timestamp}-${index}`} className="log-row">
              <p className={`log-line level-${entry.level}`}>
                [{formatTime(entry.timestamp)}] {entry.message}
              </p>
              {entry.explorerUrl && (
                <a
                  href={entry.explorerUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="log-link"
                >
                  View Tx
                </a>
              )}
            </div>
          ))
        )}
      </div>
    </section>
  );
}
