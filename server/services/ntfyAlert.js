const config = require('../config');
const { getEffectiveNtfyTopic, recordLastNotification } = require('./settingsStore');
const { FACADE_LABELS } = require('./facadeCalc');

const DEFAULT_MESSAGE = '☀️ Die Sonne ist jetzt auf der {fassade}seite. Weg ca. {leaveTime} Uhr.';
const DEFAULT_LEAVE = '🌤️ Die Sonne ist nicht mehr auf der {fassade}seite. Auf der {naechsteFassade}seite wieder ca. {enterTime} Uhr.';

function formatMessage(template, facadeId, fallback, extras = {}) {
  const label = FACADE_LABELS[facadeId] || facadeId;
  let text = (template || fallback).trim() || fallback;
  text = text.replace(/\{fassade\}/gi, label);
  text = text.replace(/\{leaveTime\}/gi, extras.leaveTime ?? '–');
  text = text.replace(/\{enterTime\}/gi, extras.enterTime ?? '–');
  text = text.replace(/\{naechsteFassade\}/gi, extras.naechsteFassade ?? '–');
  return text;
}

function encodeNtfyHeader(value) {
  const text = String(value ?? '');
  if (!/[^\u0000-\u007F]/.test(text)) return text;
  return `=?UTF-8?B?${Buffer.from(text, 'utf8').toString('base64')}?=`;
}

async function sendNotification(title, message, options = {}) {
  const topic = getEffectiveNtfyTopic();
  if (!topic) {
    throw new Error('ntfy Topic fehlt – in der UI oder .env eintragen');
  }

  const server = (config.ntfy.server || 'https://ntfy.sh').replace(/\/$/, '');
  const url = `${server}/${encodeURIComponent(topic)}`;

  const headers = {
    'Content-Type': 'text/plain; charset=utf-8',
    Title: encodeNtfyHeader(title),
    Priority: String(options.priority ?? 4),
    Tags: options.tags ?? 'sun,solar',
  };

  if (config.ntfy.token) {
    headers.Authorization = `Bearer ${config.ntfy.token}`;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers,
      body: Buffer.from(message, 'utf8'),
      signal: controller.signal,
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`ntfy antwortete mit ${res.status}${text ? `: ${text.slice(0, 120)}` : ''}`);
    }

    recordLastNotification({
      title,
      message,
      event: options.event || 'test',
      facadeId: options.facadeId || null,
      sentAt: new Date().toISOString(),
    });

    return { method: 'ntfy', topic, server };
  } catch (err) {
    if (err.name === 'AbortError') {
      throw new Error('ntfy-Anfrage: Timeout');
    }
    throw err;
  } finally {
    clearTimeout(timeout);
  }
}

async function sendFacadeNotification(facadeId, customMessage = '', event = 'enter', extras = {}) {
  const label = FACADE_LABELS[facadeId] || facadeId;
  const isEnter = event !== 'leave';

  const message = formatMessage(
    customMessage,
    facadeId,
    isEnter ? DEFAULT_MESSAGE : DEFAULT_LEAVE,
    extras
  );

  return sendNotification(
    isEnter ? `WeatherGod - ${label}seite` : `WeatherGod - ${label}seite frei`,
    message,
    {
      priority: isEnter ? 4 : 2,
      tags: isEnter ? 'sun,arrow_up' : 'sun,arrow_down',
      event,
      facadeId,
    }
  );
}

async function sendTestNotification() {
  return sendNotification(
    'WeatherGod Test',
    'Manueller Test - ntfy funktioniert.',
    { priority: 3, tags: 'test,solar', event: 'test' }
  );
}

module.exports = {
  sendNotification,
  sendFacadeNotification,
  sendTestNotification,
  formatMessage,
  DEFAULT_MESSAGE,
  DEFAULT_LEAVE,
};
