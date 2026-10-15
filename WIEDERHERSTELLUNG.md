# Schöttes Bauportal – Sicherung & Wiederherstellung

Stand: 14.10.2026 · Adresse: https://portal.schoettes.com

Diese Sicherung enthält den vollständigen Programmcode, alle Datenbank-Skripte und
diese Anleitung. **Nicht enthalten** sind die eingetragenen Projektdaten (Projekte,
Themen, Dokumente, Fotos …) – diese liegen in der Supabase-Datenbank.

## Bausteine

| Baustein | Anbieter | Zweck | Konto |
|---|---|---|---|
| Code | GitHub | Speicherort des Programms | SaschaSchoettes / SCHOETTES-Bauleitung (privat) |
| Hosting | Vercel | stellt die App im Internet bereit, baut bei jeder Änderung automatisch neu | Team „Schöttes“, Projekt „schoettes-bauleitung“ |
| Datenbank, Login, Dateien | Supabase | speichert alle Inhalte, Region Frankfurt | Organisation „Schöttes“, Projekt „Schöttes Bauleitung“ |
| Domain | IONOS | `portal.schoettes.com` (CNAME auf Vercel) | schoettes.com |

## Neuaufbau von Grund auf

1. **GitHub:** neues privates Repository anlegen, Inhalt dieser ZIP hochladen
   (ohne `node_modules`).
2. **Supabase:** neues Projekt, Region *Central EU (Frankfurt)*.
   SQL Editor → nacheinander ausführen (jeweils kompletten Dateiinhalt einfügen → *Run*):
   1. `supabase/migrations/0001_grundgeruest.sql`
   2. `supabase/migrations/0002_bauzeitenplan_plaene_kommunikation.sql`
   3. `supabase/migrations/0003_themen_dokumente_protokolle.sql`
   4. `supabase/migrations/0004_projektstand.sql`
   5. `supabase/migrations/0005_ordner.sql`
   6. `supabase/migrations/0006_upload_auftraggeber.sql`

   Die Skripte sind wiederholbar – ein zweiter Lauf schadet nicht.
3. **Eigenen Login anlegen:** Authentication → Users → *Add user* → E-Mail + Passwort,
   *Auto Confirm User* anhaken.
4. **Admin-Rechte:** SQL Editor → `supabase/admin_einrichten.sql` ausführen.
5. **Selbstregistrierung aus:** Authentication → Sign In / Providers →
   *Allow new users to sign up* ausschalten.
6. **Vercel:** *Add New → Project* → Repository importieren →
   *Environment Variables* (Werte aus Supabase → Project Settings):

   | Schlüssel | Wert | Typ |
   |---|---|---|
   | `NEXT_PUBLIC_SUPABASE_URL` | Project URL, z. B. `https://xxxx.supabase.co` (ohne `/rest/v1/`) | Konfiguration |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Publishable key (`sb_publishable_…`) | Konfiguration |
   | `SUPABASE_SERVICE_ROLE_KEY` | Secret key (`sb_secret_…`) – **geheim** | Geheimnis |

   → *Deploy*. Bei Änderungen an Variablen: Deployments → … → *Redeploy*.
7. **Domain:** Vercel → Domains → `portal.schoettes.com` hinzufügen →
   angezeigten CNAME-Eintrag bei IONOS (DNS von schoettes.com) anlegen, Hostname `portal`.

## Wichtige Hinweise

- **Browser-Übersetzung** bei Vercel und Supabase ausschalten – sie verfälscht
  Variablennamen (z. B. `NÄCHSTE_ÖFFENTLICHE_…`).
- **Secret key** niemals weitergeben, in Chats oder auf GitHub ablegen.
- **Supabase Free** pausiert nach 7 Tagen ohne Nutzung (Daten bleiben, App nicht
  erreichbar → Dashboard → *Restore project*) und hat **keine** wiederherstellbaren
  Backups. Für Kundenbetrieb: Supabase Pro (tägliche Backups) und Vercel Pro
  (kommerzielle Nutzung).
- Datenschutz: Auftragsverarbeitungsverträge mit Supabase und Vercel abschließen
  (Art. 28 DSGVO); Impressum und Datenschutzhinweis für Nutzer bereitstellen.

## Rollen

| Rolle | Rechte |
|---|---|
| Administrator | Projekte anlegen, alle Projekte, Passwörter zurücksetzen (nur per SQL vergeben) |
| Bauleitung / Baubegleitung | alle Inhalte und Zugänge des Projekts pflegen |
| Berater | alles sehen, nichts ändern |
| Auftraggeber | Projektinhalte sehen inkl. Angebote/Rechnungen; Pläne/Dokumente hochladen, eigene Uploads verwalten |
| Gewerk | Projektinhalte sehen, nur eigene Angebote/Rechnungen; Notizen, Themen, Nachrichten an Bauleitung |

## Reiter

Projektstand · Festlegungen / Themen · Kommunikation · Bauzeitenplan · Dokumente ·
Kontakte · Protokolle · Stammdaten (mit Zugängen)
