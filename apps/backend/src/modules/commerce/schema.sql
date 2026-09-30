-- W4 domain proposal. W8 assigns the migration ID/order before shared registration.
-- Apply only to an explicitly leased database, after 0001_foundation.sql.
BEGIN;
SET LOCAL ROLE creator_owner;
CREATE TABLE creator.commerce_mode (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), creator_id uuid NOT NULL REFERENCES creator.creator_profile(id),
 kind text NOT NULL CHECK(kind IN ('written_reply','voice_note','audio_call','video_call','group_answer','guaranteed_review')),
 title text NOT NULL, amount bigint CHECK(amount>0 AND amount<=9007199254740991), public_amount bigint CHECK(public_amount>0 AND public_amount<amount),
 currency text NOT NULL CHECK(currency ~ '^[A-Z]{3}$'), decision_hours integer NOT NULL CHECK(decision_hours BETWEEN 1 AND 720),
 delivery_hours integer NOT NULL CHECK(delivery_hours BETWEEN 1 AND 8760), duration_seconds integer CHECK(duration_seconds>0),
 weekly_limit integer NOT NULL CHECK(weekly_limit>=0), eligibility text[] NOT NULL DEFAULT '{}',
 shareable boolean NOT NULL DEFAULT false, state text NOT NULL CHECK(state IN ('hidden','offered','paused')),
 version integer NOT NULL DEFAULT 1 CHECK(version>0), CHECK(state<>'offered' OR amount IS NOT NULL), UNIQUE(id,creator_id)
);
CREATE TABLE creator.commerce_capacity (
 mode_id uuid NOT NULL, creator_id uuid NOT NULL, window_start timestamptz NOT NULL, window_end timestamptz NOT NULL,
 capacity_limit integer NOT NULL CHECK(capacity_limit>=0), used integer NOT NULL DEFAULT 0 CHECK(used>=0), reserved integer NOT NULL DEFAULT 0 CHECK(reserved>=0),
 version integer NOT NULL DEFAULT 1, PRIMARY KEY(mode_id,window_start), FOREIGN KEY(mode_id,creator_id) REFERENCES creator.commerce_mode(id,creator_id),
 CHECK(window_end>window_start), CHECK(used+reserved<=capacity_limit)
);
CREATE TABLE creator.commerce_spend_limit (
 fan_id uuid NOT NULL REFERENCES creator.fan_profile(id), currency text NOT NULL CHECK(currency ~ '^[A-Z]{3}$'),
 amount bigint CHECK(amount>=0 AND amount<=9007199254740991), explicit_none boolean NOT NULL,
 pending_amount bigint CHECK(pending_amount>=0 AND pending_amount<=9007199254740991), pending_none boolean, effective_at timestamptz,
 reminders_on boolean NOT NULL DEFAULT true, version integer NOT NULL DEFAULT 1,
 PRIMARY KEY(fan_id,currency), CHECK((amount IS NULL)=explicit_none),
 CHECK((effective_at IS NULL AND pending_amount IS NULL AND pending_none IS NULL) OR (effective_at IS NOT NULL AND pending_none IS NOT NULL AND (pending_amount IS NULL)=pending_none))
);
CREATE TABLE creator.commerce_packet (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), thread_id uuid NOT NULL, creator_id uuid NOT NULL, fan_id uuid NOT NULL,
 mode_id uuid NOT NULL, snapshot jsonb NOT NULL, disclosure jsonb NOT NULL, visibility text NOT NULL CHECK(visibility IN ('private','public')),
 state text NOT NULL CHECK(state IN ('draft','submitting','submitted','more_info','offer_pending','accepting','accepted','releasing','declined','expired','withdrawn')),
 payment_state text NOT NULL CHECK(payment_state IN ('authorization_pending','requires_action','requires_capture','unknown','capturing','captured','releasing','released','refund_pending','refunded','failed')),
 capacity_window timestamptz NOT NULL, intent_ref text UNIQUE, authorization_attempt integer NOT NULL DEFAULT 1,
 hold_expires_at timestamptz, decision_at timestamptz, auth_pending_until timestamptz,
 remaining_sla_seconds integer, question text, fan_answer text, proposed_mode jsonb,
 accepted_act_id uuid REFERENCES creator.signed_act(id), accepted_action text, terminal_target text, reason text,
 created_at timestamptz NOT NULL DEFAULT now(), submitted_at timestamptz, accepted_at timestamptz, updated_at timestamptz NOT NULL DEFAULT now(),
 version integer NOT NULL DEFAULT 1 CHECK(version>0),
 FOREIGN KEY(thread_id,creator_id,fan_id) REFERENCES creator.thread(id,creator_id,fan_id), FOREIGN KEY(mode_id,creator_id) REFERENCES creator.commerce_mode(id,creator_id),
 FOREIGN KEY(mode_id,capacity_window) REFERENCES creator.commerce_capacity(mode_id,window_start),
 CHECK(state NOT IN ('submitted','more_info','offer_pending','accepting','accepted') OR intent_ref IS NOT NULL),
 CHECK(state<>'accepted' OR accepted_act_id IS NOT NULL), UNIQUE(id,creator_id,fan_id)
);
CREATE INDEX commerce_packet_fan ON creator.commerce_packet(fan_id,created_at DESC,id);
CREATE INDEX commerce_packet_creator ON creator.commerce_packet(creator_id,created_at DESC,id);
CREATE INDEX commerce_packet_due ON creator.commerce_packet(decision_at) WHERE state IN ('submitted','more_info','offer_pending');
CREATE TABLE creator.commerce_commitment (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), packet_id uuid NOT NULL UNIQUE, creator_id uuid NOT NULL, fan_id uuid NOT NULL,
 mode text NOT NULL, state text NOT NULL CHECK(state IN ('due','in_progress','delivered','resolution_required','refund_pending','refunded','resolved')),
 due_at timestamptz NOT NULL, delivered_at timestamptz, delivered_message_id uuid REFERENCES creator.message(id),
 evidence jsonb, outcome text, dispute_open boolean NOT NULL DEFAULT false, payout_release_at timestamptz,
 version integer NOT NULL DEFAULT 1, FOREIGN KEY(packet_id,creator_id,fan_id) REFERENCES creator.commerce_packet(id,creator_id,fan_id),
 CHECK(state<>'delivered' OR (delivered_at IS NOT NULL AND evidence IS NOT NULL)), UNIQUE(id,creator_id,fan_id)
);
CREATE INDEX commerce_commitment_due ON creator.commerce_commitment(due_at) WHERE state IN ('due','in_progress');
CREATE TABLE creator.commerce_ledger (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), creator_id uuid REFERENCES creator.creator_profile(id), fan_id uuid REFERENCES creator.fan_profile(id),
 packet_id uuid REFERENCES creator.commerce_packet(id), commitment_id uuid REFERENCES creator.commerce_commitment(id),
 kind text NOT NULL CHECK(kind IN ('hold','capture','release','refund','fee','reserve','adjustment','credit_issue','credit_redeem','credit_restore','credit_revoke','pool_alloc','payout_release','payout')),
 amount bigint NOT NULL CHECK(amount>=0 AND amount<=9007199254740991), currency text NOT NULL CHECK(currency ~ '^[A-Z]{3}$'),
 cause text NOT NULL, provider_ref text, refs jsonb NOT NULL DEFAULT '{}', created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(kind,cause), CHECK(creator_id IS NOT NULL OR fan_id IS NOT NULL)
);
CREATE INDEX commerce_ledger_fan ON creator.commerce_ledger(fan_id,currency,created_at);
CREATE INDEX commerce_ledger_creator ON creator.commerce_ledger(creator_id,currency,created_at);
CREATE TABLE creator.commerce_effect (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), creator_id uuid, fan_id uuid NOT NULL REFERENCES creator.fan_profile(id), packet_id uuid REFERENCES creator.commerce_packet(id),
 operation text NOT NULL CHECK(operation IN ('authorize','capture','release','refund','membership','payout')),
 provider_key text NOT NULL UNIQUE, request jsonb NOT NULL, state text NOT NULL DEFAULT 'pending' CHECK(state IN ('pending','processing','unknown','done','failed')),
 attempt integer NOT NULL DEFAULT 0, next_at timestamptz NOT NULL DEFAULT now(), lease_until timestamptz,
 provider_ref text, error_code text, updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX commerce_effect_ready ON creator.commerce_effect(next_at) WHERE state IN ('pending','unknown','processing');
