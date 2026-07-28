import { S3Client, PutObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
import { supabaseServer as supabase } from '../../../../lib/supabase';

// Supabase's daily DB backups don't cover Storage objects — this job mirrors
// the bucket into Cloudflare R2 so photos/docs survive a Supabase-side disaster.
const BUCKET = 'Job-photos';
const TIME_BUDGET_MS = 4 * 60 * 1000;

function r2Client() {
  return new S3Client({
    region: 'auto',
    endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
    },
  });
}

async function listAllFiles(prefix = '') {
  const files = [];
  let offset = 0;
  const limit = 1000;
  while (true) {
    const { data: entries, error } = await supabase.storage.from(BUCKET).list(prefix, { limit, offset, sortBy: { column: 'name', order: 'asc' } });
    if (error) throw error;
    if (!entries || entries.length === 0) break;
    for (const entry of entries) {
      const path = prefix ? `${prefix}/${entry.name}` : entry.name;
      // Supabase Storage represents folders as entries with no id/metadata.
      if (entry.id === null) files.push(...await listAllFiles(path));
      else files.push(path);
    }
    if (entries.length < limit) break;
    offset += limit;
  }
  return files;
}

async function alreadyBackedUp(r2, key) {
  try {
    await r2.send(new HeadObjectCommand({ Bucket: process.env.R2_BUCKET_NAME, Key: key }));
    return true;
  } catch (err) {
    if (err?.$metadata?.httpStatusCode === 404 || err?.name === 'NotFound') return false;
    throw err;
  }
}

export async function GET(request) {
  const auth = request.headers.get('authorization');
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!process.env.R2_ACCOUNT_ID || !process.env.R2_ACCESS_KEY_ID || !process.env.R2_SECRET_ACCESS_KEY || !process.env.R2_BUCKET_NAME) {
    return Response.json({ error: 'R2 env vars not configured (R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME)' }, { status: 500 });
  }

  const startedAt = Date.now();
  const r2 = r2Client();
  const allFiles = await listAllFiles();

  let copied = 0, skipped = 0, failed = 0, stoppedEarly = false;
  for (const path of allFiles) {
    if (Date.now() - startedAt > TIME_BUDGET_MS) { stoppedEarly = true; break; }
    try {
      if (await alreadyBackedUp(r2, path)) { skipped++; continue; }
      const { data: blob, error: dlErr } = await supabase.storage.from(BUCKET).download(path);
      if (dlErr || !blob) { failed++; continue; }
      const buffer = Buffer.from(await blob.arrayBuffer());
      await r2.send(new PutObjectCommand({
        Bucket: process.env.R2_BUCKET_NAME,
        Key: path,
        Body: buffer,
        ContentType: blob.type || 'application/octet-stream',
      }));
      copied++;
    } catch {
      failed++;
    }
  }

  // stoppedEarly=true just means the rest will be picked up on the next run —
  // already-backed-up files are skipped via HeadObject, so nothing is lost or redone.
  return Response.json({ totalFiles: allFiles.length, copied, skipped, failed, stoppedEarly, durationMs: Date.now() - startedAt });
}

export const maxDuration = 300;
