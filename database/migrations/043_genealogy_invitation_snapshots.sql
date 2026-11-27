-- Durable selection evidence; names, phones and contact details are not retained here.
CREATE TABLE calendar_audience_previews (
 id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
 actor_id UUID NOT NULL REFERENCES user_accounts(id),
 selection JSONB NOT NULL,
 audience_scope VARCHAR(30) NOT NULL,
 branch_id UUID REFERENCES branches(id),
 basis JSONB NOT NULL,
 fingerprint CHAR(64) NOT NULL,
 preview_context JSONB NOT NULL,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 expires_at TIMESTAMPTZ NOT NULL DEFAULT now()+INTERVAL '10 minutes',
 event_id UUID REFERENCES calendar_events(id),
 event_version INT,
 consumed_at TIMESTAMPTZ,
 send_context JSONB,
 CHECK ((event_id IS NULL AND event_version IS NULL AND consumed_at IS NULL AND send_context IS NULL)
   OR (event_id IS NOT NULL AND event_version>0 AND consumed_at IS NOT NULL AND send_context IS NOT NULL))
);
CREATE INDEX idx_calendar_audience_actor ON calendar_audience_previews(actor_id,expires_at) WHERE consumed_at IS NULL;
ALTER TABLE calendar_events ADD COLUMN audience_preview_id UUID REFERENCES calendar_audience_previews(id);

CREATE FUNCTION protect_calendar_audience_evidence() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Audience evidence cannot be deleted'; END IF;
 IF OLD.consumed_at IS NOT NULL OR NEW.actor_id IS DISTINCT FROM OLD.actor_id
  OR NEW.selection IS DISTINCT FROM OLD.selection OR NEW.audience_scope IS DISTINCT FROM OLD.audience_scope
  OR NEW.branch_id IS DISTINCT FROM OLD.branch_id OR NEW.basis IS DISTINCT FROM OLD.basis
  OR NEW.fingerprint IS DISTINCT FROM OLD.fingerprint OR NEW.preview_context IS DISTINCT FROM OLD.preview_context
  OR NEW.created_at IS DISTINCT FROM OLD.created_at OR NEW.expires_at IS DISTINCT FROM OLD.expires_at
  OR NEW.id IS DISTINCT FROM OLD.id OR NEW.consumed_at IS NULL THEN
  RAISE EXCEPTION 'Audience selection evidence is immutable';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER calendar_audience_evidence_immutable BEFORE UPDATE OR DELETE ON calendar_audience_previews
 FOR EACH ROW EXECUTE FUNCTION protect_calendar_audience_evidence();
