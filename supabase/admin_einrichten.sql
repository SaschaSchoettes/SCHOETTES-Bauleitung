-- Einmalig nach dem ersten Login-Nutzer ausführen:
-- macht den angegebenen Nutzer zum Administrator (darf Projekte anlegen,
-- sieht alle Projekte, kann Passwörter zurücksetzen).
--
-- E-Mail-Adresse bei Bedarf anpassen.

update public.profiles
set is_admin = true,
    full_name = coalesce(full_name, 'Sascha Schöttes')
where email = 'info@schoettes.com';

-- Kontrolle:
select email, full_name, is_admin from public.profiles;