CREATE TABLE creator.commerce_event (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), creator_id uuid, fan_id uuid NOT NULL REFERENCES creator.fan_profile(id),
 aggregate_id uuid NOT NULL, aggregate_version integer NOT NULL, type text NOT NULL, payload jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(), published_at timestamptz, UNIQUE(aggregate_id,aggregate_version,type)
);
CREATE INDEX commerce_event_ready ON creator.commerce_event(created_at,id) WHERE published_at IS NULL;
CREATE TABLE creator.commerce_tier (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), creator_id uuid NOT NULL REFERENCES creator.creator_profile(id), name text NOT NULL,
 capabilities text[] NOT NULL, ai_allowance integer NOT NULL CHECK(ai_allowance>=0), catalog jsonb NOT NULL DEFAULT '{}',
 state text NOT NULL CHECK(state IN ('draft','active','paused')), version integer NOT NULL DEFAULT 1,
 UNIQUE(id,creator_id)
);
CREATE TABLE creator.commerce_membership (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), creator_id uuid NOT NULL, fan_id uuid NOT NULL REFERENCES creator.fan_profile(id), tier_id uuid NOT NULL,
 provider text NOT NULL CHECK(provider IN ('stripe','apple','google')), provider_ref text NOT NULL UNIQUE,
 state text NOT NULL CHECK(state IN ('pending','active','grace','past_due','cancelled','refunded','revoked')),
 period_start timestamptz NOT NULL, period_end timestamptz NOT NULL, grace_end timestamptz, cancel_at_end boolean NOT NULL DEFAULT false,
 first_used_at timestamptz, purchased_at timestamptz NOT NULL, grant_id uuid REFERENCES creator.access_grant(id), version integer NOT NULL DEFAULT 1,
 FOREIGN KEY(tier_id,creator_id) REFERENCES creator.commerce_tier(id,creator_id), CHECK(period_end>period_start),
 UNIQUE(fan_id,tier_id,provider)
);
CREATE TABLE creator.commerce_pass (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), fan_id uuid NOT NULL REFERENCES creator.fan_profile(id),
 state text NOT NULL CHECK(state IN ('pending','active','cancelled','refunded')), slot_capacity integer NOT NULL CHECK(slot_capacity>0),
 cycle_start date NOT NULL, cycle_end date NOT NULL, allowance integer NOT NULL CHECK(allowance>=0), version integer NOT NULL DEFAULT 1,
 UNIQUE(fan_id), CHECK(cycle_end>cycle_start)
);
CREATE TABLE creator.commerce_pass_slot (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), pass_id uuid NOT NULL REFERENCES creator.commerce_pass(id), fan_id uuid NOT NULL REFERENCES creator.fan_profile(id),
 creator_id uuid NOT NULL REFERENCES creator.creator_profile(id), cycle_start date NOT NULL, position integer NOT NULL CHECK(position>=0),
 state text NOT NULL CHECK(state IN ('draft_next','active','ended_readable','replaced')), starts_at timestamptz NOT NULL, ends_at timestamptz NOT NULL,
 replacement_of uuid REFERENCES creator.commerce_pass_slot(id), grant_id uuid REFERENCES creator.access_grant(id), CHECK(ends_at>starts_at)
);
CREATE UNIQUE INDEX commerce_slot_position ON creator.commerce_pass_slot(pass_id,cycle_start,position) WHERE state IN ('draft_next','active');
CREATE UNIQUE INDEX commerce_slot_creator ON creator.commerce_pass_slot(pass_id,cycle_start,creator_id) WHERE state IN ('draft_next','active');
CREATE TABLE creator.commerce_trial (
 creator_id uuid NOT NULL REFERENCES creator.creator_profile(id), fan_id uuid NOT NULL REFERENCES creator.fan_profile(id), grant_id uuid NOT NULL REFERENCES creator.access_grant(id),
 opened_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(creator_id,fan_id)
);
CREATE TABLE creator.commerce_allowance_reservation (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), creator_id uuid NOT NULL, fan_id uuid NOT NULL, grant_id uuid NOT NULL REFERENCES creator.access_grant(id),
 key text NOT NULL, units integer NOT NULL CHECK(units>0), state text NOT NULL CHECK(state IN ('reserved','consumed','released')),
 UNIQUE(creator_id,fan_id,key)
);
CREATE TABLE creator.commerce_share_grant (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), commitment_id uuid NOT NULL UNIQUE REFERENCES creator.commerce_commitment(id),
 creator_id uuid NOT NULL, fan_id uuid NOT NULL, fan_choice boolean NOT NULL, creator_permission boolean NOT NULL,
 handle_display text NOT NULL CHECK(handle_display IN ('hidden','handle')), revoked_at timestamptz, version integer NOT NULL DEFAULT 1
);
CREATE TABLE creator.commerce_qualified_read (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), creator_id uuid NOT NULL, fan_id uuid NOT NULL,
 commitment_id uuid NOT NULL REFERENCES creator.commerce_commitment(id), reader_account_id uuid NOT NULL,
 evidence_id text NOT NULL UNIQUE, period date NOT NULL, credited boolean NOT NULL, UNIQUE(commitment_id,reader_account_id,period)
);
CREATE TABLE creator.commerce_payout_account (
 creator_id uuid PRIMARY KEY REFERENCES creator.creator_profile(id), provider_ref text UNIQUE,
 state text NOT NULL CHECK(state IN ('unconfigured','onboarding','restricted','enabled','failed')), details_due boolean NOT NULL DEFAULT true,
 version integer NOT NULL DEFAULT 1
);
CREATE FUNCTION creator.commerce_scope(c uuid,f uuid) RETURNS boolean LANGUAGE sql STABLE AS $$
 SELECT (f IS NOT NULL AND EXISTS(SELECT 1 FROM creator.fan_profile p WHERE p.id=f AND p.account_id=nullif(current_setting('app.account_id',true),'')::uuid))
 OR (c IS NOT NULL AND EXISTS(SELECT 1 FROM creator.creator_profile p WHERE p.id=c AND p.account_id=nullif(current_setting('app.account_id',true),'')::uuid AND p.verification='verified'));
