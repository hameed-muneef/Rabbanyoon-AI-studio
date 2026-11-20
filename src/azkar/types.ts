export type AzkarItem = {
  id: number;
  text: string;
  transliteration?: string | null;
  count: number;
  audio?: string;
  filename?: string;
};

export type AzkarCategory = {
  id: number;
  category: string;
  audio?: string;
  filename?: string;
  array: AzkarItem[];
};

export type AzkarAsset = {
  ar: AzkarCategory[];
  en: AzkarCategory[];
  tr: AzkarCategory[];
};
