const RESOLVE_CACHE_MS = 30 * 60 * 1000;
const FETCH_TIMEOUT_MS = 15000;
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';
const PROXY_REFERER = 'https://www.wetter.com/';

const PROXY_HOSTS = [
  'livespotting.com',
  'wettercomassets.com',
];

const resolveCache = new Map();

function decodeJsonEscapes(str) {
  let out = str.replace(/\\u([0-9a-fA-F]{4})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
  out = out.replace(/\\+\//g, '/');
  return out;
}

function normalizeStreamUrl(url) {
  if (!url) return null;
  return url.replace(/\\+\//g, '/').trim();
}

function isDirectStreamUrl(url) {
  const lower = url.toLowerCase();
  return lower.includes('.m3u8') || lower.includes('.mp4') || lower.includes('.webm');
}

function isWetterWebcamUrl(url) {
  try {
    const parsed = new URL(url);
    return parsed.hostname.includes('wetter.com')
      && (parsed.pathname.includes('/hd-live-webcams/') || parsed.pathname.includes('/livecam/'));
  } catch {
    return false;
  }
}

function normalizeInputUrl(raw) {
  const trimmed = String(raw || '').trim();
  if (!trimmed) return null;
  try {
    const parsed = new URL(trimmed);
    if (!['http:', 'https:'].includes(parsed.protocol)) return null;
    return parsed.toString();
  } catch {
    return null;
  }
}

function extractWetterPlayerData(html) {
  const decoded = decodeJsonEscapes(html);
  const srcMatch = decoded.match(/"src":"(https:[^"]+m3u8[^"]+)"/i);
  const posterMatch = decoded.match(/"poster":"(https:[^"]+)"/i);
  const titleMatch = decoded.match(/"title":"([^"]+)"/i);
  const cameraMatch = decoded.match(/\/hd-live-webcams\/[^"']+\/([a-z0-9]+)/i)
    || decoded.match(/livecam\/([a-z0-9]+)/i);

  return {
    streamUrl: normalizeStreamUrl(srcMatch?.[1]),
    poster: normalizeStreamUrl(posterMatch?.[1]),
    title: titleMatch?.[1]?.trim() || null,
    cameraId: cameraMatch?.[1] || null,
  };
}

async function fetchPage(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': USER_AGENT,
        Accept: 'text/html,application/xhtml+xml',
      },
      redirect: 'follow',
      signal: controller.signal,
    });

    if (!res.ok) {
      throw new Error(`Seite nicht erreichbar (${res.status})`);
    }

    return res.text();
  } finally {
    clearTimeout(timer);
  }
}

async function resolveWetterWebcam(url) {
  const html = await fetchPage(url);
  const data = extractWetterPlayerData(html);

  if (!data.streamUrl) {
    throw new Error('Kein Livestream auf der wetter.com-Seite gefunden');
  }

  return {
    sourceUrl: url,
    provider: 'wetter.com',
    type: 'hls',
    streamUrl: data.streamUrl,
    playbackUrl: proxiedStreamUrl(data.streamUrl),
    poster: data.poster,
    title: data.title,
    cameraId: data.cameraId,
  };
}

function resolveDirectStream(url) {
  const lower = url.toLowerCase();
  const type = lower.includes('.mp4') || lower.includes('.webm') ? 'progressive' : 'hls';

  return {
    sourceUrl: url,
    provider: 'direct',
    type,
    streamUrl: url,
    playbackUrl: proxiedStreamUrl(url) || url,
    poster: null,
    title: null,
    cameraId: null,
  };
}

async function resolveWebcamSource(rawUrl) {
  const url = normalizeInputUrl(rawUrl);
  if (!url) {
    throw new Error('Ungültige URL');
  }

  const cached = resolveCache.get(url);
  if (cached && Date.now() - cached.at < RESOLVE_CACHE_MS) {
    return cached.data;
  }

  let data;
  if (isDirectStreamUrl(url)) {
    data = resolveDirectStream(url);
  } else if (isWetterWebcamUrl(url)) {
    data = await resolveWetterWebcam(url);
  } else {
    throw new Error('URL wird nicht unterstützt. Bitte wetter.com-Webcam oder direkten Stream (.m3u8/.mp4) angeben.');
  }

  resolveCache.set(url, { at: Date.now(), data });
  return data;
}

function isAllowedProxyUrl(url) {
  try {
    const parsed = new URL(url);
    if (!['http:', 'https:'].includes(parsed.protocol)) return false;
    return PROXY_HOSTS.some((host) => parsed.hostname === host || parsed.hostname.endsWith(`.${host}`));
  } catch {
    return false;
  }
}

function normalizeProxyUrl(raw) {
  const trimmed = String(raw || '').trim();
  if (!trimmed || !isAllowedProxyUrl(trimmed)) return null;
  return trimmed;
}

function rewriteM3u8(content, baseUrl) {
  return content
    .split('\n')
    .map((line) => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) return line;
      const absolute = new URL(trimmed, baseUrl).href;
      if (!isAllowedProxyUrl(absolute)) return line;
      return `/api/webcam/proxy?url=${encodeURIComponent(absolute)}`;
    })
    .join('\n');
}

async function proxyWebcamResource(rawUrl) {
  const url = normalizeProxyUrl(rawUrl);
  if (!url) {
    throw new Error('Proxy-URL nicht erlaubt');
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': USER_AGENT,
        Referer: PROXY_REFERER,
        Accept: '*/*',
      },
      redirect: 'follow',
      signal: controller.signal,
    });

    if (!res.ok) {
      throw new Error(`Upstream-Fehler (${res.status})`);
    }

    const contentType = res.headers.get('content-type') || '';
    const isPlaylist = url.includes('.m3u8')
      || contentType.includes('mpegurl')
      || contentType.includes('application/x-mpegURL');

    if (isPlaylist) {
      const text = await res.text();
      return {
        contentType: 'application/vnd.apple.mpegurl; charset=utf-8',
        body: rewriteM3u8(text, url),
        binary: false,
      };
    }

    const buffer = Buffer.from(await res.arrayBuffer());
    return {
      contentType: contentType || 'video/MP2T',
      body: buffer,
      binary: true,
    };
  } finally {
    clearTimeout(timer);
  }
}

function proxiedStreamUrl(streamUrl) {
  if (!streamUrl || !isAllowedProxyUrl(streamUrl)) return streamUrl;
  return `/api/webcam/proxy?url=${encodeURIComponent(streamUrl)}`;
}

module.exports = {
  resolveWebcamSource,
  proxyWebcamResource,
  normalizeInputUrl,
  isWetterWebcamUrl,
  isDirectStreamUrl,
  proxiedStreamUrl,
};
