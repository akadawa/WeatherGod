const SEVERITY_RANK = { extreme: 0, high: 1, moderate: 2, low: 3, info: 4 };

function addWarning(items, seen, warning) {
  if (seen.has(warning.id)) return;
  seen.add(warning.id);
  items.push(warning);
}

function isThunderCode(code) {
  return code >= 95 && code <= 99;
}

function isSnowCode(code) {
  return [71, 73, 75, 77, 85, 86].includes(code);
}

function isFreezingRainCode(code) {
  return [56, 57, 66, 67].includes(code);
}

function isFogCode(code) {
  return code === 45 || code === 48;
}

function addCurrentWarnings(current, items, seen) {
  if (!current) return;

  if (isThunderCode(current.code)) {
    addWarning(items, seen, {
      id: 'now-thunder',
      dayIndex: -1,
      severity: 'high',
      icon: '⛈️',
      title: 'Gewitter',
      detail: current.label,
      scope: 'Jetzt',
    });
  }
  if (current.windGusts != null && current.windGusts >= 90) {
    addWarning(items, seen, {
      id: 'now-gust-extreme',
      dayIndex: -1,
      severity: 'extreme',
      icon: '🌬️',
      title: 'Schwere Sturmböen',
      detail: `Böen bis ${current.windGusts} km/h`,
      scope: 'Jetzt',
    });
  } else if (current.windGusts != null && current.windGusts >= 70) {
    addWarning(items, seen, {
      id: 'now-gust',
      dayIndex: -1,
      severity: 'high',
      icon: '🌬️',
      title: 'Sturmböen',
      detail: `Böen bis ${current.windGusts} km/h`,
      scope: 'Jetzt',
    });
  }
  if (current.windSpeed >= 75) {
    addWarning(items, seen, {
      id: 'now-wind-high',
      dayIndex: -1,
      severity: 'high',
      icon: '💨',
      title: 'Stürmische Winde',
      detail: `${current.windSpeed} km/h`,
      scope: 'Jetzt',
    });
  } else if (current.windSpeed >= 55) {
    addWarning(items, seen, {
      id: 'now-wind',
      dayIndex: -1,
      severity: 'moderate',
      icon: '💨',
      title: 'Starker Wind',
      detail: `${current.windSpeed} km/h`,
      scope: 'Jetzt',
    });
  }
  if (current.temperature >= 35) {
    addWarning(items, seen, {
      id: 'now-heat',
      dayIndex: -1,
      severity: 'high',
      icon: '🌡️',
      title: 'Starke Hitze',
      detail: `${current.temperature}°`,
      scope: 'Jetzt',
    });
  }
  if (current.feelsLike >= 38) {
    addWarning(items, seen, {
      id: 'now-feels',
      dayIndex: -1,
      severity: 'high',
      icon: '🥵',
      title: 'Extreme Hitze (gefühlt)',
      detail: `${current.feelsLike}°`,
      scope: 'Jetzt',
    });
  }
  if (isFreezingRainCode(current.code)) {
    addWarning(items, seen, {
      id: 'now-ice',
      dayIndex: -1,
      severity: 'high',
      icon: '🧊',
      title: 'Gefrierender Regen',
      detail: current.label,
      scope: 'Jetzt',
    });
  }
  if (isFogCode(current.code)) {
    addWarning(items, seen, {
      id: 'now-fog',
      dayIndex: -1,
      severity: 'moderate',
      icon: '🌫️',
      title: 'Dichter Nebel',
      detail: current.label,
      scope: 'Jetzt',
    });
  }
}

