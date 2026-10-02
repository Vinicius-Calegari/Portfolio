import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import { installAssetRecovery, PageRecovery } from "./PageRecovery";
import "./styles.css";
installAssetRecovery();
ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <PageRecovery>
        <App />
      </PageRecovery>
    </BrowserRouter>
  </React.StrictMode>,
);
