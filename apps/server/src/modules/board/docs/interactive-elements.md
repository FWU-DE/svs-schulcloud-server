# Padlet-inspirierte Board-Funktionen

Stand: 2026-08-26. Was hinter `FEATURE_COLUMN_BOARD_INTERACTIVE_ELEMENTS_ENABLED`
steckt, welche Entwurfsentscheidungen bewusst so getroffen wurden und wo die
Grenzen liegen. Der Code sagt, *was* passiert — dieses Dokument sagt, *warum*.

## Das Feature-Flag

Ein Schalter für die ganze Gruppe: `FEATURE_COLUMN_BOARD_INTERACTIVE_ELEMENTS_ENABLED`,
per Default **aus**. Er wird an drei Stellen durchgesetzt, nicht nur in der UI:

- `CardUc.createElement` lehnt die neuen Element-Typen ab,
- `CardUc.reactToCard` / die Kommentar-Methoden / `updateCardSettings` lehnen die
  Aktion ab,
- `BoardUc.updateReactionType` und `updateCommentsEnabled` lehnen das Einschalten ab.

Damit lässt sich das Flag auch nach dem Ausrollen wieder zudrehen: bestehende
Elemente bleiben sichtbar, aber niemand kann mehr abstimmen, reagieren oder
kommentieren. In `.env.test` steht es auf `true`, sonst könnten die API-Tests die
Endpunkte nicht ansprechen, die sie prüfen.

## Nutzerzustand: wer darf was sehen

Die drei Funktionen mit Nutzerzustand — Umfrage, Reaktionen, Kommentare — teilen
sich ein Muster, das an zwei Stellen sitzt:

**`BoardViewContext`** (`domain/types/board-view-context.ts`) beschreibt, *für
wen* eine Antwort gebaut wird: `userId`, `canEdit`, `canModerate`, `reactionType`,
`commentsEnabled`, `authorNames`. Fehlt der Kontext, liefert der Mapper die
sichere Lesart — kein persönlicher Zustand, keine Ergebnisse. Das ist genau die
Variante, die an einen ganzen Board-Raum gehen darf.

**Getrennte Socket-Payloads.** Eine Stimme, eine Reaktion und eine
Kommentaränderung erzeugen bewusst zwei verschiedene Nachrichten: der Raum
bekommt nur die neuen Summen, die handelnde Person zusätzlich ihren eigenen
Zustand zurück. Ein gemeinsamer Payload würde allen Teilnehmenden die Wahl der
abstimmenden Person mitteilen — genau das, was eine anonyme Umfrage nicht darf.

`Card.store.ts` schützt die Gegenrichtung: die Raum-Nachricht trägt eine leere
`ownVote`, und der Store überschreibt damit **nicht** die eigene Stimme.

## Umfrage

- **Anonym vs. offen.** Eine offene Umfrage speichert `userId` pro Stimmzettel,
  eine anonyme nur `voterHash` — ein HMAC über ein Salt, das pro Element erzeugt
  wird. Der Hash reicht, um eine zweite Stimme derselben Person zu erkennen und
  ihr die eigene Wahl zu zeigen, trägt aber keinen Namen. Wer `voterSalt` löscht,
  macht die verbleibenden Stimmzettel endgültig unzuordenbar.
  *Restrisiko:* Wer Datenbankzugriff hat und die Mitgliederliste kennt, kann den
  Hash über eine Klasse durchprobieren. Gegen einen Angreifer mit DB-Zugriff
  schützt das Verfahren nicht — gegen versehentliche Offenlegung über die API
  schon, und die ist der realistische Fall.
- **Ergebnis-Sichtbarkeit** hat drei Stufen: sofort, nach eigener Stimmabgabe,
  oder erst nach Freigabe durch jemanden mit Bearbeitungsrecht. „Nach Ende der
  Umfrage" gibt es bewusst nicht mehr: Beenden stoppt das Abstimmen, Freigeben
  zeigt die Ergebnisse — zwei Dinge, die man getrennt wollen kann.
- **Wer bearbeiten darf, sieht immer die Ergebnisse.** Sonst könnte eine Lehrkraft
  eine Umfrage mit Freigabe-Modus anlegen und selbst nicht sehen, was drinsteht.
- **Antworten ändern löscht die Stimmen.** `configure()` vergleicht Options-*IDs*,
  nicht die Beschriftungen: einen Tippfehler zu korrigieren kostet keine Stimmen,
  eine Antwort hinzuzufügen oder zu entfernen schon. Das Gleiche gilt beim
  Umschalten der Anonymität, weil sich damit der Schlüssel ändert, unter dem
  Stimmen abgelegt sind.
