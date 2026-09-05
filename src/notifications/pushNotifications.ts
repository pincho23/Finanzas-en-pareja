import Constants, { ExecutionEnvironment } from "expo-constants";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import { supabase } from "../lib/supabase";

export type PushRegistrationStatus =
  | "checking"
  | "registered"
  | "expo-go"
  | "permission-denied"
  | "simulator"
  | "missing-project"
  | "web-ready"
  | "unsupported"
  | "error";

if (Platform.OS !== "web") {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldPlaySound: true,
      shouldSetBadge: false,
      shouldShowBanner: true,
      shouldShowList: true
    })
  });
}

export async function registerPushNotifications(householdId: string, userId: string): Promise<PushRegistrationStatus> {
  if (Platform.OS === "web") {
    if (typeof window === "undefined" || !("serviceWorker" in navigator) || !("PushManager" in window)) return "unsupported";
    if (Notification.permission === "denied") return "permission-denied";
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();
    if (!subscription) return "web-ready";
    if (!supabase) return "error";
    const { error } = await supabase.from("push_tokens").upsert({
      household_id: householdId,
      user_id: userId,
      token: JSON.stringify(subscription.toJSON()),
      platform: "web",
      updated_at: new Date().toISOString()
    }, { onConflict: "token" });
    return error ? "error" : "registered";
  }
  if (!supabase) return "error";
  if (Constants.executionEnvironment === ExecutionEnvironment.StoreClient) return "expo-go";
  if (!Device.isDevice) return "simulator";

  const current = await Notifications.getPermissionsAsync();
  const permission = current.status === "granted" ? current : await Notifications.requestPermissionsAsync();
  if (permission.status !== "granted") return "permission-denied";

  const projectId = Constants.easConfig?.projectId ?? Constants.expoConfig?.extra?.eas?.projectId;
  if (!projectId) return "missing-project";

  try {
    const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });
    const { error } = await supabase.from("push_tokens").upsert({
      household_id: householdId,
      user_id: userId,
      token: token,
      platform: Platform.OS,
      updated_at: new Date().toISOString()
    }, { onConflict: "token" });
    return error ? "error" : "registered";
  } catch {
    return "error";
  }
}

function urlBase64ToUint8Array(value: string) {
  const padding = "=".repeat((4 - value.length % 4) % 4);
  const base64 = (value + padding).replace(/-/g, "+").replace(/_/g, "/");
  const decoded = window.atob(base64);
  return Uint8Array.from(decoded, (character) => character.charCodeAt(0));
}

export async function enableWebPushNotifications(householdId: string, userId: string): Promise<PushRegistrationStatus> {
  if (Platform.OS !== "web" || !supabase || typeof window === "undefined" || !("serviceWorker" in navigator) || !("PushManager" in window)) return "unsupported";
  const publicKey = process.env.EXPO_PUBLIC_VAPID_PUBLIC_KEY?.trim();
  if (!publicKey) return "missing-project";

  try {
    const permission = await Notification.requestPermission();
    if (permission !== "granted") return "permission-denied";
    const registration = await navigator.serviceWorker.ready;
    const existing = await registration.pushManager.getSubscription();
    const subscription = existing ?? await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey)
    });
    const { error } = await supabase.from("push_tokens").upsert({
      household_id: householdId,
      user_id: userId,
      token: JSON.stringify(subscription.toJSON()),
      platform: "web",
      updated_at: new Date().toISOString()
    }, { onConflict: "token" });
    return error ? "error" : "registered";
  } catch {
    return "error";
  }
}

export const pushStatusText: Record<PushRegistrationStatus, string> = {
  checking: "Comprobando el dispositivo…",
  registered: "Avisos de ingresos y gastos activados.",
  "expo-go": "Requiere instalar la compilación de desarrollo.",
  "permission-denied": "Permiso desactivado en el iPhone.",
  simulator: "Las notificaciones requieren un teléfono físico.",
  "missing-project": "Falta completar la configuración de notificaciones.",
  "web-ready": "Pulsa Activar avisos para recibir movimientos aunque la app esté cerrada.",
  unsupported: "Este navegador no permite notificaciones para esta aplicación.",
  error: "No se pudo registrar este dispositivo."
};
