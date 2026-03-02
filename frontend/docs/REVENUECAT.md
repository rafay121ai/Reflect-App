# RevenueCat integration (Capacitor + React)

This app uses [RevenueCat](https://www.revenuecat.com/) for in-app subscriptions on iOS and Android. The SDK is configured once at startup and kept in sync with your auth user.

## Setup

### 1. Environment

Add to `.env` (and set in your build environment for production):

```bash
REACT_APP_REVENUECAT_API_KEY=your_public_api_key
```

Use your **public** API key from RevenueCat dashboard → Project → API keys (iOS and/or Android). The test key is safe to use in development.

### 2. RevenueCat dashboard

- **Entitlements**: Create an entitlement named **`Premium`** (used in code for `presentPaywallIfNeeded` and `isPremium`).
- **Products**: In App Store Connect and Google Play Console, create subscription products. In RevenueCat, add:
  - **Product ID** `monthly` (or your exact App Store / Play product id) for monthly.
  - **Product ID** `yearly` for yearly.
- **Offerings**: Create an Offering (e.g. "default") and attach packages that map to these product IDs (e.g. `$rc_monthly`, `$rc_annual`). The RevenueCat Paywall UI will display whatever you configure in the Paywall builder.

See [RevenueCat docs](https://www.revenuecat.com/docs/entitlements) and [Products](https://www.revenuecat.com/docs/products) for full setup.

### 3. Code usage

- **Context**: `useRevenueCat()` gives you:
  - `isSupported` – true on native when API key is set
  - `isPremium` – true if the user has the **Premium** entitlement
  - `customerInfo` – full RevenueCat customer info
  - `presentPaywall()` – show the dashboard-configured paywall
  - `presentPaywallIfNeeded({ requiredEntitlementIdentifier: 'Premium' })` – show paywall only if user doesn’t have Premium
  - `presentCustomerCenter()` – manage subscription / restore (Customer Center)
  - `restorePurchases()` – restore previous purchases

- **Settings**: The Settings panel shows a Subscription block on native: Premium status, “Upgrade to Premium” (presents paywall), “Manage subscription” (Customer Center), and “Restore purchases”.

- **Gating a premium feature**: Where you need to require Premium, call:

  ```js
  const { presentPaywallIfNeeded, isPremium } = useRevenueCat();
  // If not premium, show paywall (only presents when user lacks entitlement)
  if (!isPremium) {
    await presentPaywallIfNeeded();
    // After dismiss, check isPremium again if needed
  }
  ```

### 4. Paywall and Customer Center

- **Paywall**: Built in the [RevenueCat Paywalls](https://www.revenuecat.com/docs/tools/paywalls) dashboard. The app uses `RevenueCatUI.presentPaywall()` / `presentPaywallIfNeeded()` so the native paywall is shown from your dashboard configuration (templates, products, copy).
- **Customer Center**: [Customer Center](https://www.revenuecat.com/docs/tools/customer-center) is presented via `presentCustomerCenter()` from Settings so users can manage subscription and restore.

### 5. Best practices

- Configure once at app start (done in `RevenueCatProvider`).
- Identify users after login with `logIn(userId)` (handled in context when `user` changes).
- Use **entitlements** (e.g. `Premium`) to gate features, not product IDs.
- For “restore”, always offer a visible “Restore purchases” (e.g. in Settings); we do.
- Handle errors and loading in UI (Settings shows `revenueCatError` and loading states).

### 6. Files

| File | Role |
|------|------|
| `src/lib/revenuecat.js` | SDK wrapper: configure, logIn/logOut, getCustomerInfo, isPremium, presentPaywall, presentPaywallIfNeeded, presentCustomerCenter, restorePurchases |
| `src/contexts/RevenueCatContext.jsx` | React context: init, auth sync, customer info state, expose methods |
| `src/components/SettingsPanel.jsx` | Subscription section: status, Upgrade, Manage subscription, Restore |
| `.env` / `.env.example` | `REACT_APP_REVENUECAT_API_KEY` |

### 7. Products reference (your app)

- **Monthly**: product id `monthly` (configure in RevenueCat to match store product id).
- **Yearly**: product id `yearly`.
- **Entitlement**: `Premium` – attach both products to this entitlement in RevenueCat so either subscription unlocks Premium.
