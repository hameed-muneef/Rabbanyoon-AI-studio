#!/usr/bin/env node
// Imports the generated Quran asset into the immutable content tables.
// Runs with a server-side database connection only; never from the browser.
// Re-running with an identical checksum is a no-op; a different checksum for an
// existing version is refused because source text is immutable.
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {dirname, join, resolve} from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const sha256 = value => createHash('sha256').update(value).digest('hex');
const BATCH = 500;

export async function importQuranContent(client, {asset, manifest, importedBy = null} = {}) {
  asset ??= JSON.parse(await readFile(join(root, 'public', 'quran', 'quran-hafs-uthmani.json'), 'utf8'));
  manifest ??= JSON.parse(await readFile(join(root, 'public', 'quran', 'manifest.json'), 'utf8'));
  if (asset.verses.length !== 6236 || asset.surahs.length !== 114) {
    throw new Error('الأصل المشتق غير مكتمل؛ شغّل scripts/generate-quran-asset.mjs ثم check-quran-content.mjs');
  }

  await client.query('begin');
  try {
    const existing = await client.query(
      'select id, asset_sha256 from public.quran_source_versions where version_key = $1',
      [asset.version]
    );
    let versionId;
    let inserted = false;
    if (existing.rows.length) {
      const row = existing.rows[0];
      if (row.asset_sha256 !== manifest.files.asset.sha256) {
        throw new Error(`الإصدار ${asset.version} موجود ببصمة مختلفة. لا يُعدّل النص؛ أنشئ إصدارًا جديدًا.`);
      }
      versionId = row.id;
    } else {
      const result = await client.query(
        `insert into public.quran_source_versions(
          version_key, source_name, source_url, narration, script, source_file, source_sha256,
          source_bytes, asset_sha256, asset_text_sha256, verse_count, surah_count, status, imported_by)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'active',$13) returning id`,
        [
          asset.version, asset.source, asset.sourceUrl, asset.narration, asset.script,
          manifest.sources.kfgqpcJson.file, manifest.sources.kfgqpcJson.sha256,
          manifest.sources.kfgqpcJson.bytes, manifest.files.asset.sha256,
          manifest.files.asset.textSha256, asset.counts.verses, asset.counts.surahs, importedBy
        ]
      );
      versionId = result.rows[0].id;
      inserted = true;

      await client.query(
        `insert into public.quran_surahs(source_version_id, number, name, english_name, revelation_type, revelation_order, ayah_count)
         select $1, * from unnest($2::int[], $3::text[], $4::text[], $5::text[], $6::int[], $7::int[])`,
        [
          versionId,
          asset.surahs.map(surah => surah.n),
          asset.surahs.map(surah => surah.name),
          asset.surahs.map(surah => surah.ename),
          asset.surahs.map(surah => surah.type),
          asset.surahs.map(surah => surah.order),
          asset.surahs.map(surah => surah.ayahs)
        ]
      );

      const sajdas = new Set(asset.sajdas);
      for (let index = 0; index < asset.verses.length; index += BATCH) {
        const batch = asset.verses.slice(index, index + BATCH);
        await client.query(
          `insert into public.quran_verses(source_version_id, surah_number, ayah_number, text_uthmani, text_search, juz, hizb, page, is_sajda)
           select $1, * from unnest($2::int[], $3::int[], $4::text[], $5::text[], $6::int[], $7::int[], $8::int[], $9::boolean[])`,
          [
            versionId,
            batch.map(verse => verse.s),
            batch.map(verse => verse.a),
            batch.map(verse => verse.t),
            batch.map(verse => verse.e),
            batch.map(verse => verse.j),
            batch.map(verse => verse.h),
            batch.map(verse => verse.p),
            batch.map(verse => sajdas.has(`${verse.s}:${verse.a}`))
          ]
        );
      }
    }

    const counts = (await client.query(
      `select
        (select count(*)::int from public.quran_surahs where source_version_id = $1) as surahs,
        (select count(*)::int from public.quran_verses where source_version_id = $1) as verses,
        (select count(distinct surah_number)::int from public.quran_verses where source_version_id = $1) as distinct_surahs`,
      [versionId]
    )).rows[0];
    if (counts.surahs !== 114 || counts.verses !== 6236 || counts.distinct_surahs !== 114) {
      throw new Error(`فحص ما بعد الاستيراد فشل: ${JSON.stringify(counts)}`);
    }

    const stored = await client.query(
      `select text_uthmani from public.quran_verses where source_version_id = $1 order by surah_number, ayah_number`,
      [versionId]
    );
    const storedChecksum = sha256(stored.rows.map(row => row.text_uthmani).join('\n'));
    if (storedChecksum !== manifest.files.asset.textSha256) {
      throw new Error('بصمة النص المخزن لا تطابق الأصل المشتق');
    }

    await client.query('commit');
    return {versionId, inserted, counts, storedChecksum, unchanged: !inserted};
  } catch (error) {
    await client.query('rollback');
    throw error;
  }
}

async function main() {
  const {Client} = await import('pg');
  const connectionString = process.env.DATABASE_URL;
  const host = process.env.SUPABASE_POOLER_HOST;
  const password = process.env.SUPABASE_DB_PASSWORD;
  const projectRef = process.env.SUPABASE_PROJECT_REF;
  let client;
  if (connectionString) {
    client = new Client({connectionString, ssl: {rejectUnauthorized: false}});
  } else if (host && password && projectRef) {
    const caPath = process.env.SUPABASE_DB_CA_FILE?.replace(/^\/mnt\/([a-z])\//, (_, drive) => `${drive.toUpperCase()}:/`);
    const ca = caPath ? await readFile(caPath, 'utf8') : undefined;
    client = new Client({host, port: 5432, user: `postgres.${projectRef}`, database: 'postgres', password,
      ssl: {rejectUnauthorized: true, ...(ca ? {ca} : {})}, connectionTimeoutMillis: 12000});
  } else {
    console.error('يتطلب الاستيراد DATABASE_URL أو متغيرات Supabase (SUPABASE_POOLER_HOST, SUPABASE_DB_PASSWORD, SUPABASE_PROJECT_REF).');
    process.exit(1);
  }
  await client.connect();
  try {
    const result = await importQuranContent(client);
    console.log(JSON.stringify({ok: true, ...result}, null, 2));
  } finally {
    await client.end();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch(error => { console.error('فشل استيراد القرآن:', error.message); process.exit(1); });
}
