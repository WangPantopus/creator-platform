-- W6 draft: W8 must allocate/order this migration before registry integration.
-- Append-only rollout. Apply using migration administrator; runtime must remain non-owner.
BEGIN;
CREATE EXTENSION IF NOT EXISTS btree_gist;
SET LOCAL ROLE creator_owner;
CREATE TABLE creator.media_asset (
 id uuid PRIMARY KEY, thread_id uuid NOT NULL, creator_id uuid NOT NULL, fan_id uuid NOT NULL,
 owner_account_id uuid NOT NULL, purpose text NOT NULL CHECK(purpose IN('fan_attachment','source_audio','interview_audio','post_photo','human_note','human_reply','call_recording','ai_audio')),
 state text NOT NULL CHECK(state IN('uploading','quarantined','processing','ready','rejected','revoked','deleted')),
 version integer NOT NULL DEFAULT 1 CHECK(version>0), mime_type text NOT NULL,
 bytes bigint NOT NULL CHECK(bytes>0 AND bytes<=268435456), uploaded_bytes bigint NOT NULL DEFAULT 0 CHECK(uploaded_bytes>=0),
 duration_ms integer, max_duration_ms integer NOT NULL CHECK(max_duration_ms>0), max_bytes bigint NOT NULL CHECK(max_bytes>0),
 input_sha256 text NOT NULL CHECK(input_sha256~'^[a-f0-9]{64}$'), output_sha256 text CHECK(output_sha256~'^[a-f0-9]{64}$'),
 waveform jsonb NOT NULL DEFAULT'[]', signed_act_id uuid REFERENCES creator.signed_act(id), provenance jsonb,
 expires_at timestamptz NOT NULL, failure_code text, job_available_at timestamptz, job_lease_until timestamptz,
 manifest_pending boolean NOT NULL DEFAULT false, delete_pending boolean NOT NULL DEFAULT false,
 created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(thread_id,creator_id,fan_id) REFERENCES creator.thread(id,creator_id,fan_id),
 CHECK(state<>'ready' OR output_sha256 IS NOT NULL)
);
CREATE INDEX media_jobs ON creator.media_asset(creator_id,fan_id,job_available_at) WHERE state IN('quarantined','processing','revoked') OR manifest_pending OR delete_pending;
CREATE INDEX media_retention ON creator.media_asset(expires_at) WHERE state NOT IN('revoked','deleted');
CREATE TABLE creator.call_offer (
 id uuid PRIMARY KEY, creator_id uuid NOT NULL, fan_id uuid NOT NULL, thread_id uuid NOT NULL,
 commitment_id uuid NOT NULL, creator_time_zone text NOT NULL, fan_time_zone text NOT NULL,
 expires_at timestamptz NOT NULL, authorization_version integer NOT NULL CHECK(authorization_version>0),
 version integer NOT NULL DEFAULT 1, state text NOT NULL DEFAULT'offered' CHECK(state IN('offered','selected','expired','cancelled')),
 FOREIGN KEY(thread_id,creator_id,fan_id) REFERENCES creator.thread(id,creator_id,fan_id),
 UNIQUE(id,creator_id,fan_id)
);
CREATE UNIQUE INDEX call_active_offer ON creator.call_offer(commitment_id) WHERE state='offered';
CREATE TABLE creator.call_slot (
 id uuid PRIMARY KEY, offer_id uuid NOT NULL, creator_id uuid NOT NULL, fan_id uuid NOT NULL,
 starts_at timestamptz NOT NULL, ends_at timestamptz NOT NULL, active boolean NOT NULL DEFAULT true,
 FOREIGN KEY(offer_id,creator_id,fan_id) REFERENCES creator.call_offer(id,creator_id,fan_id), CHECK(ends_at>starts_at),
 EXCLUDE USING gist(creator_id WITH =,tstzrange(starts_at,ends_at,'[)') WITH &&) WHERE(active)
);
CREATE INDEX call_slot_offer ON creator.call_slot(offer_id,creator_id,fan_id) WHERE active;
CREATE TABLE creator.call_session (
 id uuid PRIMARY KEY, creator_id uuid NOT NULL, fan_id uuid NOT NULL, thread_id uuid NOT NULL,
 commitment_id uuid NOT NULL UNIQUE, room_id text NOT NULL UNIQUE, document jsonb NOT NULL,
 state text NOT NULL CHECK(state IN('scheduled','waiting','connecting','connected','reconnecting','ending','ended','cancelled')),
 version integer NOT NULL DEFAULT 1, scheduled_at timestamptz NOT NULL, hard_end_at timestamptz NOT NULL,
 ended_by text CHECK(ended_by IN('creator','fan','timer','failure')), fan_ended_by_choice boolean NOT NULL DEFAULT false,
 end_requested_at timestamptz, revoked_at timestamptz, next_check_at timestamptz NOT NULL,
 worker_lease_until timestamptz, last_failure_code text,
 FOREIGN KEY(thread_id,creator_id,fan_id) REFERENCES creator.thread(id,creator_id,fan_id), UNIQUE(id,creator_id,fan_id),
 CHECK(hard_end_at>scheduled_at), CHECK(document->>'id'=id::text),
 EXCLUDE USING gist(fan_id WITH =,tstzrange(scheduled_at,hard_end_at,'[)') WITH &&) WHERE(state NOT IN('ended','cancelled'))
);
CREATE INDEX call_due ON creator.call_session(creator_id,fan_id,next_check_at) WHERE state NOT IN('ended','cancelled');
CREATE TABLE creator.call_admission (
 id uuid PRIMARY KEY, session_id uuid NOT NULL, creator_id uuid NOT NULL, fan_id uuid NOT NULL,
 account_id uuid NOT NULL, expires_at timestamptz NOT NULL, used_at timestamptz,
 FOREIGN KEY(session_id,creator_id,fan_id) REFERENCES creator.call_session(id,creator_id,fan_id)
);
CREATE TABLE creator.call_consent (
 id uuid PRIMARY KEY, session_id uuid NOT NULL, creator_id uuid NOT NULL, fan_id uuid NOT NULL,
 actor_account_id uuid NOT NULL, role text NOT NULL CHECK(role IN('creator','fan')),
 purpose text NOT NULL CHECK(purpose IN('recording','summary','content_reuse','ai_source')), granted boolean NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(session_id,creator_id,fan_id) REFERENCES creator.call_session(id,creator_id,fan_id)
);
CREATE TABLE creator.call_event (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), session_id uuid NOT NULL, creator_id uuid NOT NULL, fan_id uuid NOT NULL,
 type text NOT NULL, payload jsonb NOT NULL, actor_account_id uuid NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(session_id,creator_id,fan_id) REFERENCES creator.call_session(id,creator_id,fan_id)
);
CREATE TABLE creator.call_outcome (
 session_id uuid PRIMARY KEY, creator_id uuid NOT NULL, fan_id uuid NOT NULL, evidence jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(session_id,creator_id,fan_id) REFERENCES creator.call_session(id,creator_id,fan_id),
 CHECK(evidence->>'evidenceComplete'='true' AND evidence->>'roomClosed'='true')
);
CREATE TABLE creator.call_effect (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), session_id uuid NOT NULL, creator_id uuid NOT NULL, fan_id uuid NOT NULL,
 kind text NOT NULL, key text NOT NULL UNIQUE, payload jsonb NOT NULL, completed_at timestamptz,
 available_at timestamptz NOT NULL DEFAULT now(), lease_until timestamptz, attempts integer NOT NULL DEFAULT 0, failure_code text,
 FOREIGN KEY(session_id,creator_id,fan_id) REFERENCES creator.call_session(id,creator_id,fan_id)
);
CREATE INDEX call_effect_jobs ON creator.call_effect(creator_id,fan_id,available_at) WHERE completed_at IS NULL;
DO $$ DECLARE relation text; predicate text; BEGIN
 FOREACH relation IN ARRAY ARRAY['media_asset','call_offer','call_slot','call_session','call_admission','call_consent','call_event','call_outcome','call_effect'] LOOP
  predicate := 'creator_id=nullif(current_setting(''app.creator_id'',true),'''')::uuid AND fan_id=nullif(current_setting(''app.fan_id'',true),'''')::uuid';
  EXECUTE format('ALTER TABLE creator.%I ENABLE ROW LEVEL SECURITY',relation);
  EXECUTE format('ALTER TABLE creator.%I FORCE ROW LEVEL SECURITY',relation);
  EXECUTE format('CREATE POLICY scope_read ON creator.%I FOR SELECT USING (%s)',relation,predicate);
  EXECUTE format('CREATE POLICY scope_insert ON creator.%I FOR INSERT WITH CHECK (%s)',relation,predicate);
  IF relation NOT IN('call_outcome','call_consent','call_event') THEN
   EXECUTE format('CREATE POLICY scope_update ON creator.%I FOR UPDATE USING (%s) WITH CHECK (%s)',relation,predicate,predicate);
   EXECUTE format('CREATE POLICY scope_delete ON creator.%I FOR DELETE USING (%s)',relation,predicate);
  END IF;
  EXECUTE format('GRANT SELECT,INSERT ON creator.%I TO creator_runtime',relation);
  IF relation NOT IN('call_outcome','call_consent','call_event') THEN EXECUTE format('GRANT UPDATE,DELETE ON creator.%I TO creator_runtime',relation); END IF;
 END LOOP;
END $$;
COMMIT;
