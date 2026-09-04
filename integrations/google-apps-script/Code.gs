/**
 * Lector privado de notificaciones BMSC.
 * Configura estas propiedades desde Project Settings > Script properties:
 * SUPABASE_FUNCTION_URL, BMSC_INGEST_SECRET y HOUSEHOLD_ID.
 */
function processBankNotifications() {
  const properties = PropertiesService.getScriptProperties();
  const endpoint = properties.getProperty('SUPABASE_FUNCTION_URL');
  const secret = properties.getProperty('BMSC_INGEST_SECRET');
  const householdId = properties.getProperty('HOUSEHOLD_ID');
  if (!endpoint || !secret || !householdId) throw new Error('Faltan propiedades de configuración');

  const processedLabel = getOrCreateLabel_('finanzas-procesado');
  const errorLabel = getOrCreateLabel_('finanzas-error');
  const threads = GmailApp.search('from:(bmscsa@bmsc.com.bo) subject:(Notificaciones) newer_than:30d -label:finanzas-procesado -label:finanzas-error', 0, 50);

  threads.forEach(function(thread) {
    thread.getMessages().forEach(function(message) {
      if (message.isDraft()) return;
      try {
        const response = UrlFetchApp.fetch(endpoint, {
          method: 'post',
          contentType: 'application/json',
          headers: { 'x-ingest-secret': secret },
          payload: JSON.stringify({
            household_id: householdId,
            message_id: message.getId(),
            subject: message.getSubject(),
            body: message.getPlainBody()
          }),
          muteHttpExceptions: true
        });
        const status = response.getResponseCode();
        if (status < 200 || status >= 300) throw new Error('Supabase respondió ' + status + ': ' + response.getContentText());
        thread.addLabel(processedLabel);
        thread.removeLabel(errorLabel);
      } catch (error) {
        console.error(error);
        thread.addLabel(errorLabel);
      }
    });
  });
}

function installThirtyMinuteTrigger() {
  ScriptApp.getProjectTriggers().filter(function(trigger) {
    return trigger.getHandlerFunction() === 'processBankNotifications';
  }).forEach(function(trigger) { ScriptApp.deleteTrigger(trigger); });
  ScriptApp.newTrigger('processBankNotifications').timeBased().everyMinutes(30).create();
}

function getOrCreateLabel_(name) {
  return GmailApp.getUserLabelByName(name) || GmailApp.createLabel(name);
}
