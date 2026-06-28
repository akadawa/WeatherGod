const { buildWeatherWarnings } = require('./weatherWarnings');
const { buildAdvisorBlock } = require('./dailyAdvisor');
const SunCalc = require('suncalc');
const CACHE_MS = 10 * 60 * 1000;
const HISTORY_CACHE_MS = 24 * 60 * 60 * 1000;
const HISTORY_CACHE_MAX_ENTRIES = 48;
const HISTORY_MIN_YEAR = 1940;
const HISTORY_PRESET_OFFSETS = [1, 3, 5, 10, 20, 30, 40, 50];
const cache = new Map();
const historyCache = new Map();

const WMO_WEATHER = {
  0: { label: 'Klar', icon: '☀️', scene: 'clear' },
  1: { label: 'Meist klar', icon: '🌤️', scene: 'mostly-clear' },
  2: { label: 'Teilweise bewölkt', icon: '⛅', scene: 'partly-cloudy' },
  3: { label: 'Bewölkt', icon: '☁️', scene: 'cloudy' },
  45: { label: 'Nebel', icon: '🌫️', scene: 'fog' },
  48: { label: 'Reifnebel', icon: '🌫️', scene: 'fog' },
  51: { label: 'Leichter Nieselregen', icon: '🌦️', scene: 'rain' },
  53: { label: 'Nieselregen', icon: '🌦️', scene: 'rain' },
  55: { label: 'Starker Nieselregen', icon: '🌧️', scene: 'rain' },
  56: { label: 'Leichter gefrierender Nieselregen', icon: '🌧️', scene: 'rain' },
  57: { label: 'Starker gefrierender Nieselregen', icon: '🌧️', scene: 'rain' },
  61: { label: 'Leichter Regen', icon: '🌧️', scene: 'rain' },
  63: { label: 'Regen', icon: '🌧️', scene: 'rain' },
  65: { label: 'Starker Regen', icon: '🌧️', scene: 'rain' },
  66: { label: 'Leichter gefrierender Regen', icon: '🌧️', scene: 'rain' },
  67: { label: 'Starker gefrierender Regen', icon: '🌧️', scene: 'rain' },
  71: { label: 'Leichter Schneefall', icon: '🌨️', scene: 'snow' },
  73: { label: 'Schneefall', icon: '🌨️', scene: 'snow' },
  75: { label: 'Starker Schneefall', icon: '🌨️', scene: 'snow' },
  77: { label: 'Schneegriesel', icon: '🌨️', scene: 'snow' },
  80: { label: 'Leichte Regenschauer', icon: '🌦️', scene: 'showers' },
  81: { label: 'Regenschauer', icon: '🌦️', scene: 'showers' },
  82: { label: 'Starke Regenschauer', icon: '🌧️', scene: 'showers' },
  85: { label: 'Leichte Schneeschauer', icon: '🌨️', scene: 'snow' },
  86: { label: 'Starke Schneeschauer', icon: '🌨️', scene: 'snow' },
  95: { label: 'Gewitter', icon: '⛈️', scene: 'thunder' },
  96: { label: 'Gewitter mit leichtem Hagel', icon: '⛈️', scene: 'thunder' },
  99: { label: 'Gewitter mit schwerem Hagel', icon: '⛈️', scene: 'thunder' },
};

const POLLEN_TYPES = [
  { key: 'grass_pollen', label: 'Gräser' },
  { key: 'birch_pollen', label: 'Birke' },
  { key: 'alder_pollen', label: 'Erle' },
  { key: 'olive_pollen', label: 'Olive' },
  { key: 'ragweed_pollen', label: 'Ambrosia' },
  { key: 'mugwort_pollen', label: 'Beifuß' },
];

function cacheKey(lat, lon) {
  return `${lat.toFixed(3)}:${lon.toFixed(3)}`;
}

function forecastSceneClass(code) {
  const entry = WMO_WEATHER[code];
  if (!entry) return 'is-scene-cloudy';
  return `is-scene-${entry.scene}`;
}

function weatherInfo(code) {
  const entry = WMO_WEATHER[code];
  return {
    code,
    label: entry?.label ?? 'Unbekannt',
    icon: entry?.icon ?? '🌡️',
    sceneClass: forecastSceneClass(code),
  };
}

function getWmoWeatherCatalog() {
  return Object.entries(WMO_WEATHER)
    .map(([code, info]) => ({
      code: Number(code),
      label: info.label,
      icon: info.icon,
      sceneClass: `is-scene-${info.scene}`,
    }))
    .sort((a, b) => a.code - b.code);
}

