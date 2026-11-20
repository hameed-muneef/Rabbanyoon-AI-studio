import {authClient} from '../auth';
import {createQuranState, mergeQuranState} from './learning';
import type {QuranLearningState} from './types';

const ARRAY_KEYS = ['bookmarks', 'notes', 'history', 'plans', 'passages', 'revisionEvents', 'reflections', 'routine', 'hadithBookmarks', 'activityLog'] as const;

function normalizeRemote(payload: Partial<QuranLearningState> | null): QuranLearningState | null {
  if (!payload || typeof payload !== 'object') return null;
  const base = createQuranState();
  const state = {...base, ...payload} as QuranLearningState;
  for (const key of ARRAY_KEYS) {
    if (!Array.isArray(state[key])) (state as unknown as Record<string, unknown>)[key] = [];
  }
  state.settings = payload.settings ?? base.settings;
  return state;
}

export async function fetchQuranLearningState(): Promise<QuranLearningState | null> {
  if (!authClient) return null;
  const {data, error} = await authClient.rpc('load_quran_learning_state');
  if (error) throw error;
  return normalizeRemote(data as Partial<QuranLearningState> | null);
}

export async function saveQuranLearningState(state: QuranLearningState): Promise<void> {
  if (!authClient) return;
  // Guard against DB constraint violations that surface as HTTP 400:
  // drop entries missing required keys and de-duplicate bookmarks.
  const safe: QuranLearningState = {
    ...state,
    bookmarks: Array.from(new Map(state.bookmarks
      .filter(b => Number.isFinite(b.surah) && Number.isFinite(b.ayah) && b.id)
      .map(b => [`${b.surah}:${b.ayah}:${b.label}`, b])).values()),
    notes: state.notes.filter(n => Number.isFinite(n.surah) && Number.isFinite(n.ayahStart) && Number.isFinite(n.ayahEnd) && n.id && n.body),
    history: state.history.filter(h => Number.isFinite(h.surah) && Number.isFinite(h.ayahStart) && Number.isFinite(h.ayahEnd) && h.id),
    reflections: state.reflections.filter(r => r.id),
    routine: state.routine.filter(r => r.id && r.kind),
    hadithBookmarks: state.hadithBookmarks.filter(h => h.id && h.collectionKey && Number.isFinite(h.hadithNumber)),
  };
  const {error} = await authClient.rpc('save_quran_learning_state', {p_state: safe});
  if (error) throw error;
}

export async function syncQuranState(local: QuranLearningState): Promise<QuranLearningState> {
  const remote = await fetchQuranLearningState();
  return remote ? mergeQuranState(local, remote) : local;
}