- **Abstimmen ist kein Element-Update.** Es braucht Lese-, nicht Schreibrecht auf
  das Board (`voteInPoll: _canViewBoard`) — sonst könnten genau die Leute nicht
  abstimmen, für die die Umfrage gedacht ist.

## Reaktionen

- Die Reaktionsart ist eine **Board-Einstellung** (`none` / `like` / `star` /
  `vote`), keine pro Karte: zwei Karten desselben Boards sollen vergleichbar sein.
- **Bewertungen (`grade`) fehlen absichtlich.** Eine Note, die alle lesen können,
  ist eine Leistungsbeurteilung und keine Reaktion; sie bräuchte eine eigene
  Berechtigungs- und Datenschutzgeschichte.
- Die Antwort nennt **Summen und den eigenen Wert**, nie eine Liste der
  Reagierenden. Eine Karte ist kein Ort, an dem eine Klasse ablesen soll, wer wen
  gemocht hat. Ein API-Test prüft, dass in der Antwort kein `userId` vorkommt.
- **Eine Reaktion pro Person**: nochmal klicken ersetzt, stapelt nicht. Die Zahl
  auf der Karte ist damit eine Zahl von Personen.

## Kommentare

- Kommentare hängen **an der Karte**, nicht an einem Element — so wie in Padlet
  ein Kommentar am Post hängt. Sie liegen eingebettet im Karten-Dokument, nicht in
  einer eigenen Collection: für ein Klassen-Board ist das die einfachere Lösung,
  und jede Änderung erzeugt ohnehin ein Karten-Update, das der Raum sowieso
  bekommt.
- **Löschen behält die Hülle.** Ein entfernter Kommentar bleibt als Platzhalter
  stehen (`isRemoved`), damit ein Gesprächsfaden nicht unerklärliche Lücken
  bekommt. Der Text ist weg, nicht nur ausgeblendet.
- **Melden** ist von Löschen getrennt: eine meldende Person sieht ihre eigene
  Meldung (`ownReport`), aber nur wer moderieren darf, sieht die Meldungen der
  anderen. Wer moderiert, kann fremde Kommentare entfernen; das Ergebnis ist als
  `removedByModerator` markiert.
- **Namen.** Der Kommentar speichert nur `userId`; die Anzeigenamen löst die UC
  über den `UserService` auf und legt sie in den `BoardViewContext`. Wer keinen
  Namen auflösen kann, bekommt einen neutralen Platzhalter statt einer ID.

## Die Einstellungs-Kette: Raum → Bereich → Spalte → Karte

Kommentare und Feedback-Art gibt es auf vier Ebenen. Jede Ebene darf die über ihr
übersteuern; unten in der Kette steht **aus**. Ein Board, an dem niemand etwas
eingestellt hat, verhält sich deshalb genau wie vor diesen Funktionen.

Jede Ebene hält einen **Tri-State**: `undefined` heißt „was die Ebene über mir
sagt", und nur ein ausdrücklich gesetzter Wert gewinnt. Über die API setzt `null`
die Ebene wieder unter die darüberliegende. Ohne diese dritte Stufe könnte man
eine einmal konfigurierte Karte nie wieder ans Board zurückgeben.

Der Raum liegt außerhalb des Board-Baums, seine Werte kommen deshalb nicht von
einem Knoten, sondern aus dem vorbereiteten Board-Kontext
(`BoardConfiguration.roomCommentsEnabled` / `roomReactionType`). Ein Board in
einem **Kurs** hat keine Raum-Ebene — seine Kette beginnt eine Stufe tiefer.

Aufgelöst wird in `resolveCommentsEnabled` / `resolveReactionType`
(`domain/board-settings.ts`); `settingsChainOf` in der `CardUc` baut die Kette aus
dem Authorizable (`boardNode` = Karte, `parentNode` = Spalte, `rootNode` = Board).

`Room.reactionType` speichert dieselben Werte wie `CardReactionType`, aber über
eine **Kopie** des Enums im Raum-Modul: ein Raum darf nicht vom Board-Modul
abhängen. Beide Seiten pinnen sich auf dieselbe Literal-Liste statt sich
gegenseitig zu importieren — ein Import über die Grenze legt einen Zyklus in den
Typgraphen, der auf der anderen Seite unbeteiligte Typen still zu `any`
degradiert. (Genau das ist beim Bauen einmal passiert und hat einen fremden Test
zum Compilieren gebracht, der eigentlich kaputt war.)

