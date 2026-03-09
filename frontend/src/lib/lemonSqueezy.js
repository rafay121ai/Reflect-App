/**
 * Lemon Squeezy checkout for REFLECT web subscriptions.
 * Opens checkout in overlay; on success polls for plan update then reloads.
 */

import { getBackendUrl } from "./config";
import { getAuthToken } from "./api";

const SCRIPT_URL = "https://app.lemonsqueezy.com/js/lemon.js";

function getStoreUrl() {
  return (process.env.REACT_APP_LS_STORE_URL || "").trim() || null;
}

function getVariantMonthly() {
  return (process.env.REACT_APP_LS_VARIANT_MONTHLY || "").trim() || null;
}

function getVariantYearly() {
  return (process.env.REACT_APP_LS_VARIANT_YEARLY || "").trim() || null;
}

function getMonthlyCheckoutUrl() {
  return (process.env.REACT_APP_LS_MONTHLY_URL || "").trim() || null;
}

function getYearlyCheckoutUrl() {
  return (process.env.REACT_APP_LS_YEARLY_URL || "").trim() || null;
}

/** Single checkout URL for the product; variant is selected via ?variant= (monthly/yearly). */
function getCheckoutUrl() {
  return (process.env.REACT_APP_LS_CHECKOUT_URL || "").trim() || null;
}

function loadScript() {
  return new Promise((resolve) => {
    if (typeof window === "undefined") {
      resolve();
      return;
    }
    if (window.LemonSqueezy) {
      resolve();
      return;
    }
    const existing = document.querySelector(`script[src="${SCRIPT_URL}"]`);
    if (existing) {
      existing.addEventListener("load", () => resolve());
      return;
    }
    const script = document.createElement("script");
    script.src = SCRIPT_URL;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => resolve();
    document.head.appendChild(script);
  });
}

/**
 * Build checkout URL with email and optional custom user_id.
 * Uses REACT_APP_LS_CHECKOUT_URL (one URL + variant= param), or
 * REACT_APP_LS_MONTHLY_URL / REACT_APP_LS_YEARLY_URL if set, else store URL + variant.
 */
function buildCheckoutUrl(variantId, userEmail, userId) {
  const singleUrl = getCheckoutUrl();
  const monthlyUrl = getMonthlyCheckoutUrl();
  const yearlyUrl = getYearlyCheckoutUrl();
  const variantMonthly = getVariantMonthly();
  const variantYearly = getVariantYearly();

  let base = null;
  if (singleUrl && variantId && (variantId === variantMonthly || variantId === variantYearly)) {
    base = singleUrl;
  } else if (variantId === variantMonthly && monthlyUrl) {
    base = monthlyUrl;
  } else if (variantId === variantYearly && yearlyUrl) {
    base = yearlyUrl;
  }

  if (base) {
    const sep = base.includes("?") ? "&" : "?";
    let url = `${base}${sep}variant=${encodeURIComponent(variantId)}&checkout[email]=${encodeURIComponent(userEmail || "")}`;
    if (userId) url += `&checkout[custom][user_id]=${encodeURIComponent(userId)}`;
    return url;
  }

  const storeUrl = getStoreUrl();
  if (!storeUrl || !variantId) return null;
  const params = new URLSearchParams();
  params.set("checkout[email]", userEmail || "");
  params.set("checkout[custom][user_id]", userId || "");
  const trimmed = storeUrl.replace(/\/$/, "");
  return `${trimmed}/checkout/buy/${variantId}?${params.toString()}`;
}

/**
 * Open Lemon Squeezy checkout for a variant.
 * @param {{ variantId: string, userId: string, userEmail: string, getAuthToken?: () => string | null, onCheckoutSuccessMessage?: (msg: string) => void }} opts
 * @param {(err?: string) => void} onError - optional callback if checkout open fails
 */
export async function openCheckout({ variantId, userId, userEmail, getAuthToken: getAuthTokenFn, onCheckoutSuccessMessage }, onError) {
  const url = buildCheckoutUrl(variantId, userEmail, userId);
  if (!url) {
    const err = "Checkout is not configured. Set REACT_APP_LS_CHECKOUT_URL (and variant IDs) or REACT_APP_LS_MONTHLY_URL & REACT_APP_LS_YEARLY_URL.";
    if (onError) onError(err);
    return;
  }

  await loadScript();
  if (!window.LemonSqueezy) {
    window.open(url, "_blank");
    return;
  }

  async function waitForPlanUpdate(maxAttempts = 6, intervalMs = 2000) {
    const getToken = getAuthTokenFn || getAuthToken;
    const base = getBackendUrl().replace(/\/$/, "");
    for (let i = 0; i < maxAttempts; i++) {
      await new Promise((r) => setTimeout(r, intervalMs));
      try {
        const res = await fetch(`${base}/api/usage`, {
          headers: { Authorization: `Bearer ${getToken() || ""}` },
        });
        if (res.ok) {
          const data = await res.json();
          if (data.plan_type && data.plan_type !== "trial") {
            return true;
          }
        }
      } catch (_) {}
    }
    return false;
  }

  window.LemonSqueezy.Setup({
    eventHandler: async (event) => {
      if (event.event === "Checkout.Success") {
        if (onCheckoutSuccessMessage) onCheckoutSuccessMessage("Your mirror is ready. Activating your plan…");
        const updated = await waitForPlanUpdate();
        if (!updated && onCheckoutSuccessMessage) {
          onCheckoutSuccessMessage(
            "Payment confirmed. Your plan is activating — if it doesn't unlock within a few minutes, contact support at essanirafay@gmail.com"
          );
        }
        window.location.reload();
      }
    },
  });
  window.LemonSqueezy.Url.Open(url);
}

export function getLemonVariants() {
  const singleUrl = getCheckoutUrl();
  const monthlyUrl = getMonthlyCheckoutUrl();
  const yearlyUrl = getYearlyCheckoutUrl();
  const variantMonthly = getVariantMonthly();
  const variantYearly = getVariantYearly();
  const storeUrl = getStoreUrl();
  const hasUrls = !!(monthlyUrl && yearlyUrl);
  const hasSingleUrl = !!(singleUrl && (variantMonthly || variantYearly));
  const hasVariants = !!(storeUrl && (variantMonthly || variantYearly));
  return {
    storeUrl,
    variantMonthly,
    variantYearly,
    monthlyCheckoutUrl: monthlyUrl,
    yearlyCheckoutUrl: yearlyUrl,
    isConfigured: hasSingleUrl || hasUrls || hasVariants,
  };
}
