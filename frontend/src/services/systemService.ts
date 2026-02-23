import { api } from "../config/api";
import { SystemHealth } from "../types";

export const fetchSystemHealth = async () => {
  const { data } = await api.get<SystemHealth>("/health");
  return data;
};