function addDayWarnings(day, scope, dayIndex, idPrefix, items, seen) {
  if (!day) return;

  if (day.tempMax >= 38) {
    addWarning(items, seen, {
      id: `${idPrefix}-heat-extreme`,
      dayIndex,
      severity: 'extreme',
      icon: '🌡️',
      title: 'Extreme Hitze',
      detail: `Bis ${day.tempMax}°`,
      scope,
    });
  } else if (day.tempMax >= 32) {
    addWarning(items, seen, {
      id: `${idPrefix}-heat-high`,
      dayIndex,
      severity: 'high',
      icon: '🌡️',
      title: 'Hitze',
      detail: `Bis ${day.tempMax}°`,
      scope,
    });
  } else if (day.tempMax >= 28) {
    addWarning(items, seen, {
      id: `${idPrefix}-heat`,
      dayIndex,
      severity: 'moderate',
      icon: '🌡️',
      title: 'Sommerliche Wärme',
      detail: `Bis ${day.tempMax}°`,
      scope,
    });
  }

  if (day.tempMin <= -15) {
    addWarning(items, seen, {
      id: `${idPrefix}-frost-extreme`,
      dayIndex,
      severity: 'extreme',
      icon: '❄️',
      title: 'Extreme Kälte',
      detail: `Bis ${day.tempMin}°`,
      scope,
    });
  } else if (day.tempMin <= -5) {
    addWarning(items, seen, {
      id: `${idPrefix}-frost-high`,
      dayIndex,
      severity: 'high',
      icon: '❄️',
      title: 'Strenger Frost',
      detail: `Bis ${day.tempMin}°`,
      scope,
    });
  } else if (day.tempMin <= 0) {
    addWarning(items, seen, {
      id: `${idPrefix}-frost`,
      dayIndex,
      severity: 'moderate',
      icon: '❄️',
      title: 'Frost',
      detail: `Bis ${day.tempMin}°`,
      scope,
    });
  }

  if (day.precipitation >= 40) {
    addWarning(items, seen, {
      id: `${idPrefix}-rain-extreme`,
      dayIndex,
      severity: 'extreme',
      icon: '🌧️',
      title: 'Extrem viel Regen',
      detail: `${day.precipitation} mm`,
      scope,
    });
  } else if (day.precipitation >= 25) {
    addWarning(items, seen, {
      id: `${idPrefix}-rain-high`,
      dayIndex,
      severity: 'high',
      icon: '🌧️',
      title: 'Starkregen',
      detail: `${day.precipitation} mm`,
      scope,
    });
  } else if (day.precipitation >= 15) {
    addWarning(items, seen, {
      id: `${idPrefix}-rain`,
      dayIndex,
      severity: 'moderate',
      icon: '🌧️',
      title: 'Viel Regen',
      detail: `${day.precipitation} mm`,
      scope,
    });
  }

  if (isThunderCode(day.code)) {
    addWarning(items, seen, {
      id: `${idPrefix}-thunder`,
      dayIndex,
      severity: 'high',
      icon: '⛈️',
      title: 'Gewitter',
      detail: day.label,
      scope,
    });
  }

  if (isSnowCode(day.code) && day.precipitation >= 5) {
    addWarning(items, seen, {
      id: `${idPrefix}-snow-high`,
      dayIndex,
      severity: 'high',
      icon: '🌨️',
      title: 'Schneefall',
      detail: `${day.precipitation} mm`,
      scope,
    });
  } else if (isSnowCode(day.code)) {
    addWarning(items, seen, {
      id: `${idPrefix}-snow`,
      dayIndex,
      severity: 'moderate',
      icon: '🌨️',
      title: 'Schnee',
      detail: day.label,
      scope,
    });
  }

  if (day.uvMax >= 11) {
    addWarning(items, seen, {
      id: `${idPrefix}-uv-extreme`,
      dayIndex,
      severity: 'extreme',
      icon: '☀️',
      title: 'Extrem hoher UV-Index',
      detail: `Stufe ${day.uvMax}`,
      scope,
    });
  } else if (day.uvMax >= 8) {
    addWarning(items, seen, {
      id: `${idPrefix}-uv-high`,
      dayIndex,
      severity: 'high',
      icon: '☀️',
      title: 'Sehr hoher UV-Index',
      detail: `Stufe ${day.uvMax}`,
      scope,
    });
  } else if (day.uvMax >= 6) {
    addWarning(items, seen, {
      id: `${idPrefix}-uv`,
      dayIndex,
      severity: 'moderate',
      icon: '☀️',
      title: 'Hoher UV-Index',
      detail: `Stufe ${day.uvMax}`,
      scope,
    });
  }
}

function addPollenWarnings(pollen, items, seen) {
  if (!pollen?.available) return;

  const highPollen = pollen.items.filter((entry) => entry.level?.className === 'high');
  if (highPollen.length >= 2) {
    addWarning(items, seen, {
      id: 'd0-pollen-multi',
      dayIndex: 0,
      severity: 'moderate',
      icon: '🌾',
      title: 'Starker Pollenflug',
      detail: highPollen.map((entry) => entry.label).join(', '),
      scope: 'Heute',
    });
  } else if (highPollen.length === 1) {
    addWarning(items, seen, {
      id: 'd0-pollen-single',
      dayIndex: 0,
      severity: 'low',
      icon: '🌾',
      title: 'Hohe Pollenbelastung',
      detail: highPollen[0].label,
      scope: 'Heute',
    });
  }
}

function buildWeatherWarnings({ current, forecast, pollen }) {
  const items = [];
  const seen = new Set();
  const days = Array.isArray(forecast) ? forecast : [];

  addCurrentWarnings(current, items, seen);

  days.forEach((day, index) => {
    const scope = index === 0 ? 'Heute' : (day.weekday || day.dateLabel || `Tag ${index + 1}`);
    addDayWarnings(day, scope, index, `d${index}`, items, seen);
  });

  addPollenWarnings(pollen, items, seen);

  items.sort((a, b) => {
    const dayA = a.dayIndex ?? 0;
    const dayB = b.dayIndex ?? 0;
    if (dayA !== dayB) return dayA - dayB;
    const rank = SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity];
    if (rank !== 0) return rank;
    return a.title.localeCompare(b.title, 'de');
  });

  const maxSeverity = items.length ? items[0].severity : 'none';

  return {
    active: items.length > 0,
    maxSeverity,
    count: items.length,
    items,
    note: items.length
      ? `${items.length} Hinweis${items.length === 1 ? '' : 'e'}`
      : 'Keine Wetterwarnungen',
  };
}

module.exports = { buildWeatherWarnings };
