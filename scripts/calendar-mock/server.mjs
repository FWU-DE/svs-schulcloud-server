import http from 'node:http';
import { URL } from 'node:url';

const port = Number(process.env.PORT || 3000);
const host = process.env.HOST || '0.0.0.0';

const now = new Date();
const day = (offset, hour, minute = 0) => {
  const date = new Date(now);
  date.setDate(now.getDate() + offset);
  date.setHours(hour, minute, 0, 0);
  return date;
};

// Course ids match the seeded demo courses in schulcloud-server
// (`npm run setup:db:seed`), so tapping the linked course inside an event actually opens that
// course in the clients instead of dead-ending on an id that exists nowhere.
const COURSE_MATHE = '0000dcfbfb5c7a3f00bf21ab';
const COURSE_KI = '681c7b138945ce807e90249f';
const COURSE_CC = '681e018089002b0ee99aa0af';

const lesson = ({ id, summary, location, description, courseId, offset, hour, minute, durationMinutes = 90 }) => ({
  type: 'event',
  id,
  attributes: {
    uid: id,
    summary,
    location,
    description,
    dtstart: day(offset, hour, minute).toISOString(),
    dtend: day(offset, hour, minute + durationMinutes).toISOString(),
    dtstamp: new Date().toISOString(),
    ...(courseId ? { 'x-sc-courseid': courseId } : {})
  },
  relationships: { 'scope-ids': courseId ? [courseId] : [] }
});

let events = [
  lesson({
    id: 'local-calendar-mathe-heute',
    summary: 'Mathe · Lineare Gleichungen',
    location: 'Raum 2.14',
    description: '<p>Einführung in lineare Gleichungssysteme, danach Übungsaufgaben in Partnerarbeit.</p>',
    courseId: COURSE_MATHE,
    offset: 0,
    hour: 8,
    minute: 0
  }),
  lesson({
    id: 'local-calendar-ki-heute',
    summary: 'KI im Schulkontext · Chancen und Risiken',
    location: 'Computerraum',
    description: '<p>Diskussion zu Chancen und Risiken generativer KI, mit Praxisbeispielen.</p>',
    courseId: COURSE_KI,
    offset: 0,
    hour: 11,
    minute: 30
  }),
  lesson({
    id: 'local-calendar-mathe-morgen',
    summary: 'Mathe · Übungsstunde',
    location: 'Raum 2.14',
    description: '<p>Wiederholung vor der Klassenarbeit, Fragen zu den offenen Aufgaben.</p>',
    courseId: COURSE_MATHE,
    offset: 1,
    hour: 10,
    minute: 15
  }),
  lesson({
    id: 'local-calendar-cc-uebermorgen',
    summary: 'CC_Test_Kurs · Projektarbeit',
    location: 'Bibliothek',
    description: '<p>Gruppenarbeit an den Projektergebnissen.</p>',
    courseId: COURSE_CC,
    offset: 2,
    hour: 9,
    minute: 45
  }),
  lesson({
    id: 'local-calendar-ki-naechste-woche',
    summary: 'KI im Schulkontext · Ergebnispräsentation',
    location: 'Aula',
    description: '<p>Die Gruppen stellen ihre Ergebnisse vor.</p>',
    courseId: COURSE_KI,
    offset: 6,
    hour: 13,
    minute: 0,
    durationMinutes: 60
  }),
  {
    type: 'event',
    id: 'local-calendar-konferenz',
    attributes: {
      uid: 'local-calendar-konferenz',
      summary: 'Gesamtkonferenz',
      location: 'Lehrerzimmer',
      description: 'Halbjahresplanung und Vertretungsregelungen.',
      dtstart: day(3, 15, 0).toISOString(),
      dtend: day(3, 16, 30).toISOString(),
      dtstamp: new Date().toISOString()
    },
    relationships: { 'scope-ids': [] }
  }
];

const json = (res, status, body) => {
  if (status === 204) {
    res.writeHead(204, {
      'access-control-allow-origin': '*',
      'access-control-allow-headers': 'authorization,content-type,accept',
      'access-control-allow-methods': 'GET,POST,PUT,DELETE,OPTIONS'
    });
    res.end();
    return;
  }
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'access-control-allow-origin': '*',
    'access-control-allow-headers': 'authorization,content-type,accept',
    'access-control-allow-methods': 'GET,POST,PUT,DELETE,OPTIONS',
    'content-length': Buffer.byteLength(payload)
  });
  res.end(payload);
};

const readBody = async (req) => new Promise((resolve, reject) => {
  let body = '';
  req.setEncoding('utf8');
  req.on('data', chunk => { body += chunk; });
  req.on('end', () => {
    if (!body) return resolve(undefined);
    try { resolve(JSON.parse(body)); } catch (error) { reject(error); }
  });
  req.on('error', reject);
});

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
    if (req.method === 'OPTIONS') {
      json(res, 204);
      return;
    }

    if (req.method === 'GET' && (url.pathname === '/events' || url.pathname === '/events/')) {
      json(res, 200, { data: events });
      return;
    }

    if (req.method === 'GET' && url.pathname.startsWith('/events/')) {
      const id = decodeURIComponent(url.pathname.split('/').filter(Boolean)[1] ?? '');
      const event = events.find(item => item.id === id || item.attributes.uid === id);
      if (!event) {
        json(res, 404, { errors: [{ detail: 'event not found' }] });
        return;
      }
      json(res, 200, { data: event });
      return;
    }

    if (req.method === 'POST' && (url.pathname === '/events' || url.pathname === '/events/')) {
      const body = await readBody(req);
      const incoming = body?.data?.[0];
      if (!incoming?.attributes) {
        json(res, 400, { errors: [{ detail: 'missing data[0].attributes' }] });
        return;
      }
      const uid = incoming.attributes.uid || `local-${Date.now()}`;
      const event = { type: 'event', id: uid, attributes: { ...incoming.attributes, uid }, relationships: incoming.relationships ?? {} };
      events.push(event);
      json(res, 201, { data: [event] });
      return;
    }

    if (req.method === 'PUT' && url.pathname.startsWith('/events/')) {
      const id = decodeURIComponent(url.pathname.split('/').filter(Boolean)[1] ?? '');
      const body = await readBody(req);
      const incoming = body?.data?.[0];
      const index = events.findIndex(item => item.id === id || item.attributes.uid === id);
      if (index === -1 || !incoming?.attributes) {
        json(res, 404, { errors: [{ detail: 'event not found' }] });
        return;
      }
      events[index] = { ...events[index], attributes: { ...events[index].attributes, ...incoming.attributes } };
      json(res, 200, { data: [events[index]] });
      return;
    }

    if (req.method === 'DELETE' && url.pathname.startsWith('/events/')) {
      const id = decodeURIComponent(url.pathname.split('/').filter(Boolean)[1] ?? '');
      events = events.filter(item => item.id !== id && item.attributes.uid !== id);
      json(res, 204);
      return;
    }

    if (req.method === 'DELETE' && url.pathname.startsWith('/scopes/')) {
      json(res, 204);
      return;
    }

    json(res, 404, { errors: [{ detail: 'not found', path: url.pathname }] });
  } catch (error) {
    json(res, 500, { errors: [{ detail: String(error?.message ?? error) }] });
  }
});

server.listen(port, host, () => {
  console.log(`local calendar server listening on http://${host}:${port}`);
});