function pollenLevel(value) {
  if (value == null || Number.isNaN(value)) return { label: '–', className: 'none' };
  if (value < 10) return { label: 'Gering', className: 'low' };
  if (value < 50) return { label: 'Mittel', className: 'medium' };
  return { label: 'Hoch', className: 'high' };
}

function uvLevel(value) {
  if (value == null || Number.isNaN(value)) return { label: '–', className: 'none' };
  if (value < 3) return { label: 'Niedrig', className: 'low' };
  if (value < 6) return { label: 'Mäßig', className: 'moderate' };
  if (value < 8) return { label: 'Hoch', className: 'high' };
  if (value < 11) return { label: 'Sehr hoch', className: 'very-high' };
  return { label: 'Extrem', className: 'extreme' };
}

const SNOW_WEATHER_CODES = new Set([71, 73, 75, 77, 85, 86]);

function snowAmountLevel(cm) {
  if (cm == null || Number.isNaN(cm) || cm <= 0) return { label: 'Kein Schnee', className: 'none' };
  if (cm < 2) return { label: 'Leicht', className: 'light' };
  if (cm < 5) return { label: 'Mäßig', className: 'moderate' };
  if (cm < 10) return { label: 'Stark', className: 'heavy' };
  return { label: 'Sehr stark', className: 'very-heavy' };
}

function snowDepthLevel(cm) {
  if (cm == null || Number.isNaN(cm) || cm <= 0) return { label: 'Keine Decke', className: 'none' };
  if (cm < 5) return { label: 'Dünn', className: 'light' };
  if (cm < 15) return { label: 'Mittel', className: 'moderate' };
  if (cm < 30) return { label: 'Hoch', className: 'heavy' };
  return { label: 'Sehr hoch', className: 'very-heavy' };
}

function snowDepthCm(meters) {
  if (meters == null || Number.isNaN(meters)) return null;
  return round1(meters * 100);
}

function maxSnowDepthCmForDate(hourlyPayload, dateStr) {
  if (!hourlyPayload?.time?.length || !dateStr) return null;
  let maxMeters = null;
  for (let i = 0; i < hourlyPayload.time.length; i += 1) {
    if (!hourlyPayload.time[i].startsWith(dateStr)) continue;
    const depth = hourlyPayload.snow_depth?.[i];
    if (depth == null || Number.isNaN(depth)) continue;
    maxMeters = maxMeters == null ? depth : Math.max(maxMeters, depth);
  }
  return maxMeters == null ? null : snowDepthCm(maxMeters);
}

function formatSunCalcTime(date, timezone) {
  if (!date || Number.isNaN(date.getTime())) return null;
  return date.toLocaleTimeString('de-DE', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: timezone || undefined,
  });
}

