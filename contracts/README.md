# API-Verträge

Kanonische Beispiel-Payloads der Endpunkte, die native Clients konsumieren. Sie sind die
Quelle der Wahrheit für die Form — nicht für die Werte.

- Der Server prüft in `*.contract.spec.ts`, dass seine DTOs **genau diese Schlüssel mit diesen
  Typen** erzeugen. Eine Umbenennung oder ein Typwechsel lässt den Test platzen.
- Der iOS-Client hält eine Kopie unter `ios-client/Tests/SVSClientTests/Contracts/` und
  dekodiert sie in seine `Codable`-Modelle.
- `ios-client/scripts/sync-api-contracts.sh` vergleicht beide Seiten. Ein Diff heißt: der
  Vertrag hat sich bewegt und der Client ist noch nicht nachgezogen.

Warum kopiert und nicht geteilt: Server und iOS-Client sind getrennte Repositories ohne
gemeinsamen Build. Die Kopie ist bewusst sichtbar, damit die Abweichung im Review auffällt,
statt zur Laufzeit als leerer Screen.

Beim Ändern eines Endpunkts: Fixture hier anpassen, Server-Test läuft grün, dann
`sync-api-contracts.sh` im iOS-Repo ausführen und dessen Tests laufen lassen.

## Korrekturdaten

`submission-status.response.json` enthält `gradeComment`, `attachments[]` und `annotations[]`
für den PDF-Korrekturflow. Auf Branches ohne dieses Datenmodell liefert dasselbe DTO nur
`id`, `submitters`, `isSubmitted`, `grade`, `isGraded` und `submittingCourseGroupName` — dort
schlägt der Vertragstest fehl, bis das Fixture bewusst gekürzt und die iOS-Kopie nachgezogen
wird. Die iOS-Modelle dekodieren die drei Felder optional, brechen an ihrem Fehlen also nicht.
