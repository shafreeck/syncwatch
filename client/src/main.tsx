import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

// Simple, centralized Service Worker registration (shared by main and test)
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.min.js', { scope: '/' })
    .then((reg) => { (window as any).__WT_SW_REG__ = reg; })
    .catch((e) => console.warn('SW register failed:', e));
}

createRoot(document.getElementById("root")!).render(<App />);
