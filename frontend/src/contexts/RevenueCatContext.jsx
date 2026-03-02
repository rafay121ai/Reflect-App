/**
 * RevenueCat React context: configures SDK, syncs with auth, exposes Premium status and paywall/Customer Center.
 * Use useRevenueCat() for isPremium, presentPaywall, presentCustomerCenter, restorePurchases.
 */
import { createContext, useContext, useEffect, useState, useCallback } from "react";
import { useAuth } from "./AuthContext";
import {
  getRevenueCatApiKey,
  isRevenueCatSupported,
  configureRevenueCat,
  logInRevenueCat,
  logOutRevenueCat,
  getCustomerInfo,
  presentPaywall as doPresentPaywall,
  presentPaywallIfNeeded as doPresentPaywallIfNeeded,
  presentCustomerCenter as doPresentCustomerCenter,
  restorePurchases as doRestorePurchases,
  addCustomerInfoUpdateListener,
} from "../lib/revenuecat";

const RevenueCatContext = createContext({
  isSupported: false,
  isPremium: false,
  customerInfo: null,
  loading: true,
  error: null,
  refreshCustomerInfo: async () => {},
  presentPaywall: async () => null,
  presentPaywallIfNeeded: async () => null,
  presentCustomerCenter: async () => {},
  restorePurchases: async () => null,
});

export function useRevenueCat() {
  const ctx = useContext(RevenueCatContext);
  if (!ctx) throw new Error("useRevenueCat must be used within RevenueCatProvider");
  return ctx;
}

export function RevenueCatProvider({ children }) {
  const { user } = useAuth();
  const [isSupported, setIsSupported] = useState(false);
  const [customerInfo, setCustomerInfo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const isPremium = Boolean(customerInfo?.entitlements?.active?.Premium?.isActive);

  const refreshCustomerInfo = useCallback(async () => {
    const result = await getCustomerInfo();
    if (result?.customerInfo) setCustomerInfo(result.customerInfo);
    return result?.customerInfo ?? null;
  }, []);

  // Configure on mount (native only), then sync user
  useEffect(() => {
    let cancelled = false;
    let removeListener = () => Promise.resolve();

    const init = async () => {
      const supported = await isRevenueCatSupported();
      if (!cancelled) setIsSupported(supported);

      if (!supported) {
        if (!cancelled) setLoading(false);
        return;
      }

      const apiKey = getRevenueCatApiKey();
      if (!apiKey) {
        if (!cancelled) setLoading(false);
        return;
      }

      try {
        await configureRevenueCat(apiKey, user?.id ?? null);
        if (cancelled) return;

        if (user?.id) {
          await logInRevenueCat(user.id);
          if (cancelled) return;
        }

        const result = await getCustomerInfo();
        if (!cancelled && result?.customerInfo) setCustomerInfo(result.customerInfo);

        removeListener = await addCustomerInfoUpdateListener((info) => {
          if (!cancelled) setCustomerInfo(info);
        });
      } catch (err) {
        if (!cancelled) {
          setError(err?.message || "RevenueCat setup failed");
          setCustomerInfo(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    init();
    return () => {
      cancelled = true;
      removeListener();
    };
  }, []);

  // When user signs in/out, log in or out of RevenueCat and refresh customer info
  useEffect(() => {
    if (!isSupported) return;

    const apiKey = getRevenueCatApiKey();
    if (!apiKey) return;

    let cancelled = false;

    const sync = async () => {
      try {
        if (user?.id) {
          const result = await logInRevenueCat(user.id);
          if (!cancelled && result?.customerInfo) setCustomerInfo(result.customerInfo);
        } else {
          const result = await logOutRevenueCat();
          if (!cancelled && result?.customerInfo) setCustomerInfo(result.customerInfo);
        }
      } catch (err) {
        if (!cancelled) setError(err?.message || "RevenueCat sync failed");
      }
    };

    sync();
    return () => { cancelled = true; };
  }, [isSupported, user?.id]);

  const presentPaywall = useCallback(async (options = {}) => {
    setError(null);
    try {
      return await doPresentPaywall(options);
    } catch (err) {
      setError(err?.message || "Paywall failed");
      throw err;
    } finally {
      await refreshCustomerInfo();
    }
  }, [refreshCustomerInfo]);

  const presentPaywallIfNeeded = useCallback(async (options = {}) => {
    setError(null);
    try {
      return await doPresentPaywallIfNeeded(options);
    } catch (err) {
      setError(err?.message || "Paywall failed");
      throw err;
    } finally {
      await refreshCustomerInfo();
    }
  }, [refreshCustomerInfo]);

  const presentCustomerCenter = useCallback(async () => {
    setError(null);
    try {
      await doPresentCustomerCenter();
      await refreshCustomerInfo();
    } catch (err) {
      setError(err?.message || "Customer Center failed");
      throw err;
    }
  }, [refreshCustomerInfo]);

  const restorePurchases = useCallback(async () => {
    setError(null);
    try {
      const result = await doRestorePurchases();
      if (result?.customerInfo) setCustomerInfo(result.customerInfo);
      return result?.customerInfo ?? null;
    } catch (err) {
      setError(err?.message || "Restore failed");
      throw err;
    }
  }, []);

  const value = {
    isSupported,
    isPremium,
    customerInfo,
    loading,
    error,
    refreshCustomerInfo,
    presentPaywall,
    presentPaywallIfNeeded,
    presentCustomerCenter,
    restorePurchases,
  };

  return (
    <RevenueCatContext.Provider value={value}>
      {children}
    </RevenueCatContext.Provider>
  );
}