function twilightWindowFillPercent(now, start, end) {
  if (!start || !end || Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return 0;
  const t = now.getTime();
  const s = start.getTime();
  const e = end.getTime();
  if (e <= s || t <= s) return 0;
  if (t >= e) return 100;
  return Math.min(100, Math.round(((t - s) / (e - s)) * 100));
}

function isValidSunTime(date) {
  return date && !Number.isNaN(date.getTime());
}

function twilightPhaseEntry(id, label, time, timezone, options = {}) {
  if (!isValidSunTime(time)) {
    return {
      id,
      label,
      time: 'Entfällt',
      note: options.unavailableHint || 'Zu dieser Jahreszeit nicht vollständig dunkel',
      ts: null,
      unavailable: true,
    };
  }
  return {
    id,
    label,
    time: formatSunCalcTime(time, timezone),
    ts: time.getTime(),
    unavailable: false,
  };
}

function resolveTwilightActivePhase(now, times) {
  const t = now.getTime();
  const hasAstronomicalNight = isValidSunTime(times.nightEnd) && isValidSunTime(times.night);

  if (!hasAstronomicalNight && isValidSunTime(times.nauticalDusk) && isValidSunTime(times.nauticalDawn)) {
    const dusk = times.nauticalDusk.getTime();
    const dawn = times.nauticalDawn.getTime();
    if (dusk < dawn) {
      if (t >= dusk && t < dawn) {
        return { id: 'brightNight', label: 'Helle Sommernacht (keine astro. Nacht)' };
      }
    } else if (t >= dusk || t < dawn) {
      return { id: 'brightNight', label: 'Helle Sommernacht (keine astro. Nacht)' };
    }
  }

  const ranges = [
    { id: 'night', label: 'Nacht', start: times.night, end: times.nightEnd },
    { id: 'nightEnd', label: 'Astronomische Morgendämmerung', start: times.nightEnd, end: times.nauticalDawn },
    { id: 'nauticalDawn', label: 'Nautische Morgendämmerung', start: times.nauticalDawn, end: times.dawn },
    { id: 'dawn', label: 'Bürgerliche Morgendämmerung', start: times.dawn, end: times.sunrise },
    { id: 'goldenHourMorning', label: 'Goldene Stunde (Morgen)', start: times.sunrise, end: times.goldenHourEnd },
    { id: 'day', label: 'Tageslicht', start: times.goldenHourEnd, end: times.goldenHour },
    { id: 'goldenHourEvening', label: 'Goldene Stunde (Abend)', start: times.goldenHour, end: times.sunset },
    { id: 'dusk', label: 'Bürgerliche Abenddämmerung', start: times.sunset, end: times.dusk },
    { id: 'nauticalDusk', label: 'Nautische Abenddämmerung', start: times.dusk, end: times.nauticalDusk },
    { id: 'night', label: 'Nacht', start: times.nauticalDusk, end: times.night },
  ];

  for (const range of ranges) {
    if (!range.start || !range.end || Number.isNaN(range.start.getTime()) || Number.isNaN(range.end.getTime())) {
      continue;
    }
    const start = range.start.getTime();
    const end = range.end.getTime();
    if (end > start) {
      if (t >= start && t < end) return { id: range.id, label: range.label };
      continue;
    }
    if (t >= start || t < end) return { id: range.id, label: range.label };
  }

  return { id: 'day', label: 'Tageslicht' };
}

function buildTwilightBlock(lat, lon, dateStr, timezone) {
  const date = new Date(`${dateStr}T12:00:00`);
  const times = SunCalc.getTimes(date, lat, lon);
  const now = new Date();
  const hasAstronomicalNight = isValidSunTime(times.nightEnd) && isValidSunTime(times.night);
  const active = resolveTwilightActivePhase(now, times);
  const whiteNightHint = 'Keine astro. Nacht';

  const morning = [
    twilightPhaseEntry('nightEnd', 'Nachtende', times.nightEnd, timezone, { unavailableHint: whiteNightHint }),
    twilightPhaseEntry('nauticalDawn', 'Nautische Dämmerung', times.nauticalDawn, timezone),
    twilightPhaseEntry('dawn', 'Bürgerliche Dämmerung', times.dawn, timezone),
    twilightPhaseEntry('sunrise', 'Sonnenaufgang', times.sunrise, timezone),
    twilightPhaseEntry('goldenHourEnd', 'Ende goldene Stunde', times.goldenHourEnd, timezone),
  ];

  const evening = [
    twilightPhaseEntry('goldenHour', 'Goldene Stunde', times.goldenHour, timezone),
    twilightPhaseEntry('sunset', 'Sonnenuntergang', times.sunset, timezone),
    twilightPhaseEntry('dusk', 'Bürgerliche Dämmerung', times.dusk, timezone),
    twilightPhaseEntry('nauticalDusk', 'Nautische Dämmerung', times.nauticalDusk, timezone),
    twilightPhaseEntry('night', 'Nachtbeginn', times.night, timezone, { unavailableHint: whiteNightHint }),
  ];

  const solarNoon = twilightPhaseEntry('solarNoon', 'Sonnenhöchststand', times.solarNoon, timezone);

  const goldenMorning = times.sunrise && times.goldenHourEnd && !Number.isNaN(times.sunrise.getTime())
    ? {
      start: formatSunCalcTime(times.sunrise, timezone),
      end: formatSunCalcTime(times.goldenHourEnd, timezone),
      fillPercent: twilightWindowFillPercent(now, times.sunrise, times.goldenHourEnd),
      active: active.id === 'goldenHourMorning',
    }
    : null;

  const goldenEvening = times.goldenHour && times.sunset && !Number.isNaN(times.goldenHour.getTime())
    ? {
      start: formatSunCalcTime(times.goldenHour, timezone),
      end: formatSunCalcTime(times.sunset, timezone),
      fillPercent: twilightWindowFillPercent(now, times.goldenHour, times.sunset),
      active: active.id === 'goldenHourEvening',
    }
    : null;

  return {
    date: dateStr,
    activePhaseId: active.id,
    activeLabel: active.label,
    hasAstronomicalNight,
    whiteNightNote: hasAstronomicalNight
      ? null
      : 'Heute entfällt die astronomische Nacht – die Sonne sinkt nicht unter −18°.',
    solarNoon,
    morning,
    evening,
    goldenHour: {
      morning: goldenMorning,
      evening: goldenEvening,
    },
  };
}

function round1(n) {
  return Math.round(n * 10) / 10;
}

function historyCacheKey(lat, lon, date) {
  return `${lat.toFixed(3)}:${lon.toFixed(3)}:${date}`;
}

function referenceYear(referenceDate) {
  return parseInt(referenceDate.slice(0, 4), 10);
}

function dateForYear(referenceDate, targetYear) {
  const [, month, day] = referenceDate.split('-');
  const monthNum = parseInt(month, 10);
  const candidate = `${targetYear}-${month}-${day}`;
  const test = new Date(`${candidate}T12:00:00`);

  if (Number.isNaN(test.getTime()) || test.getMonth() + 1 !== monthNum) {
    const lastDay = new Date(targetYear, monthNum, 0).getDate();
    return `${targetYear}-${month}-${String(lastDay).padStart(2, '0')}`;
  }

  return candidate;
}

function formatDateLabel(dateStr) {
  return new Date(`${dateStr}T12:00:00`).toLocaleDateString('de-DE', {
    day: 'numeric',
    month: 'long',
  });
}

function formatWeekdayShort(dateStr) {
  const labels = ['SO', 'MO', 'DI', 'MI', 'DO', 'FR', 'SA'];
  return labels[new Date(`${dateStr}T12:00:00`).getDay()];
}

function formatTimeFromIso(isoString) {
  if (!isoString) return null;
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
}

function formatHistoryDay(dateStr, daily, index) {
  return {
    date: dateStr,
    year: parseInt(dateStr.slice(0, 4), 10),
    weekday: new Date(`${dateStr}T12:00:00`).toLocaleDateString('de-DE', { weekday: 'short' }),
    dateLabel: formatDateLabel(dateStr),
    ...weatherInfo(daily.weather_code[index]),
    tempMax: round1(daily.temperature_2m_max[index]),
    tempMin: round1(daily.temperature_2m_min[index]),
    precipitation: round1(daily.precipitation_sum[index]),
    sunshineHours: round1((daily.sunshine_duration[index] || 0) / 3600),
    sunrise: formatTimeFromIso(daily.sunrise?.[index]),
    sunset: formatTimeFromIso(daily.sunset?.[index]),
  };
}

function tempDelta(today, past) {
  if (!today || !past) return null;
  const todayAvg = (today.tempMax + today.tempMin) / 2;
  const pastAvg = (past.tempMax + past.tempMin) / 2;
  return round1(todayAvg - pastAvg);
}

async function loadHistoricalDay(lat, lon, dateStr) {
  const key = historyCacheKey(lat, lon, dateStr);
  const hit = historyCache.get(key);
  if (hit && Date.now() - hit.at < HISTORY_CACHE_MS) {
    return hit.data;
  }

  const params = new URLSearchParams({
    latitude: String(lat),
    longitude: String(lon),
    start_date: dateStr,
    end_date: dateStr,
    daily: 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,sunshine_duration,sunrise,sunset',
    timezone: 'auto',
  });

  const payload = await fetchJson(`https://archive-api.open-meteo.com/v1/archive?${params}`);
  const daily = payload?.daily;

  if (!daily?.time?.length) {
    throw new Error(`Keine Archivdaten für ${dateStr}`);
  }

  const data = formatHistoryDay(daily.time[0], daily, 0);
  if (historyCache.has(key)) historyCache.delete(key);
  historyCache.set(key, { at: Date.now(), data });
  while (historyCache.size > HISTORY_CACHE_MAX_ENTRIES) {
    const oldest = historyCache.keys().next().value;
    if (oldest === undefined) break;
    historyCache.delete(oldest);
  }
  return data;
}

async function loadHistoryPresets(lat, lon, referenceDate) {
  const refYear = referenceYear(referenceDate);
  const presets = [];

  for (const offsetYears of HISTORY_PRESET_OFFSETS) {
    const year = refYear - offsetYears;
    if (year < HISTORY_MIN_YEAR) {
      presets.push({ offsetYears, year, available: false, day: null });
      continue;
    }

    try {
      const date = dateForYear(referenceDate, year);
      const day = await loadHistoricalDay(lat, lon, date);
      presets.push({ offsetYears, year, available: true, day });
    } catch (err) {
      console.warn(`[History] Preset ${offsetYears}J (${year}):`, err.message);
      presets.push({ offsetYears, year, available: true, day: null });
    }
  }

  return presets;
}

async function buildHistoryBlock(lat, lon, todayDay) {
  const referenceDate = todayDay.date;
  const refYear = referenceYear(referenceDate);
  const presets = await loadHistoryPresets(lat, lon, referenceDate);

  return {
    referenceDate,
    referenceLabel: formatDateLabel(referenceDate),
    minYear: HISTORY_MIN_YEAR,
    maxYear: refYear - 1,
    today: todayDay,
    presets,
    defaultYear: presets.find((p) => p.offsetYears === 1 && p.available)?.year
      ?? presets.find((p) => p.available)?.year
      ?? refYear - 1,
    source: 'ERA5-Reanalyse (Open-Meteo)',
  };
}

async function getHistoryDay(lat, lon, year, referenceDate, todayDay) {
  const y = parseInt(year, 10);
  const refYear = referenceYear(referenceDate);

  if (Number.isNaN(y) || y < HISTORY_MIN_YEAR || y > refYear - 1) {
    throw new Error(`Jahr muss zwischen ${HISTORY_MIN_YEAR} und ${refYear - 1} liegen`);
  }

  const day = await loadHistoricalDay(lat, lon, dateForYear(referenceDate, y));
  return {
    year: y,
    offsetYears: refYear - y,
    available: true,
    day,
    deltaTemp: tempDelta(todayDay, day),
  };
}

async function fetchJson(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);

  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) {
      const errBody = await res.json().catch(() => ({}));
      const reason = errBody.reason ? `: ${errBody.reason}` : '';
      throw new Error(`Wetter-API ${res.status}${reason}`);
    }
    return res.json();
  } finally {
    clearTimeout(timeout);
  }
}

