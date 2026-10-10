import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { SketchDefs } from "./ui/components/SketchDefs";
import { preloadSounds } from "./ui/sounds";
// Bundled locally by npm, so the font works with Wi-Fi off.
import "@fontsource/patrick-hand";
import "./theme/tokens.css";
import "./theme/styles.css";

preloadSounds();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <SketchDefs />
    <App />
  </React.StrictMode>,
);
