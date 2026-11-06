CREATE TABLE application_settings (
 id UUID NOT NULL UNIQUE DEFAULT uuid_generate_v4(),
 setting_key TEXT PRIMARY KEY CHECK(setting_key IN ('calendar.max_invitees','calendar.max_audience_persons','calendar.max_audience_edges','calendar.preview_ttl_minutes')),
 value JSONB NOT NULL,
 version INT NOT NULL DEFAULT 1 CHECK(version>0),
 updated_by UUID REFERENCES user_accounts(id),
 reason TEXT NOT NULL CHECK(char_length(reason) BETWEEN 10 AND 1000),
 updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
 CHECK(jsonb_typeof(value)='number' AND (value#>>'{}')~'^[0-9]+$' AND (value#>>'{}')::numeric>=1 AND
  (value#>>'{}')::numeric<=CASE setting_key WHEN 'calendar.max_invitees' THEN 100 WHEN 'calendar.max_audience_persons' THEN 1000 WHEN 'calendar.max_audience_edges' THEN 10000 WHEN 'calendar.preview_ttl_minutes' THEN 10 END)
);
CREATE TABLE application_setting_revisions (
 setting_key TEXT NOT NULL REFERENCES application_settings(setting_key),
 version INT NOT NULL CHECK(version>0),
 old_value JSONB,
 new_value JSONB NOT NULL,
 actor_id UUID REFERENCES user_accounts(id),
 reason TEXT NOT NULL,
 changed_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(setting_key,version)
);
INSERT INTO application_settings(setting_key,value,reason) VALUES
 ('calendar.max_invitees','100','Initial bounded calendar policy'),
 ('calendar.max_audience_persons','1000','Initial bounded calendar policy'),
 ('calendar.max_audience_edges','10000','Initial bounded calendar policy'),
 ('calendar.preview_ttl_minutes','10','Initial bounded calendar policy');
INSERT INTO application_setting_revisions(setting_key,version,new_value,reason,changed_at)
 SELECT setting_key,version,value,reason,updated_at FROM application_settings;
CREATE FUNCTION protect_application_setting_update() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Application settings cannot be deleted'; END IF;
 IF NEW.id IS DISTINCT FROM OLD.id OR NEW.setting_key IS DISTINCT FROM OLD.setting_key
  OR NEW.version<>OLD.version+1 OR NEW.value IS NOT DISTINCT FROM OLD.value OR NEW.updated_by IS NULL THEN
  RAISE EXCEPTION 'A setting change requires a new value, actor and consecutive version';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER application_setting_update BEFORE UPDATE OR DELETE ON application_settings
 FOR EACH ROW EXECUTE FUNCTION protect_application_setting_update();
CREATE FUNCTION record_application_setting_revision() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 INSERT INTO application_setting_revisions(setting_key,version,old_value,new_value,actor_id,reason,changed_at)
  VALUES(NEW.setting_key,NEW.version,OLD.value,NEW.value,NEW.updated_by,NEW.reason,NEW.updated_at);
 RETURN NEW;
END $$;
CREATE TRIGGER application_setting_revision AFTER UPDATE ON application_settings
 FOR EACH ROW EXECUTE FUNCTION record_application_setting_revision();
CREATE FUNCTION protect_application_setting_history() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Application setting history is append-only'; END $$;
CREATE TRIGGER application_setting_history_immutable BEFORE UPDATE OR DELETE ON application_setting_revisions
 FOR EACH ROW EXECUTE FUNCTION protect_application_setting_history();
