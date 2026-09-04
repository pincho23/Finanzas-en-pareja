# Finanzas en Pareja

Aplicacion movil privada para registrar, clasificar y analizar los movimientos de una cuenta familiar.

## Estado actual

- Base Expo/React Native para iOS y Android.
- Parser probado para notificaciones BMSC de ACH debito, ACH credito, POS y ATM.
- Modelo Supabase multiusuario con seguridad por hogar.
- Datos bancarios sensibles reducidos a los ultimos cuatro digitos.

## Desarrollo local

1. Instalar dependencias con `npm install`.
2. Copiar `.env.example` a `.env` y completar las credenciales publicas de Supabase.
3. Ejecutar `npm start` y abrir el codigo QR con Expo Go.
4. Ejecutar `npm run test:parser` para validar los formatos bancarios.

### Aplicacion web instalable

1. Ejecutar `npm run web` para probarla en el navegador.
2. Ejecutar `npm run build:web` para generar la version publicable en `dist/`.
3. Una vez publicada mediante HTTPS, abrirla en Safari y seleccionar **Compartir → Agregar a pantalla de inicio**.

La version web conserva el acceso y los datos de Supabase. El registro de notificaciones web se implementa por separado del registro nativo de Expo.

La aplicacion usa `EXPO_PUBLIC_SUPABASE_URL` y `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY`. La clave secreta nunca debe copiarse al proyecto movil.

Los PDF de ejemplo son material de entrada y no se incorporan a la aplicacion ni se envian a Supabase.
