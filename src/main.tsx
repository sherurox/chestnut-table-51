import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./design/fonts.js";
import "./index.css";
import { App } from "./App.js";
import { registerServiceWorker } from "./lib/appUpdate.js";
import { markSandboxDevice } from "./storage/sandbox.js";

registerServiceWorker();

if (import.meta.env.DEV && __CT51_SANDBOX__) {
  markSandboxDevice();
  document.title = `[SANDBOX] ${document.title}`;
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
