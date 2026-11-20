-- Imágenes de eventos: aisladas por productora; públicas sólo cuando el evento ya no es borrador.
GRANT SELECT, INSERT, UPDATE, DELETE ON event_media TO venti_app;
--> statement-breakpoint
ALTER TABLE event_media ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE event_media FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY event_media_tenant ON event_media FOR ALL TO venti_app
  USING (organization_id = venti_org()) WITH CHECK (organization_id = venti_org());
--> statement-breakpoint
CREATE POLICY event_media_public_read ON event_media FOR SELECT TO venti_app
  USING (EXISTS (SELECT 1 FROM events e WHERE e.id = event_media.event_id AND e.status <> 'draft'));
--> statement-breakpoint
-- La portada siempre apunta a una imagen del mismo evento (o a ninguna).
ALTER TABLE events ADD CONSTRAINT events_cover_media_fk FOREIGN KEY (cover_media_id) REFERENCES event_media(id) ON DELETE SET NULL;
