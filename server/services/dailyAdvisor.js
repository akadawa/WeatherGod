function adviseLevel(score) {
  if (score >= 3) return { level: 'important', className: 'important', label: 'Empfohlen' };
  if (score >= 2) return { level: 'recommended', className: 'recommended', label: 'Sinnvoll' };
  if (score >= 1) return { level: 'optional', className: 'optional', label: 'Optional' };
  return { level: 'none', className: 'none', label: 'Nicht nötig' };
}

function card(id, icon, title, headline, detail, score) {
  const status = adviseLevel(score);
  return {
    id,
    icon,
    title,
    headline,
    detail,
    score,
    ...status,
  };
}

function parseHourLabel(timeLabel) {
  return timeLabel || '–';
}

function findUpcomingRain(hourly, hoursAhead = 12) {
  const now = Date.now();
  let best = null;

  for (const hour of hourly.slice(0, hoursAhead)) {
    const t = new Date(hour.time).getTime();
    if (Number.isNaN(t) || t < now - 15 * 60 * 1000) continue;

    const prob = hour.precipProb ?? 0;
    const precip = hour.precipitation ?? 0;
    if (precip > 0.2 || prob >= 55) {
      best = hour;
      break;
    }
    if (!best && prob >= 35) best = hour;
  }

  return best;
}

function isDaylightNow(today, now = new Date()) {
  if (!today?.sunrise || !today?.sunset) return true;
  const [sh, sm] = today.sunrise.split(':').map(Number);
  const [eh, em] = today.sunset.split(':').map(Number);
  if ([sh, sm, eh, em].some(Number.isNaN)) return true;
  const minutes = now.getHours() * 60 + now.getMinutes();
  const start = sh * 60 + sm;
  const end = eh * 60 + em;
  return minutes >= start && minutes <= end;
}

function buildSunCard({ current, today, sunshine }) {
  const uv = today?.uvMax ?? sunshine?.uvMax ?? null;
  const daylight = isDaylightNow(today);
  let score = 0;
  const parts = [];

  if (uv != null && daylight) {
    if (uv >= 8) {
      score = 3;
      parts.push(`UV ${uv.toString().replace('.', ',')}`);
      parts.push('Sonnencreme');
    } else if (uv >= 5) {
      score = 2;
      parts.push(`UV ${uv.toString().replace('.', ',')}`);
      parts.push('Sonnencreme sinnvoll');
    } else if (uv >= 3) {
      score = 2;
      parts.push(`UV ${uv.toString().replace('.', ',')}`);
    } else if (uv >= 1) {
      score = 1;
      parts.push(`UV ${uv.toString().replace('.', ',')}`);
    }
  }

  if (!daylight) {
    return card('sun', '🌙', 'Sonne', 'Keine Sonnenbrille nötig', 'Sonne unter dem Horizont', 0);
  }

  if (score >= 2) {
    return card(
      'sun',
      '🕶️',
      'Sonne',
      'Sonnenbrille mitnehmen',
      parts.join(' · ') || 'Hohe Sonnenintensität',
      score
    );
  }

  if (score === 1) {
    return card('sun', '🕶️', 'Sonne', 'Sonnenbrille optional', parts.join(' · '), score);
  }

  const label = current?.label || 'Bewölkt';
  return card('sun', '☁️', 'Sonne', 'Keine Sonnenbrille nötig', `${label}${uv != null ? ` · UV ${uv.toString().replace('.', ',')}` : ''}`, 0);
}

