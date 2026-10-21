# Schöttes Bauportal

Web-App zur gewerkeübergreifenden Baustellenorganisation: Projekte, Stammdaten,
Kontaktliste, Zugänge mit Rollen. Läuft im Browser und lässt sich auf dem
Smartphone zum Home-Bildschirm hinzufügen (kein App Store nötig).

**Technik:** Next.js (Hosting auf Vercel) · Supabase (Datenbank, Login, Region Frankfurt)

## Stand

| Schritt | Inhalt | Status |
|---|---|---|
| 1 | Konten GitHub / Supabase / Vercel | erledigt |
| 2 | Login, Projekte, Rollen, Stammdaten, Kontakte, Zugänge | erledigt |
| 3 | Rolle Baubegleitung, Bauzeitenplan (Bestätigung), Pläne, Kommunikation (Projektkanal, Einzelkanäle, Lesebestätigung) | erledigt – SQL `0002_…` |
| 4 | Reiter: Übersicht · Themen · Kommunikation · Bauzeitenplan · Dokumente · Kontakte · Protokolle · Stammdaten. Themen (Festlegungen), Bauzeitenplan mit KW-Balkenplan, Puffer (intern), Notizen/Terminproblem, Excel-Import; Dokumente mit Sichtbarkeit alle/Bauherr/Gewerk/intern; Protokolle + Ortstermine mit Fotos; Rechnungsadresse | **dieser Stand** – SQL `0003_…` |
| 4b | Reiter „Projektstand“ (ersetzt „Themen“): Schrittkette mit „Ball liegt bei“, Alters-Ampel, Notizen, Vorlage Sanierung; Themen & Festlegungen als einfaches Textfeld mit Antworten | **dieser Stand** – SQL `0004_…` |
| 4c | Ordner für Dokumente (0005), Auftraggeber darf Pläne/Dokumente hochladen und eigene Uploads verwalten (0006) | erledigt – SQL `0005_…`, `0006_…` |
| 5 | E-Mail-Benachrichtigung (sofort gebündelt / täglich / aus) über Resend + Supabase-Zeitplan | SQL `0008_…` + `benachrichtigung_zeitplan.sql` |
| 6 | Eigenes App-Symbol (Logo), eigene Domain | offen |

### Excel-Import Bauzeitenplan
Erste Tabelle der Datei. Erkannt werden Spalten wie *Maßnahme/Vorgang*, *Start/Beginn*
(Kalenderwoche oder Datum), *Dauer in Wochen/Tagen* oder *Ende*, optional *Gewerk*.
Platzhalterzeilen („Aktivität 20“) werden übersprungen. Vorschau vor dem Übernehmen.

## Rollen

| Rolle | Darf |
|---|---|
| Administrator | Projekte anlegen, alle Projekte sehen, Passwörter zurücksetzen (Einstellung nur per SQL) |
| Bauleitung | Inhalte und Zugänge des Projekts pflegen |
| Berater | alles im Projekt sehen, nichts ändern |
| Auftraggeber / Gewerk | Projektinhalte sehen |

Die Rechte werden in der Datenbank durchgesetzt (Row Level Security), nicht nur in der Oberfläche.

## Einrichtung (einmalig)

1. **Datenbank:** Supabase → *SQL Editor* → *New query* → Inhalt von
   `supabase/migrations/0001_grundgeruest.sql` einfügen → *Run*.
2. **Eigenen Login anlegen:** Supabase → *Authentication* → *Users* → *Add user* →
   *Create new user* → E-Mail + Passwort, Haken bei *Auto Confirm User*.
3. **Zum Administrator machen:** SQL Editor → Inhalt von
   `supabase/admin_einrichten.sql` ausführen (E-Mail ggf. anpassen).
4. **Vercel:** *Add New → Project* → dieses Repository importieren → unter
   *Environment Variables* eintragen (Werte aus Supabase → *Project Settings → API Keys*):
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` (Publishable bzw. anon key)
   - `SUPABASE_SERVICE_ROLE_KEY` (Secret bzw. service_role key – **geheim**)
   - optional `NEXT_PUBLIC_APP_NAME`
   → *Deploy*.
5. **Supabase → Authentication → Sign In / Providers:** *Allow new users to sign up*
   ausschalten (Zugänge werden nur über die App angelegt).

## Hinweise

- Zugangsdaten für Beteiligte werden in der App erzeugt und **nur einmal angezeigt**.
  E-Mail-Adresse und Passwort getrennt übermitteln.
- Datenschutz: Auftragsverarbeitungsverträge mit Supabase und Vercel abschließen
  (Art. 28 DSGVO), Datenschutzhinweis für Beteiligte bereitstellen.
