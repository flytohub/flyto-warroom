import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./styles.css";
import visualContract from "./visual-contract.json";

const root = document.getElementById("root");

if (!root) {
  throw new Error("Flyto2 Warroom CE root element is missing");
}

document.documentElement.dataset.visualContract = visualContract.schema;

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