function buildClothingCard({ current, today, snow }) {
  const feels = current?.feelsLike ?? current?.temperature ?? null;
  const tempMin = today?.tempMin ?? null;
  const wind = current?.windSpeed ?? 0;
  const snowToday = snow?.snowfallToday ?? 0;
  const parts = [];
  let score = 1;
  let headline = 'Kurze Kleidung reicht';
  let icon = '👕';

  if (feels == null) {
    return card('clothing', '👕', 'Anziehen', '–', 'Keine Temperaturdaten', 0);
  }

  if (snowToday >= 1 || (feels <= 2 && snow?.snowDepth > 0)) {
    headline = 'Warm anziehen · Winterjacke';
    parts.push('Geschlossene Schuhe');
    if (snowToday >= 1) parts.push(`${snowToday.toString().replace('.', ',')} cm Schnee`);
    return card('clothing', '🧥', 'Anziehen', headline, parts.join(' · '), 3);
  }

  if (feels >= 28) {
    headline = 'Leichte Kurzbekleidung';
    parts.push(`Gefühlt ${feels}°`);
    parts.push('Viel trinken');
    score = 2;
    icon = '🩳';
  } else if (feels >= 22) {
    headline = 'Kurze Kleidung reicht';
    parts.push(`Gefühlt ${feels}°`);
    icon = '👕';
  } else if (feels >= 16) {
    headline = 'Kurz mit leichter Schicht';
    parts.push(`Gefühlt ${feels}°`);
    if (wind >= 20) {
      parts.push('Windjacke sinnvoll');
      score = 2;
    } else {
      score = 1;
    }
    icon = '👔';
  } else if (feels >= 10) {
    headline = 'Lange Kleidung · Jacke';
    parts.push(`Gefühlt ${feels}°`);
    score = 2;
    icon = '🧥';
  } else {
    headline = 'Warm anziehen';
    parts.push(`Gefühlt ${feels}°`);
    score = 3;
    icon = '🧣';
  }

  if (wind >= 30) {
    parts.push(`Wind ${wind} km/h`);
    score = Math.max(score, 2);
  }

  if (tempMin != null && tempMin <= 14 && feels >= 18) {
    parts.push(`Abends bis ${tempMin.toString().replace('.', ',')}°`);
    score = Math.max(score, 2);
    if (!headline.includes('Jacke')) headline = `${headline} · abends Jacke`;
  }

  return card('clothing', icon, 'Anziehen', headline, parts.join(' · '), score);
}

function buildRainCard({ current, today, hourly }) {
  const rainNow = (current?.precipitation ?? 0) > 0.1;
  const rainDay = (today?.precipitation ?? 0) >= 1;
  const upcoming = findUpcomingRain(hourly, 14);
  const parts = [];
  let score = 0;
  let headline = 'Kein Regenschirm nötig';
  let icon = '☀️';

  if (rainNow) {
    score = 3;
    headline = 'Regenschirm jetzt mitnehmen';
    icon = '☔';
    parts.push('Es regnet gerade');
    parts.push('Regenjacke');
  } else if (upcoming && (upcoming.precipProb >= 55 || (upcoming.precipitation ?? 0) > 0.2)) {
    score = 2;
    headline = `Regenschirm ab ${parseHourLabel(upcoming.timeLabel)}`;
    icon = '☔';
    parts.push(`${upcoming.precipProb ?? '–'} % Regenwahrscheinlichkeit`);
    parts.push('Regenjacke einplanen');
  } else if (upcoming && upcoming.precipProb >= 35) {
    score = 1;
    headline = 'Regenschirm optional';
    icon = '🌦️';
    parts.push(`Ab ${parseHourLabel(upcoming.timeLabel)} möglich (${upcoming.precipProb} %)`);
  } else if (rainDay) {
    score = 1;
    headline = 'Taschenschirm optional';
    icon = '🌦️';
    parts.push(`${today.precipitation.toString().replace('.', ',')} mm heute erwartet`);
  } else {
    parts.push('Heute weitgehend trocken');
  }

  return card('rain', icon, 'Regen', headline, parts.join(' · '), score);
}

