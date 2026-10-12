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
| 3 | Rolle Baubegleitung, Bauzeitenplan (Bestätigung), Pläne & Dokumente (Index, „ungültig“, Sichtbarkeit), Kommunikation (Projektkanal, Einzelkanäle, Lesebestätigung) | **dieser Stand** – SQL `0002_…` ausführen |
| 4 | Protokolle (Art noch festzulegen), Bautagebuch, Mängel | nach Bedarf |
| 5 | Eigenes App-Symbol (Logo), eigene Domain | offen |

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
