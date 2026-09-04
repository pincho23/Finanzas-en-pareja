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
  | "web-pending"
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
  if (Platform.OS === "web") return "web-pending";
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

export const pushStatusText: Record<PushRegistrationStatus, string> = {
  checking: "Comprobando el dispositivo…",
  registered: "Avisos de ingresos y gastos activados.",
  "expo-go": "Requiere instalar la compilación de desarrollo.",
  "permission-denied": "Permiso desactivado en el iPhone.",
  simulator: "Las notificaciones requieren un teléfono físico.",
  "missing-project": "Falta vincular la app con Expo.",
  "web-pending": "Aplicación web lista. Las notificaciones web se activarán en el siguiente paso.",
  error: "No se pudo registrar este dispositivo."
};