function buildComfortCard({ current, today, warnings }) {
  const feels = current?.feelsLike ?? current?.temperature ?? null;
  const humidity = current?.humidity ?? null;
  const tempMax = today?.tempMax ?? null;
  const parts = [];
  let score = 0;
  let headline = 'Angenehm draußen';
  let icon = '🙂';

  const heatWarning = warnings?.items?.some((w) =>
    /hitze|warm|temperatur/i.test(`${w.title} ${w.detail}`)
  );

  if (heatWarning || (tempMax != null && tempMax >= 32) || (feels != null && feels >= 30)) {
    score = 3;
    headline = 'Hitze · Schatten & trinken';
    icon = '🥵';
    if (tempMax != null) parts.push(`Max ${tempMax.toString().replace('.', ',')}°`);
    parts.push('Mittags meiden');
  } else if (feels != null && feels >= 26) {
    score = 2;
    headline = 'Warm · ausreichend trinken';
    icon = '💧';
    parts.push(`Gefühlt ${feels}°`);
  } else if (feels != null && feels <= 5) {
    score = 2;
    headline = 'Kühl · winddicht anziehen';
    icon = '🥶';
    parts.push(`Gefühlt ${feels}°`);
  } else if (humidity != null && humidity >= 75 && feels != null && feels >= 22) {
    score = 1;
    headline = 'Schwül draußen';
    icon = '💦';
    parts.push(`${humidity} % Luftfeuchte`);
  } else {
    if (feels != null) parts.push(`Gefühlt ${feels}°`);
    if (humidity != null) parts.push(`${humidity} % Luftfeuchte`);
  }

  return card('comfort', icon, 'Komfort', headline, parts.join(' · ') || 'Keine Besonderheiten', score);
}

function buildPollenCard({ pollen }) {
  if (!pollen?.available || !pollen.items?.length) {
    return card('pollen', '🌿', 'Pollen', 'Keine Pollendaten', pollen?.note || 'Für den Standort nicht verfügbar', 0);
  }

  const high = pollen.items.filter((item) => item.level?.className === 'high');
  const medium = pollen.items.filter((item) => item.level?.className === 'medium');

  if (high.length) {
    return card(
      'pollen',
      '🤧',
      'Pollen',
      'Schutz für Allergiker',
      `Hoch: ${high.map((i) => i.label).join(', ')}`,
      3
    );
  }

  if (medium.length) {
    return card(
      'pollen',
      '🌼',
      'Pollen',
      'Empfindliche Personen aufpassen',
      `Mittel: ${medium.map((i) => i.label).join(', ')}`,
      2
    );
  }

  return card('pollen', '✅', 'Pollen', 'Geringe Belastung', 'Heute unbedenklich für die meisten', 0);
}

function buildSummary({ current, today, hourly, cards }) {
  const feels = current?.feelsLike ?? current?.temperature;
  const upcoming = findUpcomingRain(hourly, 14);
  const parts = [];

  if (feels != null) {
    if (feels >= 28) parts.push('heiß');
    else if (feels >= 20) parts.push('warm');
    else if (feels >= 12) parts.push('mild');
    else parts.push('kühl');
  }

  const rainCard = cards.find((c) => c.id === 'rain');
  if (rainCard?.score >= 3) parts.push('nass');
  else if (rainCard?.score >= 2) parts.push('Regen später');
  else parts.push('trocken');

  const sunCard = cards.find((c) => c.id === 'sun');
  if (sunCard?.score >= 2) parts.push('sonnig');
  else if (today?.label) parts.push(today.label.toLowerCase());

  if (!parts.length) return 'Heute: Wetter prüfen und passend anziehen.';

  const headline = parts.slice(0, 3).join(', ');
  const suffix = today?.tempMax != null && today?.tempMin != null
    ? ` · ${today.tempMax.toString().replace('.', ',')}° / ${today.tempMin.toString().replace('.', ',')}°`
    : '';

  if (upcoming && rainCard?.score >= 2 && upcoming.timeLabel) {
    return `Heute: ${headline}${suffix} · Regen ab ${upcoming.timeLabel}.`;
  }

  return `Heute: ${headline}${suffix}.`;
}

function buildAdvisorBlock({ current, today, sunshine, snow, hourly, pollen, warnings }) {
  const cards = [
    buildSunCard({ current, today, sunshine }),
    buildClothingCard({ current, today, snow }),
    buildRainCard({ current, today, hourly }),
    buildComfortCard({ current, today, warnings }),
    buildPollenCard({ pollen }),
  ];

  return {
    summary: buildSummary({ current, today, hourly, cards }),
    cards,
    compactCardIds: ['sun', 'clothing', 'rain'],
  };
}

module.exports = { buildAdvisorBlock };
