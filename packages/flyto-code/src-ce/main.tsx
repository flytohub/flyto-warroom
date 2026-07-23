import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./styles.css";

const root = document.getElementById("root");

if (!root) {
  throw new Error("Flyto2 Warroom CE root element is missing");
}

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
