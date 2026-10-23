-- Proposal (lane 3, finding 18). Source only: the integrator registers,
-- reviews and activates it. Replaces creator.generation_conversation_context
-- (0095/0179) so that a memory exclusion removes only what it names: excluded
-- memory keys and the messages the fan marked "don't remember this" (already
-- off the record). Before, any exclusion dropped all retained history, memory
-- and intro from the AI's context. Owner, signature, grants and every other
-- check are unchanged; the profile-bound policy loses only its
-- no-exclusions clause.
BEGIN;
RESET ROLE;
DO $$ BEGIN
 IF NOT EXISTS(SELECT FROM pg_proc WHERE oid=to_regprocedure('creator.generation_conversation_context(uuid,uuid)')
   AND pg_get_userbyid(proowner)='creator_generation_conversation_context' AND prosecdef
   AND proconfig=ARRAY['search_path=pg_catalog'])
  OR NOT EXISTS(SELECT FROM pg_policy WHERE polrelid=to_regclass('creator.fan_profile')
   AND polname='w3_generation_context_profile_bound' AND NOT polpermissive) THEN
  RAISE EXCEPTION 'The reviewed original W3 context executable and profile policy are required';
 END IF;
END $$;
CREATE OR REPLACE FUNCTION creator.generation_conversation_context(g uuid, w uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE task jsonb; tid uuid; cid uuid; fid uuid; fan_message uuid; revision integer; epoch integer;
 otr boolean; intro_shared boolean; accepted_text text; exclusions jsonb; messages jsonb; memories jsonb; intro text; result jsonb;
BEGIN
 IF session_user<>'creator_generation_worker' OR g IS NULL OR w IS NULL OR NOT creator.generation_scope_matches(g,w) THEN
  RAISE EXCEPTION 'Use the actual current generation purpose' USING ERRCODE='42501';
 END IF;
 SELECT s.task INTO task FROM creator.generation_worker_scope s WHERE s.generation_id=g AND s.worker_token=w;
 IF task IS NULL THEN RAISE EXCEPTION 'Current generation tuple is unavailable' USING ERRCODE='42501'; END IF;
 tid:=(task->>'threadId')::uuid; cid:=(task->>'creatorId')::uuid; fid:=(task->>'fanId')::uuid;
 fan_message:=(task->>'fanMessageId')::uuid;
 SELECT t.revision,t.control_epoch,t.off_the_record,t.intro_shared INTO revision,epoch,otr,intro_shared
 FROM creator.thread t WHERE t.id=tid AND t.creator_id=cid AND t.fan_id=fid AND t.deleted_at IS NULL;
 IF NOT FOUND OR epoch<>(task->>'epoch')::integer
  OR revision<>(task->>'contextRevision')::integer+(task->>'lastSequence')::integer THEN
  RAISE EXCEPTION 'Accepted conversation changed' USING ERRCODE='42501';
 END IF;
 SELECT m.text INTO accepted_text FROM creator.message m WHERE m.id=fan_message AND m.thread_id=tid
  AND m.creator_id=cid AND m.fan_id=fid AND m.author_kind='fan' AND m.delivery_state='accepted';
 IF accepted_text IS NULL OR length(accepted_text)<1 OR length(accepted_text)>10000 THEN
  RAISE EXCEPTION 'Bounded accepted fan input is required' USING ERRCODE='55000';
 END IF;
 SELECT coalesce(jsonb_agg(e.semantic_key ORDER BY e.semantic_key),'[]'::jsonb) INTO exclusions
 FROM (SELECT semantic_key FROM creator.memory_exclusion WHERE thread_id=tid AND creator_id=cid AND fan_id=fid
  ORDER BY semantic_key LIMIT 1001) e;
 IF jsonb_array_length(exclusions)>1000 THEN RAISE EXCEPTION 'Memory exclusions require bounded processing' USING ERRCODE='55000'; END IF;
 messages:='[]'::jsonb; memories:='[]'::jsonb; intro:=NULL;
 -- An exclusion removes only what it names: excluded memory keys and the
 -- messages the fan marked ("don't remember this" sets them off the record).
 IF NOT otr THEN
  SELECT coalesce(jsonb_agg(m.author_kind||': '||m.text ORDER BY m.sequence),'[]'::jsonb) INTO messages
  FROM (SELECT author_kind,text,sequence FROM creator.message WHERE thread_id=tid AND creator_id=cid AND fan_id=fid
   AND NOT off_the_record AND delivery_state IN('accepted','delivered','interrupted') ORDER BY sequence DESC LIMIT 30) m;
  SELECT coalesce(jsonb_agg(m.text ORDER BY m.created_at DESC,m.id),'[]'::jsonb) INTO memories
  FROM (SELECT mem.id,mem.text,mem.created_at FROM creator.memory mem
   LEFT JOIN creator.memory_consent consent ON consent.id=mem.consent_id AND consent.thread_id=mem.thread_id
    AND consent.creator_id=mem.creator_id AND consent.fan_id=mem.fan_id AND consent.withdrawn_at IS NULL
   WHERE mem.thread_id=tid AND mem.creator_id=cid AND mem.fan_id=fid AND mem.state='remembered'
    AND (mem.sensitive_category IS NULL OR consent.id IS NOT NULL)
    AND NOT EXISTS(SELECT FROM creator.memory_exclusion e WHERE e.thread_id=tid AND e.creator_id=cid AND e.fan_id=fid AND e.semantic_key=mem.semantic_key)
   ORDER BY mem.created_at DESC,mem.id LIMIT 100) m;
  IF intro_shared THEN SELECT f.intro INTO intro FROM creator.fan_profile f WHERE f.id=fid AND f.account_id=(task->>'initiatingAccountId')::uuid; END IF;
 END IF;
 result:=jsonb_build_object('generationId',g,'threadId',tid,'creatorId',cid,'fanId',fid,'acceptedText',accepted_text,
  'snapshot',jsonb_build_object('revision',revision,'epoch',epoch,'offTheRecord',otr,'intro',intro,
   'messages',messages,'memory',memories,'excludedKeys',exclusions,'provenanceMessageId',fan_message));
 IF octet_length(result::text)>2097152 THEN RAISE EXCEPTION 'Conversation context exceeds its bound' USING ERRCODE='55000'; END IF;
 IF NOT creator.generation_scope_matches(g,w) THEN RAISE EXCEPTION 'Generation authority ended during the read' USING ERRCODE='42501'; END IF;
 RETURN result;
END $function$;
SET LOCAL ROLE creator_owner;
ALTER POLICY w3_generation_context_profile_bound ON creator.fan_profile USING(
 session_user='creator_generation_worker'
 AND current_setting('transaction_isolation')='read committed'
 AND nullif(current_setting('app.account_id',true),'') IS NULL
 AND nullif(current_setting('app.identity_session_id',true),'') IS NULL
 AND nullif(current_setting('app.creator_id',true),'') IS NULL
 AND nullif(current_setting('app.fan_id',true),'') IS NULL
 AND EXISTS(SELECT FROM creator.generation_worker_scope s
  JOIN creator.thread t ON t.id=(s.task->>'threadId')::uuid
   AND t.creator_id=(s.task->>'creatorId')::uuid
   AND t.fan_id=(s.task->>'fanId')::uuid
  WHERE s.id=nullif(current_setting('generation.scope_nonce',true),'')::uuid
   AND s.transaction_id=pg_current_xact_id_if_assigned()
   AND s.backend_pid=pg_backend_pid() AND s.login_name=session_user
   AND s.operation='read' AND s.task IS NOT NULL
   AND s.created_at<=clock_timestamp()
   AND s.created_at>clock_timestamp()-interval '5 seconds'
   AND s.generation_id=(s.task->>'generationId')::uuid
   AND s.worker_token=(s.task->>'workerToken')::uuid
   AND coalesce(creator.generation_scope_matches(s.generation_id,s.worker_token),false)
   AND fan_profile.id=t.fan_id
   AND fan_profile.account_id=(s.task->>'initiatingAccountId')::uuid
   AND t.deleted_at IS NULL AND t.intro_shared AND NOT t.off_the_record
   AND t.control_epoch=(s.task->>'epoch')::integer
   AND t.revision=(s.task->>'contextRevision')::integer+(s.task->>'lastSequence')::integer)
);
COMMIT;
