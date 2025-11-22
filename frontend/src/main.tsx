import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./assets/fonts/satoshi.css";
import "./index.css";
import App from "./App.tsx";
import OAuthCallback from "./pages/OAuthCallback.tsx";

const isCallbackRoute = window.location.pathname.startsWith("/oauth/callback");
const RootComponent = isCallbackRoute ? OAuthCallback : App;

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <RootComponent />
  </StrictMode>
);
