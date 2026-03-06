import * as Sentry from "@sentry/react";

const SENTRY_DSN = process.env.REACT_APP_SENTRY_DSN;
if (SENTRY_DSN) {
  Sentry.init({
    dsn: SENTRY_DSN,
    environment: process.env.NODE_ENV,
    tracesSampleRate: 0.1,
    beforeSend(event) {
      if (event.breadcrumbs && Array.isArray(event.breadcrumbs)) {
        event.breadcrumbs = event.breadcrumbs.map((b) => ({
          ...b,
          message: b.message?.substring(0, 100) ?? b.message,
          data: undefined,
        }));
      }
      return event;
    },
  });
}

import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import "./index.css";
import App from "./App";
import ErrorBoundary from "./ErrorBoundary";
import ScrollRestoration from "./ScrollRestoration";
import AppErrorBoundary from "./components/AppErrorBoundary";
import { AuthProvider } from "./contexts/AuthContext";
import { RevenueCatProvider } from "./contexts/RevenueCatContext";
import PrivacyPolicy from "./pages/PrivacyPolicy";
import TermsOfService from "./pages/TermsOfService";
import AuthCallback from "./pages/AuthCallback";
import AuthScreen from "./components/AuthScreen";

function LoginPage() {
  return (
    <div className="min-h-screen bg-[#FFFDF7]" data-testid="login-page">
      <AuthScreen />
    </div>
  );
}

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(
  <React.StrictMode>
    <AppErrorBoundary>
      <BrowserRouter>
        <ScrollRestoration />
        <AuthProvider>
          <RevenueCatProvider>
            <Routes>
              <Route path="/" element={<ErrorBoundary><App /></ErrorBoundary>} />
              <Route path="/auth/callback" element={<AuthCallback />} />
              <Route path="/login" element={<LoginPage />} />
              <Route path="/privacy" element={<PrivacyPolicy />} />
              <Route path="/terms" element={<TermsOfService />} />
            </Routes>
          </RevenueCatProvider>
        </AuthProvider>
      </BrowserRouter>
    </AppErrorBoundary>
  </React.StrictMode>,
);
