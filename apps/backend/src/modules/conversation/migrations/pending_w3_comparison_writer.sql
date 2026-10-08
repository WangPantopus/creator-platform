-- Additive source proposal; unregistered until the complete producer, reader,
-- privacy and restore graph qualify. Existing pending sources stay unchanged.
-- Receipt identifiers do not establish deidentification or source authority.
BEGIN;
SET LOCAL ROLE creator_owner;

-- One immutable result per source/policy/sanitizer revision. Two concurrent
-- genuine provider attempts retain the first committed result and its costs.
CREATE UNIQUE INDEX comparison_sample_revision
 ON creator.conversation_comparison_sample(message_id,policy_version,processor_policy_version,
  (split_part(sanitizer_reference,':',1)))
 WHERE sanitizer_reference ~ '^[a-f0-9]{64}:[a-f0-9-]{36}:[a-f0-9-]{36}$';
CREATE UNIQUE INDEX comparison_sample_proposal_receipt
 ON creator.conversation_comparison_sample((split_part(sanitizer_reference,':',2)))
 WHERE sanitizer_reference ~ '^[a-f0-9]{64}:[a-f0-9-]{36}:[a-f0-9-]{36}$';
CREATE UNIQUE INDEX comparison_sample_review_receipt
 ON creator.conversation_comparison_sample((split_part(sanitizer_reference,':',3)))
 WHERE sanitizer_reference ~ '^[a-f0-9]{64}:[a-f0-9-]{36}:[a-f0-9-]{36}$';

CREATE POLICY comparison_sample_fan_read ON creator.conversation_comparison_sample
 FOR SELECT TO creator_runtime USING (
 creator_id=nullif(current_setting('app.creator_id',true),'')::uuid
 AND fan_id=nullif(current_setting('app.fan_id',true),'')::uuid
 AND account_id=nullif(current_setting('app.account_id',true),'')::uuid
 AND sanitizer_reference ~ '^[a-f0-9]{64}:[a-f0-9-]{36}:[a-f0-9-]{36}$'
 AND EXISTS(SELECT FROM creator.fan_profile f
  WHERE f.id=conversation_comparison_sample.fan_id AND f.account_id=conversation_comparison_sample.account_id)
);
CREATE POLICY comparison_sample_fan_insert ON creator.conversation_comparison_sample
 FOR INSERT TO creator_runtime WITH CHECK (
 creator_id=nullif(current_setting('app.creator_id',true),'')::uuid
 AND fan_id=nullif(current_setting('app.fan_id',true),'')::uuid
 AND account_id=nullif(current_setting('app.account_id',true),'')::uuid
 AND EXISTS(SELECT FROM creator.fan_profile f
  WHERE f.id=conversation_comparison_sample.fan_id AND f.account_id=conversation_comparison_sample.account_id)
);
GRANT SELECT,INSERT ON creator.conversation_comparison_sample TO creator_runtime;

-- Invoker only: this adds no private raw-message or cross-fan reader. It runs
-- on the genuine fan transaction both at INSERT and immediately at COMMIT.
CREATE FUNCTION creator.assert_comparison_sample_write()
RETURNS trigger LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path=pg_catalog AS $$
DECLARE source creator.message; choice creator.conversation_comparison_consent;
 ids uuid[]; sanitizer text; stage_purpose text; receipt creator.ai_usage; ordinal integer;
