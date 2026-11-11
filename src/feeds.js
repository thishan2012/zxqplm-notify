// Fetch + parse RSS 2.0 / Atom / Google Cloud incidents.json into one
// normalized entry shape: { id, title, description, link, pubDate }
//
// No network assumptions: pass the raw body to parseFeed() directly in tests.

import { XMLParser } from 'fast-xml-parser';

export const DEFAULT_MAJOR_KEYWORDS = [
  'major',
  'outage',
  'critical',
  'unavailable',
  'down',
  'disruption',
  'service_outage',
];

export function majorKeywords() {
  const fromEnv = process.env.MAJOR_KEYWORDS;
  if (fromEnv && fromEnv.trim()) {
    return fromEnv.split(',').map((k) => k.trim().toLowerCase()).filter(Boolean);
  }
  return DEFAULT_MAJOR_KEYWORDS;
}

export function isMajor(entry, keywords = majorKeywords()) {
  const haystack = `${entry.title} ${entry.description}`.toLowerCase();
  return keywords.some((kw) => kw && haystack.includes(kw));
}

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  textNodeName: '#text',
  // Keep values simple where possible.
  parseAttributeValue: false,
  parseTagValue: false,
  trimValues: true,
});

function asArray(v) {
  if (v == null) return [];
  return Array.isArray(v) ? v : [v];
}

function textOf(v) {
  if (v == null) return '';
  if (Array.isArray(v)) v = v.find((x) => x != null) ?? '';
  if (typeof v === 'object') {
    if (v['#text'] != null) return String(v['#text']);
    return '';
  }
  return String(v);
}

function normalizeRssItem(item) {
  const guid = textOf(item.guid) || textOf(item.link) || `${textOf(item.title)}|${textOf(item.pubDate)}`;
  return {
    id: guid,
    title: textOf(item.title),
    description: textOf(item.description) || textOf(item['content:encoded']),
    link: textOf(item.link) || textOf(item.guid),
    pubDate: textOf(item.pubDate) || textOf(item['dc:date']) || '',
  };
}

function pickAtomLink(link) {
  const links = asArray(link);
  const alternate = links.find((l) => l && typeof l === 'object' && (l['@_rel'] === 'alternate' || l['@_rel'] == null));
  const chosen = alternate ?? links.find((l) => l && typeof l === 'object') ?? links[0];
  if (chosen && typeof chosen === 'object') return String(chosen['@_href'] ?? chosen['#text'] ?? '');
  return textOf(chosen);
}

function normalizeAtomEntry(entry) {
  return {
    id: textOf(entry.id) || `${textOf(entry.title)}|${textOf(entry.updated) || textOf(entry.published)}`,
    title: textOf(entry.title),
    description: textOf(entry.summary) || textOf(entry.content),
    link: pickAtomLink(entry.link) || textOf(entry.id),
    pubDate: textOf(entry.updated) || textOf(entry.published) || '',
  };
}

function normalizeGcIncident(incident) {
  const id = String(incident.id ?? incident.number ?? incident.begin ?? JSON.stringify(incident).slice(0, 120));
  const impact = String(incident.status_impact ?? '').toUpperCase();
  const severity = String(incident.severity ?? '').toLowerCase();
  const desc = String(incident.external_desc ?? '').trim();
  const service = String(incident.service_name ?? '').trim();
  // Google Cloud uses SERVICE_OUTAGE / SERVICE_DISRUPTION style impacts.
  const forcedMajor = impact.includes('OUTAGE') || ['high', 'critical'].includes(severity);
  return {
    id,
    title: service ? `${service}: ${firstLine(desc)}` : firstLine(desc) || 'Google Cloud incident',
    description: [desc, impact ? `impact=${impact}` : '', severity ? `severity=${severity}` : '']
      .filter(Boolean)
      .join(' | '),
    link: incident.uri ? String(incident.uri) : 'https://status.cloud.google.com/',
    pubDate: String(incident.begin ?? incident.created ?? ''),
    _forcedMajor: forcedMajor,
  };
}

function firstLine(s) {
  return String(s || '').split('\n')[0].slice(0, 200);
}

export function parseFeed(body, service = {}) {
  const trimmed = String(body ?? '').trim();
  if (!trimmed) throw new Error(`Empty body for ${service.id ?? 'feed'}`);

  const looksJson = service.format === 'json-gc' || trimmed.startsWith('[') || trimmed.startsWith('{');
  if (looksJson) {
    const data = JSON.parse(trimmed);
    const incidents = Array.isArray(data) ? data : (Array.isArray(data.incidents) ? data.incidents : []);
    return incidents.map(normalizeGcIncident);
  }

  const doc = parser.parse(trimmed);

  // RSS 2.0: rss > channel > item[]
  const channel = doc?.rss?.channel ?? doc?.['rdf:RDF']?.channel;
  if (channel?.item) {
    return asArray(channel.item).map(normalizeRssItem);
  }

  // Atom: feed > entry[]
  if (doc?.feed?.entry) {
    return asArray(doc.feed.entry).map(normalizeAtomEntry);
  }

  // RSS with zero items is valid — no entries, not an error.
  if (channel) return [];
  if (doc?.feed) return [];

  throw new Error(`Unrecognized feed format for ${service.id ?? 'feed'} (not RSS/Atom/JSON)`);
}

export async function fetchFeed(service, { timeoutMs = 15000 } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(service.url, {
      headers: {
        'User-Agent': 'OutageNotifyBot/1.0 (+https://github.com/thishan2012/zxqplm-notify)',
        Accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml, application/json, */*',
      },
      redirect: 'follow',
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const body = await res.text();
    return parseFeed(body, service);
  } finally {
    clearTimeout(timer);
  }
}

// Entries that should alert: explicitly-major JSON incidents, or keyword match.
export function entryIsAlertable(entry, keywords = majorKeywords()) {
  if (entry._forcedMajor) return true;
  return isMajor(entry, keywords);
}
