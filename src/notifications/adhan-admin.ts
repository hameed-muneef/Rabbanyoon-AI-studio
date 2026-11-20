// إدارة مكتبة الأذان (للمدير فقط): رفع تسجيل إلى مخزن adhan-audio وتسجيله في audio_resources مع ملاحظة الترخيص.
// الصلاحيات مفروضة في قاعدة البيانات (RLS)؛ هذا الملف لا يعتمد على تحقق الواجهة وحده.

import {authClient} from '../auth';
import {normalizeAdhanTitle, validateAdhanFile} from './adhan-validation';
import type {AudioResource} from './types';

const BUCKET = 'adhan-audio';
const TABLE = 'audio_resources';

export type AdhanResource = AudioResource & {license_note?: string | null; storage_path?: string | null; is_active: boolean};

function client() {
  if (!authClient) throw new Error('خدمة قاعدة البيانات غير مفعّلة.');
  return authClient;
}

export async function listAdhanResources(): Promise<AdhanResource[]> {
  const {data, error} = await client().from(TABLE).select('*').eq('kind', 'adhan').order('created_at', {ascending: false});
  if (error) throw error;
  return (data ?? []) as unknown as AdhanResource[];
}

export async function uploadAdhan(file: File, titleInput: string, licenseNote: string, userId: string): Promise<AdhanResource> {
  const title = normalizeAdhanTitle(titleInput);
  const note = licenseNote.trim().slice(0, 500);
  if (!title) throw new Error('أدخل اسم الأذان.');
  if (note.length < 3) throw new Error('أدخل مصدر التسجيل وحالة الترخيص (ملاحظة الترخيص مطلوبة).');
  const head = new Uint8Array(await file.slice(0, 16).arrayBuffer());
  const checked = validateAdhanFile(file, head);
  if (!checked.ok) throw new Error(checked.error);
  const path = `${crypto.randomUUID()}.${checked.format}`;
  const supabase = client();
  const {error: uploadError} = await supabase.storage.from(BUCKET).upload(path, file, {contentType: checked.mime, cacheControl: '31536000', upsert: false});
  if (uploadError) throw uploadError;
  const {data: urlData} = supabase.storage.from(BUCKET).getPublicUrl(path);
  const {data, error} = await supabase.from(TABLE).insert({
    title, kind: 'adhan', url: urlData.publicUrl, storage_path: path, license_note: note,
    is_uploaded: true, is_active: true, uploader_id: userId,
  }).select().single();
  if (error) {
    await supabase.storage.from(BUCKET).remove([path]);
    throw error;
  }
  return data as unknown as AdhanResource;
}

export async function setAdhanActive(id: string, isActive: boolean): Promise<void> {
  const {error} = await client().from(TABLE).update({is_active: isActive}).eq('id', id).eq('kind', 'adhan');
  if (error) throw error;
}

export async function deleteAdhan(resource: AdhanResource): Promise<void> {
  const supabase = client();
  const {error} = await supabase.from(TABLE).delete().eq('id', resource.id).eq('kind', 'adhan');
  if (error) throw error;
  if (resource.storage_path) await supabase.storage.from(BUCKET).remove([resource.storage_path]);
}
