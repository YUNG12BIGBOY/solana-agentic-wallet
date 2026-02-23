import React from "react";
import Dashboard from "./pages/Dashboard";
import { AppProvider } from "./context/AppContext";

export default function App() {
  return (
    <AppProvider>
      <Dashboard />
    </AppProvider>
  );
}