$$;
DO $$ DECLARE relation text; BEGIN
 FOREACH relation IN ARRAY ARRAY['commerce_packet','commerce_commitment','commerce_ledger','commerce_effect','commerce_event','commerce_membership','commerce_pass_slot','commerce_trial','commerce_allowance_reservation','commerce_share_grant','commerce_qualified_read'] LOOP
  EXECUTE format('ALTER TABLE creator.%I ENABLE ROW LEVEL SECURITY',relation);
  EXECUTE format('ALTER TABLE creator.%I FORCE ROW LEVEL SECURITY',relation);
  EXECUTE format('CREATE POLICY commerce_scope ON creator.%I USING(creator.commerce_scope(creator_id,fan_id)) WITH CHECK(creator.commerce_scope(creator_id,fan_id))',relation);
 END LOOP;
 FOREACH relation IN ARRAY ARRAY['commerce_spend_limit','commerce_pass'] LOOP
  EXECUTE format('ALTER TABLE creator.%I ENABLE ROW LEVEL SECURITY',relation);
  EXECUTE format('ALTER TABLE creator.%I FORCE ROW LEVEL SECURITY',relation);
  EXECUTE format('CREATE POLICY fan_scope ON creator.%I USING(creator.commerce_scope(NULL,fan_id)) WITH CHECK(creator.commerce_scope(NULL,fan_id))',relation);
 END LOOP;
 FOREACH relation IN ARRAY ARRAY['commerce_mode','commerce_capacity','commerce_tier','commerce_payout_account'] LOOP
  EXECUTE format('ALTER TABLE creator.%I ENABLE ROW LEVEL SECURITY',relation);
  EXECUTE format('ALTER TABLE creator.%I FORCE ROW LEVEL SECURITY',relation);
  EXECUTE format('CREATE POLICY commerce_read ON creator.%I FOR SELECT USING(true)',relation);
  EXECUTE format('CREATE POLICY creator_insert ON creator.%I FOR INSERT WITH CHECK(creator.commerce_scope(creator_id,NULL))',relation);
  EXECUTE format('CREATE POLICY creator_update ON creator.%I FOR UPDATE USING(creator.commerce_scope(creator_id,NULL)) WITH CHECK(creator.commerce_scope(creator_id,NULL))',relation);
 END LOOP;
