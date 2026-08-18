import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { LebtigApp } from "./app.tsx";
import "./styles.css";
import "./cms.css";

const root = document.getElementById("root");
if (!root) throw new Error("Lebtig root element not found");

createRoot(root).render(
  <StrictMode>
    <LebtigApp />
  </StrictMode>,
);
