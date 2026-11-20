export type HadithNarration = {
  id: string;
  number_in_collection: number;
  arabicnumber: number;
  book: number | null;
  text_arabic: string;
  narrator: string;
  grading_text: string;
  grading_source: string;
  reference_url: string;
};

export type HadithAsset = {
  collection: string;
  title: string;
  author: string;
  source: string;
  sourceUrl: string;
  license: string;
  attribution: string;
  counts: {
    hadiths: number;
    books: number;
    sourceHadiths: number;
    omittedEmptyText: number;
  };
  sections: Record<string, string>;
  bookTitlesAr: Record<string, string>;
  hadiths: HadithNarration[];
};
