import React from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import chevronDown from "../../assets/icons/chevron-down.svg";

interface ActivityPoint {
  label: string;
  sol: number;
  usdc: number;
}

interface ActivityChartProps {
  data: ActivityPoint[];
}

export default function ActivityChart({ data }: ActivityChartProps) {
  return (
    <div className="activity-chart-card">
      <div className="section-title-row">
        <h2>Agent Activity</h2>
        <button type="button" className="range-button">
          <span className="range-dot" />
          Last 24 Hours
          <img src={chevronDown} alt="" className="range-chevron" />
        </button>
      </div>

      <div className="chart-legend">
        <span className="legend-item">
          <span className="legend-dot sol" />
          SOL
        </span>
        <span className="legend-item">
          <span className="legend-dot usdc" />
          USDC
        </span>
      </div>

      <div className="chart-shell">
        <ResponsiveContainer width="100%" height={250}>
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="4 4" stroke="#4a5d8e66" />
            <XAxis dataKey="label" stroke="#95a7d8" tickLine={false} axisLine={false} />
            <YAxis
              stroke="#95a7d8"
              tickLine={false}
              axisLine={false}
              domain={["dataMin - 0.2", "dataMax + 0.2"]}
            />
            <Tooltip
              contentStyle={{
                background: "rgba(17, 26, 60, 0.95)",
                border: "1px solid #5c6cbc",
                borderRadius: "10px",
              }}
              labelStyle={{ color: "#dce7ff" }}
            />
            <Line
              type="monotone"
              dataKey="sol"
              stroke="#c865ff"
              strokeWidth={3}
              dot={{ r: 4, fill: "#d679ff" }}
              activeDot={{ r: 6 }}
            />
            <Line
              type="monotone"
              dataKey="usdc"
              stroke="#67d6d2"
              strokeWidth={3}
              dot={{ r: 4, fill: "#72f0eb" }}
              activeDot={{ r: 6 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
