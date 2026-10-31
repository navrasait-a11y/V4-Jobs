/**
 * Importing these modules registers their background-job handlers with the queue
 * (email.send, sms.send, whatsapp.send, push.send, notify.one ...). Both the API process and the
 * standalone worker import this file.
 */
import '../modules/notifications/notification.service.js';
