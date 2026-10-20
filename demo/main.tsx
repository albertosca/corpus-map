import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { tokenStylesheet } from "./tokens";

const container = document.getElementById("root");
if (!container) throw new Error("missing #root element");

const tokenStyle = document.createElement("style");
tokenStyle.textContent = tokenStylesheet();
document.head.append(tokenStyle);

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