function formatDateYMD(year, month, day) {
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function shiftMonth(year, month, delta) {
  let y = year;
  let m = month + delta;
  while (m < 1) {
    m += 12;
    y -= 1;
  }
  while (m > 12) {
    m -= 12;
    y += 1;
  }
  return { year: y, month: m };
}

function monthKey(year, month) {
  return year * 12 + (month - 1);
}

function dayBefore(dateStr) {
  const date = new Date(`${dateStr}T12:00:00`);
  date.setDate(date.getDate() - 1);
  return formatDateYMD(date.getFullYear(), date.getMonth() + 1, date.getDate());
}

function calendarDayFromForecast(day) {
  return {
    date: day.date,
    tempMax: day.tempMax,
    tempMin: day.tempMin,
    precipitation: day.precipitation,
    sunshineHours: day.sunshineHours,
    uvMax: day.uvMax ?? null,
    humidityMean: day.humidityMean ?? null,
    icon: day.icon,
    sceneClass: day.sceneClass,
    label: day.label,
    source: 'forecast',
  };
}

function calendarDayFromArchive(dateStr, daily, index) {
  return {
    date: dateStr,
    ...weatherInfo(daily.weather_code[index]),
    tempMax: round1(daily.temperature_2m_max[index]),
    tempMin: round1(daily.temperature_2m_min[index]),
    precipitation: round1(daily.precipitation_sum[index]),
    sunshineHours: round1((daily.sunshine_duration[index] || 0) / 3600),
    uvMax: daily.uv_index_max?.[index] != null ? round1(daily.uv_index_max[index]) : null,
    humidityMean: daily.relative_humidity_2m_mean?.[index] != null
      ? Math.round(daily.relative_humidity_2m_mean[index])
      : null,
    source: 'archive',
  };
}

async function loadHistoricalRange(lat, lon, startDate, endDate) {
  if (!startDate || !endDate || startDate > endDate) return new Map();

  const rangeKey = `${historyCacheKey(lat, lon, startDate)}..${endDate}`;
  const hit = historyCache.get(rangeKey);
  if (hit && Date.now() - hit.at < HISTORY_CACHE_MS) {
    return hit.data;
  }

  const params = new URLSearchParams({
    latitude: String(lat),
    longitude: String(lon),
    start_date: startDate,
    end_date: endDate,
    daily: 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,sunshine_duration,uv_index_max,relative_humidity_2m_mean',
    timezone: 'auto',
  });

  const payload = await fetchJson(`https://archive-api.open-meteo.com/v1/archive?${params}`);
  const daily = payload?.daily;
  const map = new Map();

  if (!daily?.time?.length) {
    return map;
  }

  for (let i = 0; i < daily.time.length; i += 1) {
    map.set(daily.time[i], calendarDayFromArchive(daily.time[i], daily, i));
  }

  historyCache.set(rangeKey, { at: Date.now(), data: map });
  while (historyCache.size > HISTORY_CACHE_MAX_ENTRIES) {
    const oldest = historyCache.keys().next().value;
    if (oldest === undefined) break;
    historyCache.delete(oldest);
  }

  return map;
}

function buildCalendarBlock(dataByDate, todayDate, viewYear, viewMonth, meta = {}) {
  const year = viewYear;
  const month = viewMonth;
  const monthStart = new Date(`${formatDateYMD(year, month, 1)}T12:00:00`);
  const monthLabel = monthStart.toLocaleDateString('de-DE', { month: 'long', year: 'numeric' });
  const daysInMonth = new Date(year, month, 0).getDate();
  const mondayFirstOffset = (monthStart.getDay() + 6) % 7;

  const cells = [];
  for (let i = 0; i < mondayFirstOffset; i += 1) {
    cells.push({ empty: true });
  }

  for (let dom = 1; dom <= daysInMonth; dom += 1) {
    const date = formatDateYMD(year, month, dom);
    const record = dataByDate.get(date);
    cells.push({
      date,
      dayOfMonth: dom,
      isToday: date === todayDate,
      hasData: Boolean(record),
      source: record?.source ?? null,
      tempMax: record?.tempMax ?? null,
      tempMin: record?.tempMin ?? null,
      precipitation: record?.precipitation ?? null,
      sunshineHours: record?.sunshineHours ?? null,
      uvMax: record?.uvMax ?? null,
      humidityMean: record?.humidityMean ?? null,
      icon: record?.icon ?? null,
      sceneClass: record?.sceneClass ?? null,
      label: record?.label ?? null,
    });
  }

  while (cells.length % 7 !== 0) {
    cells.push({ empty: true });
  }

  const weeks = [];
  for (let i = 0; i < cells.length; i += 7) {
    weeks.push(cells.slice(i, i + 7));
  }

  let forecastDaysInMonth = 0;
  let archiveDaysInMonth = 0;
  for (const cell of cells) {
    if (cell.empty) continue;
    if (cell.source === 'forecast') forecastDaysInMonth += 1;
    if (cell.source === 'archive') archiveDaysInMonth += 1;
  }

  return {
    year,
    month,
    monthLabel,
    today: todayDate,
    forecastDays: meta.forecastDays ?? 0,
    forecastDaysInMonth,
    archiveDaysInMonth,
    canPrev: meta.canPrev ?? false,
    canNext: meta.canNext ?? false,
    weekdayLabels: ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'],
    weeks,
  };
}

async function assembleCalendarMonth(lat, lon, year, month, forecastDays, todayDate) {
  const y = parseInt(year, 10);
  const m = parseInt(month, 10);
  if (Number.isNaN(y) || Number.isNaN(m) || m < 1 || m > 12) {
    throw new Error('Ungültiger Monat');
  }
  if (!todayDate || !Array.isArray(forecastDays) || !forecastDays.length) {
    throw new Error('Keine Kalenderdaten verfügbar');
  }

  const lastForecastDate = forecastDays[forecastDays.length - 1].date;
  const monthStart = formatDateYMD(y, m, 1);
  const monthEnd = formatDateYMD(y, m, new Date(y, m, 0).getDate());

  const forecastByDate = new Map();
  for (const day of forecastDays) {
    forecastByDate.set(day.date, calendarDayFromForecast(day));
  }

  let archiveByDate = new Map();
  const archiveEnd = monthEnd < todayDate ? monthEnd : dayBefore(todayDate);
  if (monthStart <= archiveEnd) {
    try {
      archiveByDate = await loadHistoricalRange(lat, lon, monthStart, archiveEnd);
    } catch (err) {
      console.warn('[Calendar] Archive:', err.message);
    }
  }

  const merged = new Map(archiveByDate);
  for (const [date, record] of forecastByDate) {
    merged.set(date, record);
  }

  const todayParts = todayDate.split('-').map(Number);
  const lastForecastParts = lastForecastDate.split('-').map(Number);
  const minNavMonth = shiftMonth(todayParts[0], todayParts[1], -12);
  const canPrev = monthKey(y, m) > monthKey(minNavMonth.year, minNavMonth.month);
  const canNext = monthKey(y, m) < monthKey(lastForecastParts[0], lastForecastParts[1]);

  return buildCalendarBlock(merged, todayDate, y, m, {
    forecastDays: forecastDays.length,
    canPrev,
    canNext,
  });
}

async function getCalendarMonth(lat, lon, year, month) {
  const weather = await getWeatherData(lat, lon);
  const todayDate = weather.forecast?.[0]?.date;
  if (!todayDate) {
    throw new Error('Keine Wetterdaten verfügbar');
  }
  return assembleCalendarMonth(lat, lon, year, month, weather.forecast, todayDate);
}

async function loadWeatherData(lat, lon) {
  const forecastParams = new URLSearchParams({
    latitude: String(lat),
    longitude: String(lon),
    current: 'temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,weather_code,wind_speed_10m,wind_direction_10m,wind_gusts_10m',
    hourly: 'temperature_2m,precipitation_probability,precipitation,weather_code,wind_speed_10m,wind_gusts_10m,snow_depth',
    daily: 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,snowfall_sum,sunshine_duration,uv_index_max,sunrise,sunset,relative_humidity_2m_mean',
    timezone: 'auto',
    forecast_days: '16',
  });

  const pollenParams = new URLSearchParams({
    latitude: String(lat),
    longitude: String(lon),
    hourly: POLLEN_TYPES.map((p) => p.key).join(','),
    timezone: 'auto',
    forecast_days: '3',
  });

  const [forecast, pollenPayload] = await Promise.all([
    fetchJson(`https://api.open-meteo.com/v1/forecast?${forecastParams}`),
    fetchJson(`https://air-quality-api.open-meteo.com/v1/air-quality?${pollenParams}`).catch(() => null),
  ]);

  const current = forecast.current;
  const daily = forecast.daily;
  const currentWeather = weatherInfo(current.weather_code);

  const days = daily.time.map((date, i) => ({
    date,
    year: parseInt(date.slice(0, 4), 10),
    dateLabel: formatDateLabel(date),
    weekday: formatWeekdayShort(date),
    ...weatherInfo(daily.weather_code[i]),
    tempMax: round1(daily.temperature_2m_max[i]),
    tempMin: round1(daily.temperature_2m_min[i]),
    precipitation: round1(daily.precipitation_sum[i]),
    snowfallSum: round1(daily.snowfall_sum?.[i] ?? 0),
    sunshineHours: round1((daily.sunshine_duration[i] || 0) / 3600),
    sunrise: formatTimeFromIso(daily.sunrise?.[i]),
    sunset: formatTimeFromIso(daily.sunset?.[i]),
    uvMax: daily.uv_index_max?.[i] != null ? round1(daily.uv_index_max[i]) : null,
    humidityMean: daily.relative_humidity_2m_mean?.[i] != null
      ? Math.round(daily.relative_humidity_2m_mean[i])
      : null,
  }));

  const hourlyPayload = forecast.hourly;
  const hourly = Array.isArray(hourlyPayload?.time)
    ? hourlyPayload.time.map((timeIso, i) => ({
      time: timeIso,
      timeLabel: formatTimeFromIso(timeIso),
      date: timeIso.slice(0, 10),
      weekday: formatWeekdayShort(timeIso.slice(0, 10)),
      ...weatherInfo(hourlyPayload.weather_code?.[i]),
      temp: round1(hourlyPayload.temperature_2m?.[i]),
      precipProb: hourlyPayload.precipitation_probability?.[i] != null
        ? Math.round(hourlyPayload.precipitation_probability[i])
        : null,
      precipitation: round1(hourlyPayload.precipitation?.[i]),
      windSpeed: round1(hourlyPayload.wind_speed_10m?.[i]),
      windGusts: hourlyPayload.wind_gusts_10m?.[i] != null
        ? round1(hourlyPayload.wind_gusts_10m[i])
        : null,
    }))
    : [];

  let history = null;
  if (days[0]) {
    try {
      history = await buildHistoryBlock(lat, lon, days[0]);
    } catch (err) {
      console.error('[History]', err.message);
      history = {
        available: false,
        note: 'Vergleichsdaten derzeit nicht verfügbar.',
      };
    }
  }

  const pollenToday = [];
  if (pollenPayload?.hourly?.time) {
    const today = pollenPayload.hourly.time[0]?.slice(0, 10);
    const todayIndexes = pollenPayload.hourly.time
      .map((t, i) => (t.startsWith(today) ? i : -1))
      .filter((i) => i >= 0);

    for (const type of POLLEN_TYPES) {
      const values = todayIndexes
        .map((i) => pollenPayload.hourly[type.key]?.[i])
        .filter((v) => v != null);
      const peak = values.length ? Math.max(...values) : null;
      pollenToday.push({
        id: type.key,
        label: type.label,
        value: peak != null ? round1(peak) : null,
        level: pollenLevel(peak),
      });
    }
  }

  const pollenBlock = {
    available: pollenToday.length > 0,
    items: pollenToday,
    note: pollenToday.length
      ? 'Tageshöchstwerte (Pollen/m³)'
      : 'Für diesen Standort liegen derzeit keine Pollendaten vor.',
  };

  const sunshineBlock = {
    uvMax: days[0]?.uvMax ?? null,
    uvLevel: uvLevel(days[0]?.uvMax),
    sunshineHours: days[0]?.sunshineHours ?? null,
    sunrise: days[0]?.sunrise ?? null,
    sunset: days[0]?.sunset ?? null,
  };

  const todaySnowfall = days[0]?.snowfallSum ?? 0;
  const todayDepth = maxSnowDepthCmForDate(hourlyPayload, days[0]?.date);
  const weekSnowfall = round1(days.reduce((sum, day) => sum + (day.snowfallSum || 0), 0));
  const nextSnowDay = days.slice(1).find((day) => (day.snowfallSum || 0) > 0) ?? null;
  const snowCodeToday = SNOW_WEATHER_CODES.has(daily.weather_code?.[0]);

  const snowBlock = {
    snowfallToday: todaySnowfall,
    snowfallLevel: snowAmountLevel(todaySnowfall),
    snowDepth: todayDepth,
    depthLevel: snowDepthLevel(todayDepth),
    snowfallWeek: weekSnowfall,
    tempMinToday: days[0]?.tempMin ?? null,
    isSnowWeather: snowCodeToday,
    conditionLabel: snowCodeToday ? days[0]?.label : null,
    nextSnowDay: nextSnowDay
      ? {
        dateLabel: nextSnowDay.dateLabel,
        weekday: nextSnowDay.weekday,
        snowfall: nextSnowDay.snowfallSum,
      }
      : null,
  };

  const twilightBlock = buildTwilightBlock(lat, lon, days[0]?.date, forecast.timezone);

  const currentBlock = {
    ...currentWeather,
    temperature: round1(current.temperature_2m),
    feelsLike: round1(current.apparent_temperature),
    humidity: current.relative_humidity_2m,
    precipitation: round1(current.precipitation),
    windSpeed: round1(current.wind_speed_10m),
    windDirection: current.wind_direction_10m,
    windGusts: current.wind_gusts_10m != null ? round1(current.wind_gusts_10m) : null,
  };

  const warnings = buildWeatherWarnings({
    current: currentBlock,
    forecast: days,
    pollen: pollenBlock,
  });

  const advisorBlock = buildAdvisorBlock({
    current: currentBlock,
    today: days[0],
    sunshine: sunshineBlock,
    snow: snowBlock,
    hourly,
    pollen: pollenBlock,
    warnings,
  });

  const calendarBlock = days[0]?.date
    ? await assembleCalendarMonth(
      lat,
      lon,
      parseInt(days[0].date.slice(0, 4), 10),
      parseInt(days[0].date.slice(5, 7), 10),
      days,
      days[0].date,
    )
    : null;

  return {
    lat,
    lon,
    timezone: forecast.timezone,
    fetchedAt: new Date().toISOString(),
    sunshine: sunshineBlock,
    snow: snowBlock,
    twilight: twilightBlock,
    advisor: advisorBlock,
    calendar: calendarBlock,
    current: currentBlock,
    forecast: days,
    hourly,
    history,
    pollen: pollenBlock,
    warnings,
  };
}

async function getWeatherData(lat, lon) {
  if (typeof lat !== 'number' || typeof lon !== 'number') {
    throw new Error('lat und lon erforderlich');
  }

  const key = cacheKey(lat, lon);
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_MS) {
    return hit.data;
  }

  const data = await loadWeatherData(lat, lon);
  cache.set(key, { at: Date.now(), data });
  return data;
}

async function getHistoryDayByYear(lat, lon, year, referenceDate = null) {
  const y = parseInt(year, 10);
  let refDate = typeof referenceDate === 'string' && referenceDate ? referenceDate : null;
  let todayDay = null;

  if (!refDate) {
    const weather = await getWeatherData(lat, lon);
    todayDay = weather.history?.today ?? weather.forecast?.[0];
    refDate = weather.history?.referenceDate ?? todayDay?.date;
  } else {
    const hit = cache.get(cacheKey(lat, lon));
    todayDay = hit?.data?.history?.today ?? hit?.data?.forecast?.[0] ?? null;
  }

  if (!refDate) {
    throw new Error('Kein Referenztag für Vergleich verfügbar');
  }

  return getHistoryDay(lat, lon, y, refDate, todayDay);
}

module.exports = {
  getWeatherData,
  getHistoryDayByYear,
  getCalendarMonth,
  weatherInfo,
  getWmoWeatherCatalog,
  WMO_WEATHER,
};