BEGIN
 IF TG_TABLE_SCHEMA<>'creator' OR TG_TABLE_NAME<>'conversation_comparison_sample'
  OR TG_OP<>'INSERT' OR current_user<>'creator_runtime' OR session_user<>current_user
  OR current_setting('transaction_isolation')<>'read committed'
  OR NEW.creator_id IS DISTINCT FROM nullif(current_setting('app.creator_id',true),'')::uuid
  OR NEW.fan_id IS DISTINCT FROM nullif(current_setting('app.fan_id',true),'')::uuid
  OR NEW.account_id IS DISTINCT FROM nullif(current_setting('app.account_id',true),'')::uuid
  OR NOT EXISTS(SELECT FROM creator.schema_migration
   WHERE version='PENDING_W8_w3_comparison_writer' AND checksum ~ '^[a-f0-9]{64}$')
 THEN RAISE EXCEPTION 'Original registered fan comparison writer required' USING ERRCODE='42501'; END IF;
 -- A withdrawal in this same transaction may already have erased the result.
 IF TG_WHEN='AFTER' AND NOT EXISTS(SELECT FROM creator.conversation_comparison_sample WHERE id=NEW.id)
 THEN RETURN NULL; END IF;
 IF NEW.sanitizer_reference !~ '^[a-f0-9]{64}:[a-f0-9-]{36}:[a-f0-9-]{36}$'
  OR NEW.created_at>clock_timestamp() OR NEW.expires_at<=clock_timestamp()
 THEN RAISE EXCEPTION 'Original current comparison receipts required' USING ERRCODE='42501'; END IF;
 sanitizer:=split_part(NEW.sanitizer_reference,':',1);
 ids:=ARRAY[split_part(NEW.sanitizer_reference,':',2)::uuid,split_part(NEW.sanitizer_reference,':',3)::uuid];
 IF ids[1]=ids[2] THEN RAISE EXCEPTION 'Distinct processing receipts required' USING ERRCODE='42501'; END IF;
 PERFORM id FROM creator.identity_session
  WHERE id=nullif(current_setting('app.identity_session_id',true),'')::uuid
   AND account_id=NEW.account_id AND revoked_at IS NULL AND expires_at>clock_timestamp() FOR SHARE;
 IF NOT FOUND OR creator_trust.interactive_denial('thread',NEW.creator_id,NEW.thread_id) IS DISTINCT FROM 'allowed'
 THEN RAISE EXCEPTION 'Original current fan session and denial authority required' USING ERRCODE='42501'; END IF;
 -- Original fan writes serialize against withdrawal and source edits. Refuse
 -- reversed lock contention rather than waiting while holding another owner.
 PERFORM id FROM creator.thread WHERE id=NEW.thread_id AND creator_id=NEW.creator_id AND fan_id=NEW.fan_id
  AND deleted_at IS NULL AND NOT off_the_record AND processor_consent_version=NEW.processor_policy_version
  FOR SHARE NOWAIT;
 IF NOT FOUND THEN RAISE EXCEPTION 'Current comparison thread required' USING ERRCODE='42501'; END IF;
 SELECT * INTO choice FROM creator.conversation_comparison_consent
  WHERE thread_id=NEW.thread_id AND creator_id=NEW.creator_id AND fan_id=NEW.fan_id AND account_id=NEW.account_id
   AND policy_version=NEW.policy_version AND processor_policy_version=NEW.processor_policy_version
   AND consented_at<=clock_timestamp() AND expires_at>clock_timestamp();
 IF NOT FOUND THEN RAISE EXCEPTION 'Separate current comparison choice required' USING ERRCODE='42501'; END IF;
 SELECT * INTO source FROM creator.message WHERE id=NEW.message_id AND thread_id=NEW.thread_id
  AND creator_id=NEW.creator_id AND fan_id=NEW.fan_id AND version=NEW.message_version
  AND author_kind='fan' AND author_account_id=NEW.account_id AND NOT off_the_record
  AND delivery_state IN('accepted','delivered') AND created_at>=clock_timestamp()-interval '7 days'
  AND created_at<=clock_timestamp();
 -- The runtime's ISO timestamp boundary is milliseconds. Truncate only the
 -- derived value; never extend or rewrite the original message/consent clock.
 IF NOT FOUND OR NEW.occurred_at IS DISTINCT FROM date_trunc('milliseconds',source.created_at)
  OR NEW.expires_at IS DISTINCT FROM date_trunc('milliseconds',least(choice.expires_at,source.created_at+interval '30 days'))
  OR EXISTS(SELECT FROM creator.memory_exclusion WHERE thread_id=NEW.thread_id AND creator_id=NEW.creator_id AND fan_id=NEW.fan_id)
  OR NOT EXISTS(SELECT FROM creator.processor_consent WHERE thread_id=NEW.thread_id AND creator_id=NEW.creator_id
   AND fan_id=NEW.fan_id AND account_id=NEW.account_id AND version=NEW.processor_policy_version AND withdrawn_at IS NULL)
 THEN RAISE EXCEPTION 'Current original comparison source required' USING ERRCODE='42501'; END IF;
 PERFORM creator_id FROM creator.ai_workspace WHERE creator_id=NEW.creator_id AND deleted_at IS NULL FOR UPDATE NOWAIT;
 IF NOT FOUND THEN RAISE EXCEPTION 'Original comparison workspace required' USING ERRCODE='42501'; END IF;
 FOR ordinal IN 1..2 LOOP
  stage_purpose:=CASE WHEN ordinal=1 THEN 'comparison_paraphrase' ELSE 'comparison_privacy_review' END;
  SELECT * INTO receipt FROM creator.ai_usage WHERE creator_id=NEW.creator_id AND id=ids[ordinal]
   AND category='guardrail' AND ai_usage.purpose=stage_purpose AND provider_state='completed' AND cost_micros IS NOT NULL
   AND generation_id IS NULL AND attempt_id IS NULL AND thread_id IS NULL AND fan_id IS NULL
   AND version_hash=encode(sha256(convert_to('{"purpose":"'||stage_purpose||'","sanitizer":"'||sanitizer||'","source":"'||NEW.source_hash||'"}','UTF8')),'hex')
   AND created_at>=choice.consented_at AND completed_at<=NEW.created_at;
  IF NOT FOUND OR NOT EXISTS(SELECT FROM creator.ai_cost_hold h WHERE h.id=receipt.creator_hold_id
   AND h.creator_id=NEW.creator_id AND h.state='settled' AND receipt.cost_micros BETWEEN 0 AND h.amount_micros)
  THEN RAISE EXCEPTION 'Original known comparison provider receipt required' USING ERRCODE='42501'; END IF;
 END LOOP;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION creator.assert_comparison_sample_write() FROM PUBLIC;
CREATE TRIGGER comparison_sample_original_writer BEFORE INSERT OR UPDATE ON creator.conversation_comparison_sample
 FOR EACH ROW EXECUTE FUNCTION creator.assert_comparison_sample_write();
CREATE CONSTRAINT TRIGGER comparison_sample_current_commit AFTER INSERT ON creator.conversation_comparison_sample
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION creator.assert_comparison_sample_write();
COMMIT;
