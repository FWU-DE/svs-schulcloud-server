# Board-Vorschau in der Board-Liste

Jede Board-Karte im Raum zeigt eine Miniatur des Boards: Spalten, Karten samt Farbe und pro
Karte die Icons ihrer Elemente. Die Vorschau soll erkennbar machen, _welches_ Board man
anklickt — sie zeigt die Form eines Boards, nicht seine Inhalte.

Server-Anteil in diesem Repo, Client-Anteil im Nachbar-Repo `nuxt-client`; beide auf dem Branch
`feat/padlet-inspired-elements`.

## Woher die Daten kommen

`GET /rooms/:roomId/boards` liefert pro Board ein zusätzliches Feld `preview`:

```jsonc
{
	"columnCount": 5, // alle Spalten, auch die nicht gelisteten
	"columns": [
		{
			"title": "Material",
			"cardCount": 9, // alle Karten der Spalte
			"cards": [{ "backgroundColor": "amber", "elementTypes": ["richText", "poll"], "elementCount": 2 }],
		},
	],
}
```

Gekappt wird in [`board-preview.ts`](../apps/server/src/modules/board/domain/board-preview.ts)
(`BOARD_PREVIEW_LIMITS`: 6 Spalten, 8 Karten, 3 Element-Typen). Die `*Count`-Felder nennen
jeweils die Gesamtzahl, damit der Client ein „+3" anzeigen kann, ohne den Rest zu laden.

## Warum kein Thumbnail und kein Cache

Die Vorschau wird bei jeder Anfrage aus der Datenbank gebaut — mit **einer** zusätzlichen
Projektions-Abfrage über die Nachfahren aller Boards des Raums
(`BoardNodeRepo.findPreviewNodes`). Geladen werden nur `path`, `level`, `position`, `type`,
`title` und `backgroundColor`; kein Board-Baum, keine Element-Inhalte (RichText, Umfrage-Optionen,
Kommentare). Board-Knoten tragen ihre Abstammung im `path`, deshalb genügt die flache Liste, um
die Miniatur zusammenzusetzen.

Damit gibt es nichts zu invalidieren: eine am Board gespeicherte Vorschau (oder ein gerendertes
Thumbnail) müsste bei jeder Änderung an Spalte, Karte oder Element nachgezogen werden — über REST
_und_ über die Board-Collaboration-Websocket-Gateways. Falls die Abfrage später doch zu teuer
wird, ist `ColumnBoardService.getPreviews()` die Stelle für einen Cache: `buildBoardPreviews()`
ist eine reine Funktion, das Ergebnis ist klein und JSON-fähig.

## In der Raumliste steht eine Zahl, kein Bild

Eine Miniatur pro Raumkachel sah unruhig aus und war bei mehreren Boards pro Raum ohnehin
willkürlich. `GET /rooms` liefert deshalb nur `boardCount`, und die Kachel zeigt es als Chip neben
der Mitgliederzahl („2 Bereiche").

Gezählt wird, was die Person sehen darf: Entwürfe kommen nur mitgezählt, wenn die Raumrolle
`viewDraftContent` erlaubt (`RoomArrangementUc`). Die Zahl kostet eine Abfrage für die ganze
Liste — `BoardNodeRepo.countBoardsByContexts` holt die Board-Knoten aller Räume auf einmal, ohne
deren Inhalt.

## Client

[`BoardPreview.vue`](../../nuxt-client/src/modules/feature/room/BoardPreview.vue) malt die
Miniatur mit denselben Kartenfarben wie das echte Board (`colorToHexLighten5` /
`colorToHexLighten3`) und denselben Element-Icons wie der „Element hinzufügen"-Dialog. Ein
einspaltiges Board (`BoardLayout.LIST`) stapelt seine Spalten, ein mehrspaltiges stellt sie
nebeneinander — genau wie im Board selbst.

Elemente, die das Board selbst als Bild zeigt — Whiteboard und kollaboratives Dokument — behalten
diese Illustration als kleines Thumbnail; ein Textelement wird zu zwei grauen Platzhalterzeilen,
alles andere zu seinem Icon. Eine Karte mit Bild zeigt nur das Bild, so wie das Whiteboard auch
die echte Karte dominiert.

Der Client kappt noch einmal enger als der Server (5 Spalten, 3 Karten, 2 Elemente; einspaltig
2 Spalten), weil in eine Kachel von 112 px Höhe nicht mehr hineinpasst. Hat eine Spalte mehr
Karten als angezeigt werden, gibt sie ihren letzten Platz an das „+n" ab, statt eine halbe Karte
abzuschneiden. Die Vorschau ist dekorativ (`aria-hidden`): Typ, Titel und Entwurfs-Status der
Karte stehen als Text darüber.
