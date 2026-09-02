# Kalender-Mock für die lokale Entwicklung

Ein Ersatz für den Kalender-Dienst, damit Stundenplan und Termine lokal etwas anzeigen. Der
echte Dienst ist ein eigener Service, der nicht Teil dieses Repos ist — ohne ihn bleibt jede
Termin-Ansicht in den Clients leer, und es lässt sich nicht unterscheiden, ob eine Ansicht kaputt
ist oder einfach keine Daten hat.

Der Mock hielt sich lange nur in einem ungetrackten Ordner neben den Repos und ging bei jedem
frischen Checkout verloren. Deshalb liegt er jetzt hier.

## Starten

```bash
node scripts/calendar-mock/server.mjs
```

Standard: `http://0.0.0.0:3000`, über `PORT` und `HOST` verstellbar.

Damit der Server ihn benutzt, in `.env.development`:

```
CALENDAR_SERVICE_ENABLED=true
CALENDAR_URI=http://localhost:3000
```

`CALENDAR_SERVICE_ENABLED` steht dort ausgeliefert auf `false`.

## Was er kann

JSON:API-förmig, wie der echte Dienst:

| Route | Zweck |
|---|---|
| `GET /events` | alle Termine |
| `GET /events/:id` | ein Termin (nach `id` oder `uid`) |
| `POST /events` | Termin anlegen (`data[0].attributes`) |
| `PUT /events/:id` | Termin ändern |
| `DELETE /events/:id` | Termin löschen |
| `DELETE /scopes/:id` | no-op, `204` |

CORS ist offen, damit auch ein Browser-Client direkt anfragen kann. Der Zustand liegt im
Arbeitsspeicher: ein Neustart stellt die Demo-Termine wieder her.

## Die Demo-Termine

Sechs Termine, relativ zum *heutigen* Datum erzeugt — der Stundenplan ist damit nie leer und
altert nicht weg. Fünf hängen über `x-sc-courseid` und `scope-ids` an **echten geseedeten
Kurs-Ids** aus `npm run setup:db:seed` (Mathe, KI im Schulkontext, CC_Test_Kurs), sodass der
verlinkte Kurs in den Clients tatsächlich aufgeht statt auf einer Id zu enden, die es nirgends
gibt. Der sechste (Gesamtkonferenz) hat bewusst keinen Kurs, damit auch dieser Fall vorkommt.

Ändern sich die Seed-Kurs-Ids, gehören die drei Konstanten am Kopf von `server.mjs`
nachgezogen.
