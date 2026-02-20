/**
 * Eventos para notificar o bot quando a config é salva via API.
 */
const EventEmitter = require("events");
const configEvents = new EventEmitter();
module.exports = { configEvents };
