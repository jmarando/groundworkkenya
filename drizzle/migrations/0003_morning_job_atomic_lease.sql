CREATE OR REPLACE FUNCTION public.claim_morning_job(_key text, _now timestamptz)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE claimed text;
BEGIN
  IF _key <> 'morning_story' THEN RAISE EXCEPTION 'Unsupported job'; END IF;
  INSERT INTO public.listening_jobs(key,status,locked_until,updated_at)
  VALUES (_key,'running',_now + interval '10 minutes',_now)
  ON CONFLICT (key) DO UPDATE SET status='running',locked_until=_now + interval '10 minutes',updated_at=_now
  WHERE listening_jobs.status <> 'paused' AND (listening_jobs.locked_until IS NULL OR listening_jobs.locked_until <= _now)
  RETURNING key INTO claimed;
  RETURN claimed IS NOT NULL;
END;
$$;
REVOKE ALL ON FUNCTION public.claim_morning_job(text,timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_morning_job(text,timestamptz) TO service_role;