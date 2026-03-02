/**
 * RevenueCat SDK wrapper for Capacitor (iOS/Android).
 * Use only on native; all methods no-op or resolve safely on web.
 *
 * Requires:
 * - REACT_APP_REVENUECAT_API_KEY in .env
 * - Entitlement "Premium" and products (monthly, yearly) configured in RevenueCat dashboard
 * @see https://www.revenuecat.com/docs/getting-started/installation/capacitor
 */

const REVENUECAT_ENTITLEMENT_PREMIUM = "Premium";

/**
 * @returns {string|null} API key or null if not set
 */
export function getRevenueCatApiKey() {
  const key = (process.env.REACT_APP_REVENUECAT_API_KEY || "").trim();
  return key || null;
}

/**
 * @returns {Promise<boolean>} True if running on Capacitor native (iOS/Android)
 */
export async function isRevenueCatSupported() {
  try {
    const { Capacitor } = await import("@capacitor/core");
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
}

/**
 * Configure RevenueCat. Call once at app startup (e.g. from RevenueCatContext).
 * @param {string} apiKey - RevenueCat public API key
 * @param {string|null} [appUserID] - Optional user id (e.g. Supabase user.id); anonymous if null
 * @returns {Promise<void>}
 */
export async function configureRevenueCat(apiKey, appUserID = null) {
  const supported = await isRevenueCatSupported();
  if (!supported || !apiKey) return;

  try {
    const { Purchases } = await import("@revenuecat/purchases-capacitor");
    await Purchases.configure({
      apiKey,
      appUserID: appUserID || undefined,
    });
  } catch (err) {
    console.error("[RevenueCat] configure failed:", err);
    throw err;
  }
}

/**
 * Log in a user (identify them in RevenueCat). Call after auth sign-in.
 * @param {string} appUserID - Stable user id (e.g. Supabase user.id)
 * @returns {Promise<{ customerInfo: object }|null>} customerInfo or null on web/error
 */
export async function logInRevenueCat(appUserID) {
  const supported = await isRevenueCatSupported();
  if (!supported || !appUserID) return null;

  try {
    const { Purchases } = await import("@revenuecat/purchases-capacitor");
    const { customerInfo } = await Purchases.logIn({ appUserID });
    return { customerInfo };
  } catch (err) {
    console.error("[RevenueCat] logIn failed:", err);
    return null;
  }
}

/**
 * Log out (anonymous user in RevenueCat). Call after auth sign-out.
 * @returns {Promise<{ customerInfo: object }|null>}
 */
export async function logOutRevenueCat() {
  const supported = await isRevenueCatSupported();
  if (!supported) return null;

  try {
    const { Purchases } = await import("@revenuecat/purchases-capacitor");
    const { customerInfo } = await Purchases.logOut();
    return { customerInfo };
  } catch (err) {
    console.error("[RevenueCat] logOut failed:", err);
    return null;
  }
}

/**
 * Get current customer info from RevenueCat.
 * @returns {Promise<{ customerInfo: object }|null>}
 */
export async function getCustomerInfo() {
  const supported = await isRevenueCatSupported();
  if (!supported) return null;

  try {
    const { Purchases } = await import("@revenuecat/purchases-capacitor");
    const { customerInfo } = await Purchases.getCustomerInfo();
    return { customerInfo };
  } catch (err) {
    console.error("[RevenueCat] getCustomerInfo failed:", err);
    return null;
  }
}

/**
 * Check if the user has the Premium entitlement.
 * @param {object} [customerInfo] - From getCustomerInfo(); if omitted, fetches once
 * @returns {Promise<boolean>}
 */
export async function isPremium(customerInfo = null) {
  if (customerInfo != null) {
    const ent = customerInfo?.entitlements?.active?.[REVENUECAT_ENTITLEMENT_PREMIUM];
    return Boolean(ent?.isActive);
  }
  const result = await getCustomerInfo();
  if (!result?.customerInfo) return false;
  const ent = result.customerInfo.entitlements?.active?.[REVENUECAT_ENTITLEMENT_PREMIUM];
  return Boolean(ent?.isActive);
}

/**
 * Present the RevenueCat paywall (dashboard-configured). Only on native.
 * @param {object} [options] - Optional offering, displayCloseButton, listener
 * @returns {Promise<{ result: string }|null>} PaywallResult.result (e.g. PURCHASED, RESTORED, CANCELLED) or null
 */
export async function presentPaywall(options = {}) {
  const supported = await isRevenueCatSupported();
  if (!supported) return null;

  try {
    const { RevenueCatUI } = await import("@revenuecat/purchases-capacitor-ui");
    const paywallResult = await RevenueCatUI.presentPaywall(options);
    return paywallResult;
  } catch (err) {
    console.error("[RevenueCat] presentPaywall failed:", err);
    throw err;
  }
}

/**
 * Present paywall only if the user does not have the given entitlement.
 * @param {object} opts - { requiredEntitlementIdentifier: string, ...PresentPaywallOptions }
 * @returns {Promise<{ result: string }|null>}
 */
export async function presentPaywallIfNeeded(opts = {}) {
  const supported = await isRevenueCatSupported();
  if (!supported) return null;

  try {
    const { RevenueCatUI } = await import("@revenuecat/purchases-capacitor-ui");
    const paywallResult = await RevenueCatUI.presentPaywallIfNeeded({
      requiredEntitlementIdentifier: REVENUECAT_ENTITLEMENT_PREMIUM,
      ...opts,
    });
    return paywallResult;
  } catch (err) {
    console.error("[RevenueCat] presentPaywallIfNeeded failed:", err);
    throw err;
  }
}

/**
 * Present Customer Center (manage subscription, restore). Only on native.
 * @returns {Promise<void>}
 */
export async function presentCustomerCenter() {
  const supported = await isRevenueCatSupported();
  if (!supported) return;

  try {
    const { RevenueCatUI } = await import("@revenuecat/purchases-capacitor-ui");
    await RevenueCatUI.presentCustomerCenter();
  } catch (err) {
    console.error("[RevenueCat] presentCustomerCenter failed:", err);
    throw err;
  }
}

/**
 * Restore purchases. Use from Settings or after explaining to the user.
 * @returns {Promise<{ customerInfo: object }|null>}
 */
export async function restorePurchases() {
  const supported = await isRevenueCatSupported();
  if (!supported) return null;

  try {
    const { Purchases } = await import("@revenuecat/purchases-capacitor");
    const { customerInfo } = await Purchases.restorePurchases();
    return { customerInfo };
  } catch (err) {
    console.error("[RevenueCat] restorePurchases failed:", err);
    throw err;
  }
}

/**
 * Add a listener for customer info updates (e.g. after purchase).
 * @param {(customerInfo: object) => void} callback
 * @returns {Promise<() => Promise<void>>} Unsubscribe function
 */
export async function addCustomerInfoUpdateListener(callback) {
  const supported = await isRevenueCatSupported();
  if (!supported) return () => Promise.resolve();

  try {
    const { Purchases } = await import("@revenuecat/purchases-capacitor");
    const listenerId = await Purchases.addCustomerInfoUpdateListener(callback);
    return async () => {
      try {
        await Purchases.removeCustomerInfoUpdateListener({ listenerToRemove: listenerId });
      } catch (e) {
        // ignore
      }
    };
  } catch (err) {
    console.error("[RevenueCat] addCustomerInfoUpdateListener failed:", err);
    return () => Promise.resolve();
  }
}

export { REVENUECAT_ENTITLEMENT_PREMIUM };
