import React from "react";
import agentGhost from "../../assets/icons/agent-ghost.svg";
import agentBars from "../../assets/icons/agent-bars.svg";

interface AgentCardProps {
  title: string;
  subtitle: string;
  icon: string;
  running: boolean;
  onToggle: () => void;
  onLogs: () => void;
}

export default function AgentCard({
  title,
  subtitle,
  icon,
  running,
  onToggle,
  onLogs,
}: AgentCardProps) {
  return (
    <article className="agent-card">
      <div className="agent-card-title">
        <img src={icon} alt="" className="agent-logo" />
        <h3>{title}</h3>
        <img src={agentGhost} alt="" className="agent-ghost" />
      </div>

      <div className="agent-status-row">
        <span className={`agent-status ${running ? "on" : "off"}`} aria-live="polite">
          {running ? "Running" : "Paused"}
        </span>
        <span className="agent-pill">{running ? "Running" : "Paused"}</span>
      </div>

      <p className="agent-subtitle">
        <span className="agent-check" aria-hidden />
        {subtitle}
      </p>

      <div className="agent-actions">
        <img src={agentBars} alt="" className="agent-bars" />
        <button type="button" className="small-action" onClick={onToggle}>
          {running ? "Pause" : "Resume"}
        </button>
        <button type="button" className="small-action muted" onClick={onLogs}>
          Logs
        </button>
      </div>
    </article>
  );
}
