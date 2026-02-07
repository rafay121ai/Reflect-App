/**
 * Revisit notifications: Web vs native (Capacitor).
 *
 * Web: setTimeout + Web Notifications API (fires when tab is open at remind_at;
 * if app was closed, user sees in-app banner via GET /api/reminders/due).
 *
 * Native (Capacitor): @capacitor/local-notifications so the notification fires
 * even when the app is closed. On tap, we call the registered open handler with reflection_id.
 */

import { Capacitor } from "@capacitor/core";

const NOTIFICATION_TITLE = "You wanted to come back to this reflection.";
const NOTIFICATION_BODY_DEFAULT = "Tap to open.";
const NOTIFICATION_TAG_PREFIX = "revisit-";

const isNative = Capacitor.isNativePlatform && Capacitor.isNativePlatform();

let openReflectionHandler = null;
let nativeListenerRegistered = false;

/**
 * Set the handler called when user taps a revisit notification (native only).
 * App should call this with (reflectionId) => openReflectionRef.current?.(reflectionId).
 */
export function setOpenReflectionHandler(fn) {
  openReflectionHandler = typeof fn === "function" ? fn : null;
}

async function ensureNativeListener() {
  if (!isNative || nativeListenerRegistered) return;
  try {
    const { LocalNotifications } = await import("@capacitor/local-notifications");
    await LocalNotifications.addListener("localNotificationActionPerformed", (event) => {
      const id = event.notification?.extra?.reflection_id;
      if (id && openReflectionHandler) openReflectionHandler(id);
    });
    nativeListenerRegistered = true;
  } catch (e) {
    console.warn("LocalNotifications listener failed:", e);
  }
}

/**
 * Request permission for notifications. Returns true if granted.
 */
export async function requestNotificationPermission() {
  if (isNative) {
    try {
      const { LocalNotifications } = await import("@capacitor/local-notifications");
      await ensureNativeListener();
      const perm = await LocalNotifications.requestPermissions();
      return perm?.display === "granted";
    } catch (e) {
      console.warn("Native notification permission failed:", e);
      return false;
    }
  }
  if (!("Notification" in window)) return false;
  if (Notification.permission === "granted") return true;
  if (Notification.permission === "denied") return false;
  const permission = await Notification.requestPermission();
  return permission === "granted";
}

let _revisitNotificationId = 1000;

/**
 * Schedule a one-time notification at remindAt (Date or ISO string).
 * When the user taps the notification, onOpenReflection(reflectionId) is called (web) or openReflectionHandler (native).
 */
export function scheduleRevisitNotification(reflectionId, remindAt, onOpenReflection, bodyMessage) {
  const at = typeof remindAt === "string" ? new Date(remindAt) : remindAt;
  const ms = at.getTime() - Date.now();
  if (ms <= 0) {
    if (typeof onOpenReflection === "function") onOpenReflection(reflectionId);
    return () => {};
  }
  const body = (bodyMessage && String(bodyMessage).trim()) ? String(bodyMessage).trim().slice(0, 200) : "Tap to open.";

  if (isNative) {
    (async () => {
      try {
        const { LocalNotifications } = await import("@capacitor/local-notifications");
        await ensureNativeListener();
        const granted = await requestNotificationPermission();
        if (!granted) return;
        const id = ++_revisitNotificationId;
        await LocalNotifications.schedule({
          notifications: [
            {
              id,
              title: NOTIFICATION_TITLE,
              body,
              schedule: { at: at.getTime() },
              extra: { reflection_id: reflectionId },
            },
          ],
        });
      } catch (e) {
        console.warn("LocalNotifications schedule failed:", e);
        if (typeof onOpenReflection === "function") onOpenReflection(reflectionId);
      }
    })();
    return () => {};
  }

  const tag = NOTIFICATION_TAG_PREFIX + reflectionId;
  const timeoutId = setTimeout(async () => {
    const granted = await requestNotificationPermission();
    if (!granted) return;
    try {
      const n = new Notification(NOTIFICATION_TITLE, {
        body,
        tag,
        icon: "/favicon.ico",
      });
      n.onclick = () => {
        window.focus();
        n.close();
        if (typeof onOpenReflection === "function") onOpenReflection(reflectionId);
      };
    } catch (e) {
      console.warn("Notification failed:", e);
      if (typeof onOpenReflection === "function") onOpenReflection(reflectionId);
    }
  }, Math.min(ms, 2147483647));
  return () => clearTimeout(timeoutId);
}
