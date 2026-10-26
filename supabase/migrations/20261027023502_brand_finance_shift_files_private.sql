BEGIN;
-- Match treasury Storage protection: only server-authorized signed URLs can
-- access shift documents even if another permissive Storage policy is added.
CREATE POLICY bf_shift_files_server_only ON storage.objects AS RESTRICTIVE
FOR ALL TO anon,authenticated
USING(bucket_id<>'branda-finance-shift-files')
WITH CHECK(bucket_id<>'branda-finance-shift-files');
COMMIT;
