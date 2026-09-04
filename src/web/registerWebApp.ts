import { Platform } from "react-native";

export function registerWebApp() {
  if (Platform.OS !== "web" || typeof window === "undefined" || !("serviceWorker" in navigator)) return;

  window.addEventListener("load", () => {
    const basePath = window.location.hostname.endsWith("github.io") ? "/Finanzas-en-pareja" : "";
    navigator.serviceWorker.register(`${basePath}/service-worker.js`).catch(() => {
      // La aplicación sigue funcionando en línea aunque el navegador rechace el modo instalable.
    });
  });
}
