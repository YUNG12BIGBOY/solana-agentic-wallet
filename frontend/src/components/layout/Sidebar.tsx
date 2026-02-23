import React from "react";
import menuDashboard from "../../assets/icons/menu-dashboard.svg";
import menuWallet from "../../assets/icons/menu-wallet.svg";
import menuAgent from "../../assets/icons/menu-agent.svg";
import menuHistory from "../../assets/icons/menu-history.svg";
import menuSettings from "../../assets/icons/menu-settings.svg";
import menuLogs from "../../assets/icons/menu-logs.svg";

interface SidebarProps {
  onCreateAgent: () => void;
  activeItem: string;
  onNavigate: (label: string) => void;
}

const menuItems = [
  { label: "Dashboard", icon: menuDashboard },
  { label: "Wallets", icon: menuWallet },
  { label: "Agent Control", icon: menuAgent },
  { label: "Transaction History", icon: menuHistory },
  { label: "Settings", icon: menuSettings },
  { label: "Logs", icon: menuLogs },
];

export default function Sidebar({
  onCreateAgent,
  activeItem,
  onNavigate,
}: SidebarProps) {
  return (
    <aside className="sidebar">
      {menuItems.map((item) => (
        <button
          key={item.label}
          type="button"
          className={`menu-item ${activeItem === item.label ? "active" : ""}`}
          onClick={() => onNavigate(item.label)}
        >
          <span className="menu-icon-wrap">
            <img src={item.icon} alt="" className="menu-icon" />
          </span>
          {item.label}
        </button>
      ))}

      <button
        type="button"
        className="primary-outline-button create-agent"
        onClick={onCreateAgent}
      >
        Create New Agent
      </button>
    </aside>
  );
}
