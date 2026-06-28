# WeatherGod mit Dockhand deployen

Anleitung für **Synology NAS** mit [Dockhand](https://dockhand.pro/) und dem Compose-Stack aus diesem Repository.

Repository: https://github.com/akadawa/WeatherGod (privat)

---

## Voraussetzungen

- Docker / Container Manager auf der Synology
- Dockhand installiert und erreichbar
- GitHub-Zugang zum privaten Repo (Token oder SSH)
- Freier Host-Port (Standard: **3000**)

---

## Synology (empfohlen): Image pullen, nicht bauen

Auf vielen Synology-Systemen schlägt ein **lokaler Docker-Build** fehl:

```text
client version 1.52 is too new. Maximum supported API version is 1.43
```

Dockhand ist neuer als der Synology-Docker-Daemon. **Lösung:** vorgefertigtes Image von GitHub Container Registry (ghcr.io) pullen – kein Build auf der NAS.

### 1. Image-Build abwarten (GitHub Actions)

Bei jedem Push auf `main` baut GitHub Actions automatisch:

`ghcr.io/akadawa/weathergod:latest`

Status prüfen: GitHub → Repository **WeatherGod** → Tab **Actions** → Workflow „Build and publish Docker image“ muss grün sein (ca. 2–5 Min. nach dem Push).

### 2. Registry-Zugang in Dockhand (privates Package)

Das Image ist an das private Repo gekoppelt. In Dockhand:

1. **Integrations** → **Registries** (oder **Docker Registries**)
2. Registry hinzufügen:

   | Feld | Wert |
   |------|------|
   | Registry | `ghcr.io` |
   | Benutzername | `akadawa` (dein GitHub-Name) |
   | Passwort | GitHub **Personal Access Token** mit Scope **`read:packages`** |

3. Speichern / Verbindung testen

Alternativ: unter GitHub → **Packages** → `weathergod` → **Package settings** → **Change visibility** → Public (dann kein Registry-Login nötig).

### 3. Git-Stack in Dockhand

1. **Stacks** → **From Git**
2. Einstellungen:

   | Feld | Wert |
   |------|------|
   | Stack-Name | `weathergod` |
   | Repository | `https://github.com/akadawa/WeatherGod.git` |
   | Branch | `main` |
   | Compose-Pfad | **`docker-compose.synology.yml`** |

3. **Umgebungsvariablen** – Standort **selbst setzen** (Pflicht für Wetter ohne gespeicherte Einstellungen):

   ```
   DEFAULT_LAT=<Breitengrad>
   DEFAULT_LON=<Längengrad>
   TZ=Europe/Berlin
   HOST_PORT=8080
   NTFY_TOPIC=weathergod-mein-eindeutiger-name
   ```

   Im Repository stehen **keine** Koordinaten – nur deine Werte in Dockhand eintragen.

4. **Deploy** – Dockhand **pullt** das Image, baut **nicht** lokal.

### 4. Prüfen

- Container **weathergod** → Status **healthy**
- Browser: `http://<NAS-IP>:3000` (oder `HOST_PORT`)
- Dashboard: `http://<NAS-IP>:3000/dashboard.html`

### 5. Updates

Nach Push auf `main`:

1. GitHub Actions abwarten (neues Image)
2. Dockhand → Stack **weathergod** → **Redeploy** (Pull + Restart)

---

## Variante B – Lokaler Build (PC oder neue Synology)

Nur wenn der Docker-Daemon Build unterstützt (nicht bei API-1.43-Fehler):

| Feld | Wert |
|------|------|
| Compose-Pfad | `docker-compose.yml` |

Diese Datei baut aus dem `Dockerfile` (`pull_policy: build`, kein Registry-Pull).

---

## Optional: API-Version an Dockhand anpassen

Falls du trotzdem lokal bauen willst:

1. Synology **Container Manager** → Container **dockhand** → Bearbeiten
2. Umgebungsvariable hinzufügen: `DOCKER_API_VERSION=1.43`
3. Dockhand neu starten, erneut deployen

Funktioniert nicht auf allen Synology-Versionen zuverlässig – **Synology-Compose mit ghcr.io ist robuster**.

---

## Persistenz & Backup

| Was | Wo |
|-----|-----|
| SQLite-Datenbank | Volume `weathergod-data` → `/app/data/weathergod.db` |
| Einstellungen | in dieser DB |

**Backup:** Volume oder `weathergod.db` sichern.

---

## Typische Probleme

### `client version 1.52 is too new` / API 1.43

→ **`docker-compose.synology.yml`** verwenden (siehe oben), nicht `docker-compose.yml`.

### `pull access denied for ghcr.io/akadawa/weathergod`

→ Registry-Login in Dockhand (PAT mit `read:packages`) oder Package auf GitHub public stellen.

### GitHub Actions noch nicht gelaufen

→ Tab **Actions** prüfen; erst nach grünem Build deployen.

### `.env not found`

→ Keine `.env` nötig. Variablen in Dockhand unter Stack → Environment setzen.

### Port belegt

→ `HOST_PORT=8080` (oder anderen freien Port) setzen.

### Healthcheck unhealthy

→ 15–30 s warten; testen: `http://<NAS-IP>:3000/api/health`

### Webcam-URL / Standort noch gespeichert (nicht im Git)

→ Liegt in SQLite-Volume oder Browser-`localStorage`, nicht im Repository. Volume `weathergod-data` löschen oder in der App Webcam-Stream entfernen (Papierkorb-Button).

---

## Synology-Hinweis (Dockhand)

Am Dockhand-Container optional: `SKIP_DF_COLLECTION=true` (Performance auf Synology).

---

## Compose-Dateien im Überblick

| Datei | Zweck |
|-------|--------|
| `docker-compose.synology.yml` | **Synology/Dockhand** – pull von ghcr.io |
| `docker-compose.yml` | Lokaler Build (Entwicklung, starke Docker-Hosts) |

Weitere Details: `agent.md`