END $$;
-- Fans must reserve capacity via their issued pair scope, without becoming creators.
CREATE POLICY capacity_reserve ON creator.commerce_capacity FOR UPDATE USING(creator_id=nullif(current_setting('app.creator_id',true),'')::uuid AND creator.commerce_scope(NULL,nullif(current_setting('app.fan_id',true),'')::uuid)) WITH CHECK(creator_id=nullif(current_setting('app.creator_id',true),'')::uuid);
CREATE POLICY capacity_open ON creator.commerce_capacity FOR INSERT WITH CHECK(creator_id=nullif(current_setting('app.creator_id',true),'')::uuid AND creator.commerce_scope(NULL,nullif(current_setting('app.fan_id',true),'')::uuid));
GRANT SELECT,INSERT,UPDATE ON creator.commerce_mode,creator.commerce_capacity,creator.commerce_spend_limit,creator.commerce_packet,creator.commerce_commitment,creator.commerce_effect,creator.commerce_event,creator.commerce_tier,creator.commerce_membership,creator.commerce_pass,creator.commerce_pass_slot,creator.commerce_trial,creator.commerce_allowance_reservation,creator.commerce_share_grant,creator.commerce_qualified_read,creator.commerce_payout_account TO creator_runtime;
GRANT SELECT,INSERT ON creator.commerce_ledger TO creator_runtime;
CREATE FUNCTION creator.commerce_immutable() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Commerce ledger is append only'; END $$;
CREATE TRIGGER commerce_ledger_immutable BEFORE UPDATE OR DELETE ON creator.commerce_ledger FOR EACH ROW EXECUTE FUNCTION creator.commerce_immutable();
COMMIT;
