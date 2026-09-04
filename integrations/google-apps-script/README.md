# Integración Gmail - BMSC

Este script revisa cada 30 minutos solo mensajes enviados por `bmscsa@bmsc.com.bo` con asunto `Notificaciones`, procesa hasta 50 conversaciones recientes y les añade la etiqueta `finanzas-procesado`.

Los mensajes que no tengan un formato reconocido reciben la etiqueta `finanzas-error` y quedan fuera de las siguientes revisiones, evitando reintentos y consumo innecesario.

No guarda el cuerpo del correo en Supabase. Envía el mensaje al receptor seguro para extraer importe, fecha, tipo, comercio y últimos cuatro dígitos. La huella del identificador de Gmail evita duplicados.

## Propiedades requeridas

- `SUPABASE_FUNCTION_URL`: URL de la función `ingest-bmsc-email`.
- `BMSC_INGEST_SECRET`: secreto compartido generado para esta instalación.
- `HOUSEHOLD_ID`: identificador UUID del hogar creado en la aplicación.

Después de configurarlas, ejecutar una vez `processBankNotifications` para probar y luego `installThirtyMinuteTrigger` para activar la revisión automática.
