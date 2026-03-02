/**
 * Lemon Squeezy checkout for REFLECT web subscriptions.
 * Opens checkout in overlay; on success reloads so backend sees updated plan.
 */

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
 * Open Lemon Squeezy checkout for a variant.
 * @param {{ variantId: string, userId: string, userEmail: string }} opts
 * @param {(err?: string) => void} onError - optional callback if checkout open fails
 */
export async function openCheckout({ variantId, userId, userEmail }, onError) {
  const storeUrl = getStoreUrl();
  if (!storeUrl || !variantId) {
    const err = "Checkout is not configured. Set REACT_APP_LS_STORE_URL and variant IDs.";
    if (onError) onError(err);
    return;
  }
  const params = new URLSearchParams();
  params.set("checkout[email]", userEmail || "");
  params.set("checkout[custom][user_id]", userId || "");
  params.set("embed", "1");
  const base = storeUrl.replace(/\/$/, "");
  const url = `${base}/checkout/buy/${variantId}?${params.toString()}`;

  await loadScript();
  if (!window.LemonSqueezy) {
    window.open(url, "_blank");
    return;
  }
  window.LemonSqueezy.Setup({
    eventHandler: (event) => {
      if (event.event === "Checkout.Success") {
        setTimeout(() => {
          window.location.reload();
        }, 2000);
      }
    },
  });
  window.LemonSqueezy.Url.Open(url);
}

export function getLemonVariants() {
  return {
    storeUrl: getStoreUrl(),
    variantMonthly: getVariantMonthly(),
    variantYearly: getVariantYearly(),
    isConfigured: !!(getStoreUrl() && (getVariantMonthly() || getVariantYearly())),
  };
}
