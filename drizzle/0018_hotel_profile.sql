-- Hotel profile: a name (already existed) plus an optional uploaded logo,
-- shown across that hotel's own dashboards instead of the generic mark.
ALTER TABLE hotels ADD COLUMN logo_object_key TEXT;

PRAGMA optimize;
