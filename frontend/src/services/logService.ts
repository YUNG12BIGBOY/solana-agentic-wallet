import { api } from "../config/api";
import { LogEvent } from "../types";

interface LogsResponse {
  logs: LogEvent[];
}

export const fetchLogs = async () => {
  const { data } = await api.get<LogsResponse>("/logs");
  return data.logs;
};
