# 📱 REFLECT – Capacitor iOS & TestFlight Guide

This guide covers building the REFLECT web app as a native iOS app with Capacitor and distributing it via TestFlight for testing.

---

## Prerequisites

- **macOS** with **Xcode** installed (from Mac App Store).
- **Node.js 18+** and **npm** or **yarn**.
- **Apple Developer account** (required for running on a physical device and for TestFlight).  
  Enroll at [developer.apple.com](https://developer.apple.com/programs/).

---

## 1. One-time setup (already done in this project)

Capacitor is already configured, and the **`frontend/ios`** folder is created by running `npx cap add ios` (so it appears after the first time you add the iOS platform). If you ever need to redo or verify:

| Setting        | Value           |
|----------------|-----------------|
| App name       | REFLECT         |
| App ID         | `com.reflect.app` |
| Web directory  | `build` (Create React App output) |

Installed packages: `@capacitor/core`, `@capacitor/ios`, `@capacitor/keyboard`, `@capacitor/local-notifications`, `@capacitor/status-bar`, and `@capacitor/cli` (dev).  
Config: `frontend/capacitor.config.json` (app id, plugins, status bar, iOS content inset).

**If you don’t see `frontend/ios`:** run from the `frontend` folder: `yarn install` (or `npm install`), then `yarn build` (or `npm run build`), then `npx cap add ios`. That creates the native iOS project.

**Important – use one package manager:** This project uses **yarn** (see `packageManager` in `frontend/package.json`). Use **`yarn install`** and **`yarn build`** in the `frontend` folder. If you mix npm and yarn, you can get "Module not found" for `@capacitor/core` or `@capacitor/status-bar`. There is no `package-lock.json`; use `yarn.lock` only.

---

## 2. Build and run on your iPhone

All commands below are from the **`frontend`** folder (not the repo root).

**Step 1 – Install dependencies**

```bash
cd frontend
yarn install
```

**Step 2 – Build the web app and sync to iOS**

```bash
yarn ios:sync
```

(or `npm run ios:sync` if you use npm). This runs `yarn build` then `npx cap sync ios`, copying the built app into the iOS project.

**Step 3 – Open the iOS project in Xcode**

```bash
yarn ios:open
```

(or `npx cap open ios`)

**Step 4 – In Xcode**

1. Select the **REFLECT** project in the left sidebar.
2. Select the **REFLECT** target.
3. Open **Signing & Capabilities**.
4. Check **Automatically manage signing**.
5. Choose your **Team** (your Apple ID / developer account).
6. Connect your iPhone and pick it as the run destination.
7. Click **Run** (▶️).

The app installs and launches on your device. The first time, you may need to trust the developer certificate on the device: **Settings → General → VPN & Device Management → [Your Developer App] → Trust**.

---

## 3. iOS permissions (notifications)

Local notifications are used for “revisit” reminders. The project should already have the right usage description; if notifications don’t prompt or work, check:

1. In Xcode, open **ios/App/App/Info.plist** (or the Info.plist for the app target).
2. Ensure you have a usage description for notifications if you added a custom one (e.g. “REFLECT uses notifications to remind you to revisit reflections”).
3. Under **Signing & Capabilities**, add **Push Notifications** only if you add push later; for **local** notifications you don’t need the Push Notifications capability.

If the app never asks for notification permission on device, confirm that `requestNotificationPermission()` in `frontend/src/lib/notifications.js` is called (e.g. when the user sets a “revisit” reminder). On native iOS, it uses `@capacitor/local-notifications`.

---

## 4. TestFlight – distribute to testers

### 4.1 Prepare the app in Xcode

1. In Xcode, set the run destination to **Any iOS Device (arm64)** (not a simulator).
2. **Product → Archive**.
3. Wait for the archive to finish. The **Organizer** window will open.

### 4.2 Distribute the archive

1. In Organizer, select the latest archive and click **Distribute App**.
2. Choose **App Store Connect** → **Next**.
3. Choose **Upload** → **Next**.
4. Leave options as default (e.g. upload symbols, manage version and build number) → **Next**.
5. Select your **distribution certificate** and **provisioning profile** (Xcode usually manages these if “Automatically manage signing” is on) → **Next**.
6. Click **Upload** and wait for the upload to complete.

### 4.3 Enable TestFlight and add testers

1. Go to [App Store Connect](https://appstoreconnect.apple.com) → your app **REFLECT** (create the app there first if you haven’t: **My Apps → + → New App**, platform iOS, name REFLECT, bundle ID `com.reflect.app`).
2. Open the **TestFlight** tab.
3. After processing (often 5–15 minutes), the new build appears under **iOS Builds**.
4. Add testers:
   - **Internal testing**: Add team members in **App Store Connect → Users and Access**; they get the build automatically (up to 100).
   - **External testing**: Create a group, add the build, submit for **Beta App Review** (first time). Once approved, add external testers by email (up to 10,000); they receive an invite to install via the TestFlight app.

Testers install **TestFlight** from the App Store, then open the invite link or the TestFlight app to install REFLECT.

---

## 5. Useful npm scripts (frontend)

| Script         | Command (from `frontend/`) | Description                          |
|----------------|----------------------------|--------------------------------------|
| Build + sync   | `npm run ios:sync`         | `npm run build` then `npx cap sync ios` |
| Open Xcode     | `npm run ios:open`         | `npx cap open ios`                   |
| Build + sync + open | `npm run ios:build`   | Build, sync, then open Xcode         |

After changing the web app, run `npm run ios:sync` (or `ios:build`) before running again from Xcode.

---

## 6. What works where

- **Browser**: The app still runs in the browser. Notification logic uses `Capacitor.isNativePlatform()`: on web it uses the Web Notifications API and in-app reminders; on iOS it uses `@capacitor/local-notifications`.
- **iOS device**: Full app with status bar styling, safe areas (notch/Dynamic Island), and local “revisit” notifications. Tapping a revisit notification opens the app and the corresponding reflection when `setOpenReflectionHandler` is registered in `App.js`.

---

## 7. Troubleshooting

- **"Module not found: Can't resolve '@capacitor/core'" (or status-bar / local-notifications)**  
  Always run install and build **from the `frontend` directory**: `cd frontend` then `yarn install` and `yarn build`. Use **one package manager** (this project uses **yarn**; no `package-lock.json`). If it persists, delete `frontend/node_modules` and run `yarn install` again from `frontend`. Webpack in `craco.config.js` resolves from `frontend/node_modules` first.

- **“No such module ‘Capacitor’” or build errors in Xcode**  
  Run from `frontend`: `yarn ios:sync`, then in Xcode **Product → Clean Build Folder**, then build again.

- **White screen or wrong content on device**  
  Ensure `webDir` in `capacitor.config.json` is `build` and that you ran `yarn build` before `npx cap sync ios`. Open the app in Xcode and run; don’t open the `build` folder directly.

- **Notifications don’t appear on device**  
  Confirm notification permission is requested (e.g. set a “revisit” reminder). Check **Settings → REFLECT → Notifications** on the device and allow notifications.

- **TestFlight build missing or “Processing”**  
  Wait 5–15 minutes after upload. If it’s still missing after 24 hours, check the build in App Store Connect for errors and ensure the bundle ID matches `com.reflect.app`.

---

## 8. Summary checklist

- [ ] Xcode and Apple Developer account set up  
- [ ] `cd frontend && yarn install && yarn ios:sync`  
- [ ] `yarn ios:open` → in Xcode: signing, device, Run  
- [ ] App runs on your iPhone  
- [ ] Notifications allowed and revisit reminder tested  
- [ ] For TestFlight: Product → Archive → Distribute to App Store Connect → Upload  
- [ ] App created in App Store Connect with bundle ID `com.reflect.app`  
- [ ] TestFlight tab: add internal/external testers and (for external) complete Beta App Review  

After this, you can run REFLECT on device and share builds via TestFlight without changing existing notification or web behavior.

---

## 9. Capacitor integration report (what was done)

Summary of the Capacitor setup so nothing is missed and builds stay production-ready:

| Item | Status |
|------|--------|
| **Packages** | `@capacitor/core`, `@capacitor/ios`, `@capacitor/keyboard`, `@capacitor/local-notifications`, `@capacitor/status-bar` in `dependencies`; `@capacitor/cli` in `devDependencies`. All in `frontend/package.json`. |
| **Config** | `frontend/capacitor.config.json`: appId `com.reflect.app`, appName REFLECT, webDir `build`, LocalNotifications + StatusBar plugin config, iOS contentInset. |
| **Webpack resolution** | `frontend/craco.config.js` sets `resolve.modules` so the first place webpack looks is `frontend/node_modules`. This fixes "Module not found" for `@capacitor/core` / `@capacitor/status-bar` when running from different cwd or with mixed package managers. |
| **Package manager** | Project uses **yarn** (`packageManager` in package.json). `package-lock.json` was removed to avoid mixing npm/yarn and resolution issues. Use `yarn install` and `yarn build` in `frontend`. |
| **Notifications** | `frontend/src/lib/notifications.js`: uses `Capacitor.isNativePlatform()` to branch; web = Web Notifications API; native = `@capacitor/local-notifications`. `setOpenReflectionHandler()` for native notification tap. No change to existing notification behavior, only platform detection. |
| **App.js** | StatusBar style and background set when native; `setOpenReflectionHandler` registered for revisit notification tap. One `useEffect` has an eslint-disable for exhaustive-deps so CI build passes without changing behavior. |
| **Safe area** | `viewport-fit=cover` in `public/index.html`; `env(safe-area-inset-*)` in `src/index.css` for notch/Dynamic Island. |
| **Scripts** | `cap:sync`, `ios:sync`, `ios:open`, `ios:build` in `frontend/package.json`. |
| **Build** | `yarn build` (or `npm run build`) compiles successfully with no errors; Capacitor modules resolve. |

**If you see "Module not found" for Capacitor again:** run from `frontend`: `yarn install` then `yarn build`. Do not mix npm and yarn; do not run install from the repo root if the root has its own package.json. If needed, delete `frontend/node_modules` and run `yarn install` again from `frontend`.
