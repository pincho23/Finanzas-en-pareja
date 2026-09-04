import { Platform } from "react-native";

export function registerWebApp() {
  if (Platform.OS !== "web" || typeof window === "undefined" || !("serviceWorker" in navigator)) return;

  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/service-worker.js").catch(() => {
      // La aplicación sigue funcionando en línea aunque el navegador rechace el modo instalable.
    });
  });
}
