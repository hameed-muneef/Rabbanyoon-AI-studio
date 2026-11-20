// خدمة إدارة الصوت (Sound & Audio Management Service)
// مكتبة الأصوات المركزية، المعاينة، والتحميل الآمن للملفات المخصصة.

import {authClient} from '../auth';
import type {AudioResource} from './types';

let audioEl: HTMLAudioElement | null = null;

export function getAudioElement(): HTMLAudioElement {
  if (!audioEl) audioEl = new Audio();
  return audioEl;
}

export function stopAudio(): void {
  if (audioEl) {
    audioEl.pause();
    audioEl.src = '';
    audioEl.load();
  }
}

export function playAudio(url: string): void {
  stopAudio();
  const el = getAudioElement();
  el.src = url;
  void el.play().catch(() => {
    // قد يُمنع التشغيل التلقائي حتى يتفاعل المستخدم مع الصفحة
  });
}

export function previewAudio(resource: AudioResource): void {
  if (!resource.url) return;
  playAudio(resource.url);
}

// ---------- operations على الخادم ----------

export async function listAudioResources(): Promise<AudioResource[]> {
  if (!authClient) throw new Error('خدمة قاعدة البيانات غير مفعّلة.');
  const {data, error} = await authClient.from('audio_resources').select('*').order('is_default', {ascending: false}).order('title', {ascending: true});
  if (error) throw error;
  return (data ?? []) as unknown as AudioResource[];
}

export async function uploadAudioFile(file: File, title: string): Promise<AudioResource> {
  if (!authClient) throw new Error('خدمة قاعدة البيانات غير مفعّلة.');

  // التحقق من جهة العميل (يُعاد التحقق على الخادم)
  const allowed = ['audio/mpeg', 'audio/wav', 'audio/ogg', 'audio/aac', 'audio/mp4'];
  if (!allowed.includes(file.type)) throw new Error('صيغة الصوت غير مدعومة.');
  if (file.size > 10 * 1024 * 1024) throw new Error('حجم الصوت أكبر من المسموح (10 ميغابايت).');

  const fileName = `audio_${crypto.randomUUID()}_${file.name.replace(/[^a-zA-Z0-9.]/g, '_')}`;
  const {error: uploadError} = await authClient.storage.from('audio').upload(fileName, file, {cacheControl: '3600'});
  if (uploadError) throw uploadError;
  const {data: urlData} = authClient.storage.from('audio').getPublicUrl(fileName);

  const {data, error} = await authClient.from('audio_resources').insert({
    title,
    kind: 'custom',
    url: urlData.publicUrl,
    is_uploaded: true,
    uploader_id: '', // يُحشَد من auth.uid() على الخادم
  }).select().single();
  if (error) throw error;
  return data as unknown as AudioResource;
}

export async function deleteAudioResource(id: string): Promise<void> {
  if (!authClient) throw new Error('خدمة قاعدة البيانات غير مفعّلة.');
  const {error} = await authClient.from('audio_resources').delete().eq('id', id);
  if (error) throw error;
}

// ---------- أصوات افتراضية مدمجة (تُستخدم إذا لم تكن قاعدة البيانات متاحة) ----------

export const DEFAULT_AUDIO_RESOURCES: AudioResource[] = [
  {id: 'system-default', title: 'صوت النظام الافتراضي', kind: 'system', url: '', is_default: true, is_uploaded: false, created_at: new Date().toISOString()},
  {id: 'tone-short', title: 'نغمة إشعار قصيرة', kind: 'tone', url: '', is_default: false, is_uploaded: false, created_at: new Date().toISOString()},
  {id: 'adhan-makkah', title: 'أذان مكة', kind: 'adhan', url: '', is_default: false, is_uploaded: false, created_at: new Date().toISOString()},
  {id: 'adhan-madinah', title: 'أذان المدينة', kind: 'adhan', url: '', is_default: false, is_uploaded: false, created_at: new Date().toISOString()},
  {id: 'silent', title: 'صامت', kind: 'system', url: '', is_default: false, is_uploaded: false, created_at: new Date().toISOString()},
];

export function findAudioById(resources: AudioResource[], id: string): AudioResource | undefined {
  return resources.find(r => r.id === id);
}
