-- Eventos que la productora sacó de sus listas (los que tuvieron ventas no se borran: se archivan).
ALTER TABLE "events" ADD COLUMN "archived_at" timestamp with time zone;
