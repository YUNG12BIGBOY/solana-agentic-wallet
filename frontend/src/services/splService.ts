import { api } from "../config/api";
import { SplModuleBalances, SplModuleState } from "../types";

interface SplInitializeResponse extends SplModuleBalances {
  symbol: string;
}

export const fetchSplState = async () => {
  const { data } = await api.get<SplModuleState>("/spl/status");
  return data;
};

export const fetchSplBalances = async () => {
  const { data } = await api.get<SplModuleBalances>("/spl/balances");
  return data;
};

export const initializeSplEconomy = async () => {
  const { data } = await api.post<SplInitializeResponse>("/spl/initialize");
  return data;
};
