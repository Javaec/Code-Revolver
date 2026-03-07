import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { NotificationsProvider } from "./lib/notifications";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <NotificationsProvider>
      <App />
    </NotificationsProvider>
  </React.StrictMode>,
);
