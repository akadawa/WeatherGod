# WeatherGod – Agent-Gedächtnis

> **Letzte Aktualisierung:** Projekt umbenannt; Docker für Synology Dockhand vorbereitet

## Persistenz

Alle UI-Einstellungen werden serverseitig in **SQLite** gespeichert (`DATABASE_PATH`, Default `./data/weathergod.db`).

| API | Beschreibung |
|-----|--------------|
| `GET /api/settings` | Einstellungen laden |
| `PUT /api/settings` | Teilupdate (Merge) |

### Gespeicherte Felder

- Standort: `lat`, `lon`
- Karte: `centerLat`, `centerLon`, `zoom`, `mapView`
- Suche: `searchQuery`
- Monitoring: `intervalMinutes`, `westThreshold`
- Fassaden: `partition`, `selectedFacade`

Frontend: `AppStorage` → API (localStorage nur als Offline-Fallback + einmalige Migration von `solarpilot-*`).

Legacy: Existiert `./data/solarpilot.db` noch, wird sie automatisch genutzt, wenn `weathergod.db` fehlt.

## Docker / Synology Dockhand

Repository: https://github.com/akadawa/WeatherGod.git

1. Repo klonen oder in Dockhand als Git-Stack einbinden
2. `.env.example` nach `.env` kopieren, **Standort** (`DEFAULT_LAT` / `DEFAULT_LON`) und ggf. ntfy-Topic eintragen
3. Stack starten: `docker compose up -d --build`
4. Im Browser: `http://<NAS-IP>:3000` (Port in `docker-compose.yml` anpassbar, z. B. `8080:3000`)

Persistenz: Volume `weathergod-data` → `/app/data` (SQLite unter `weathergod.db`).

Healthcheck: `GET /api/health`

Icon: Platzhalter unter `/img/icon.png` – neues Icon später ersetzen.

**Dockhand-Anleitung:** siehe [`DOCKER.md`](DOCKER.md) – auf Synology `docker-compose.synology.yml` (Image von ghcr.io, kein lokaler Build).

## Datenschutz / sensible Daten

Im **Git-Repository** stehen **keine** persönlichen Standorte, Webcam-URLs oder Stream-Links.

Nutzerdaten (Standort, `webcamSource`, Dashboard-Layout) liegen nur in:

- SQLite (`DATABASE_PATH`, Volume auf der NAS)
- Browser-`localStorage` (`weathergod-state`)

Zum vollständigen Entfernen: Volume/DB löschen und Browser-Speicher leeren. Test-Skripte mit URLs gehören in `scripts/` (gitignored), nie committen.
