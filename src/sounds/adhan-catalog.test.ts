import { describe, it, expect } from 'vitest';
import {
  BUNDLED_ADHAN_SOUNDS,
  DEFAULT_ADHAN_ID,
  EID_TAKBEERAT_SOUND,
  findOrdinaryAdhan,
  resolvePrayerAdhan,
} from './adhan-catalog';

describe('adhan-catalog', () => {
  it('contains the 6 official ordinary Adhan recordings with Arabic labels and Android raw filenames', () => {
    expect(BUNDLED_ADHAN_SOUNDS).toHaveLength(6);
    expect(BUNDLED_ADHAN_SOUNDS.map((s) => s.rawName)).toEqual([
      'adhan_almulla',
      'adhan_ahmad',
      'adhan_madinah',
      'adhan_madinah2',
      'adhan_mohammed',
      'adhan_hamad',
    ]);
    for (const entry of BUNDLED_ADHAN_SOUNDS) {
      expect(entry.isEidTakbeer).toBe(false);
      expect(entry.fileName).toMatch(/^[a-z0-9_]+\.mp3$/);
      expect(entry.url).toBe(`/sounds/adhan/${entry.fileName}`);
      expect(entry.name.trim().length).toBeGreaterThan(0);
    }
  });

  it('keeps Eid Takbeerat separated and never resolves it as an ordinary prayer Adhan', () => {
    expect(EID_TAKBEERAT_SOUND.isEidTakbeer).toBe(true);
    expect(EID_TAKBEERAT_SOUND.rawName).toBe('takbeerat_eid');
    expect(EID_TAKBEERAT_SOUND.name).toBe('تكبيرات العيد');

    expect(findOrdinaryAdhan('eid')).toBeUndefined();
    expect(findOrdinaryAdhan('takbeer:eid')).toBeUndefined();
    expect(findOrdinaryAdhan('takbeerat_eid')).toBeUndefined();

    const resolvedFromEid = resolvePrayerAdhan('takbeer:eid', DEFAULT_ADHAN_ID);
    expect(resolvedFromEid.id).toBe('almulla');
    expect(resolvedFromEid.rawName).toBe('adhan_almulla');
  });

  it('resolves ordinary Adhans by id, soundId, or rawName', () => {
    expect(findOrdinaryAdhan('madinah')?.name).toBe('أذان الحرم المدني');
    expect(findOrdinaryAdhan('adhan:madinah2')?.rawName).toBe('adhan_madinah2');
    expect(findOrdinaryAdhan('adhan_hamad')?.id).toBe('hamad');

    expect(resolvePrayerAdhan('adhan:ahmad', 'almulla').rawName).toBe('adhan_ahmad');
    expect(resolvePrayerAdhan('builtin:chime', 'mohammed').rawName).toBe('adhan_mohammed');
  });
});