**„Alle dürfen bearbeiten"** gibt es auf Board- und Kartenebene. Diese
Übersteuerung greift in `BoardNodeAuthorizableService` (`applyCardOverrides`),
also **vor** der Rechteprüfung — sie gilt damit auch für alle Elemente auf dieser
Karte, nicht nur für die Karte selbst.

## Checkliste: geteilt oder persönlich

`ChecklistProgressMode` entscheidet, **wessen** Fortschritt eine Liste festhält.
`SHARED` ist der Fortschritt der Gruppe: ein Satz Häkchen, den alle sehen und alle
ändern können. `PER_USER` ist eine persönliche Liste — ein Lernweg oder ein
Selbsttest —, bei der jede Person ihre eigenen Häkchen behält.

- **Der Moduswechsel setzt den Fortschritt zurück.** Ein geteiltes Häkchen und ein
  persönliches sind nicht dieselbe Aussage; sie umzudeuten wäre schlimmer als neu
  anzufangen.
- **Wer die Liste führt, sieht Zahlen — keine Namen.** Im persönlichen Modus
  liefert die Antwort für Bearbeitende `checkedCount` pro Punkt und
  `participantCount`; für Teilnehmende fehlen beide. Eine persönliche Checkliste
  soll beim Überblick helfen, nicht über jemanden berichten. Ein API-Test prüft,
  dass in der Antwort kein `userId` vorkommt.
- **Der Socket schweigt bei persönlichen Häkchen.** Ein geteiltes Häkchen geht an
  den ganzen Raum, ein persönliches nur an den eigenen Client — den Raum betrifft
  daran nichts.
- Punkte zu löschen nimmt die persönlichen Häkchen dieser Punkte mit; eine Kopie
  der Liste startet ohne Fortschritt.

## Termine im Kalender

Ein Termin kann für den Kalender markiert werden; `GET /boards/deadlines` liefert
die, die die anfragende Person sehen darf.

**Die Termine werden nicht in den externen Kalenderdienst geschrieben.** Der
Dienst ist optional (`CALENDAR_SERVICE_ENABLED` ist per Default `false`), liegt
außerhalb dieses Systems und müsste in beide Richtungen synchron gehalten werden.
Ein Termin, den jemand in seiner Kalender-App gelöscht hat, ist ein schlimmeres
Problem als einer, der schlicht vom Board gelesen wird. Das Board bleibt der eine
Ort, an dem das Datum lebt; die Kalenderansicht fragt danach.

*Grenze:* Die Suche läuft über die Räume und Kurse der Person, und die Kursabfrage
ist schulgebunden (`findAllByUserId(userId, schoolId)`). Kursmitgliedschaften über
Schulgrenzen hinweg — im Testfactory-Default der Normalfall, in der Praxis die
Ausnahme — tauchen deshalb nicht auf.

## Aufnahme

- Ein Aufnahme-Element hält **genau eine** Aufnahme. Neu aufnehmen löscht deshalb
  erst die vorherige Datei: sonst reiht sich die neue Aufnahme hinter der alten
  ein, die der Player weiter zeigt, und die alte Datei bleibt verwaist im Storage
  liegen.
- Der Dateiname unterscheidet sich zwischen Aufnahmen, sonst liefert eine
  gecachte URL weiter das alte Audio.
- Die Wellenform ist Dekoration: ohne Web Audio wird ohne Bild aufgenommen, statt
  die Aufnahme scheitern zu lassen.

## Code-Block

Hervorhebung passiert im Client (highlight.js), gespeichert wird der Code immer
wörtlich. Was highlight.js ausgibt, ist escaped; ist die Hervorhebung aus oder die
Sprache unbekannt, wird stattdessen hier escaped — das hält eine unbekannte
Sprachangabe harmlos.

## Was Upstream dazu gemacht hat

- `hpi-schul-cloud/schulcloud-server` hat das **Abgabe-Element im März 2026
  entfernt** (BC-11441, PR #6190), zusammen mit nuxt-client PR #4114. Es war also
  nicht „nie migriert", sondern bewusst gelöscht — wer es zurückholen will, sollte
  erst dort nachlesen, warum.
- Es gibt einen nicht gemergten PoC-Branch
  `n21-2414-poc-audio-recording-board-element` (beide Repos) für ein reines
  Audio-Element (`ContentElementType.AUDIO_RECORD`, Felder `caption` und
  `alternativeText`). Unser Aufnahme-Element kann zusätzlich Video und trägt
  deshalb ein `mediaType`. Bei einem späteren Abgleich mit Upstream ist das die
  Stelle, an der die Namen auseinandergehen.
