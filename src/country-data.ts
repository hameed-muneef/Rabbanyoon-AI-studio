const isoAlpha2 = `AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG UM US UY UZ VA VC VE VG VI VN VU WF WS YE YT ZA ZM ZW`.split(/\s+/);

const arabicNames = new Intl.DisplayNames(['ar'], {type: 'region'});
const englishNames = new Intl.DisplayNames(['en'], {type: 'region'});

// Keep the Arabic values already stored in user profiles where names differ.
const legacyArabicNames: Record<string, string> = {
  EG: 'مصر', SA: 'السعودية', AE: 'الإمارات', KW: 'الكويت', QA: 'قطر', BH: 'البحرين',
  OM: 'عُمان', YE: 'اليمن', JO: 'الأردن', PS: 'فلسطين', SY: 'سوريا', LB: 'لبنان',
  IQ: 'العراق', SD: 'السودان', LY: 'ليبيا', TN: 'تونس', DZ: 'الجزائر', MA: 'المغرب',
  MR: 'موريتانيا', SO: 'الصومال', DJ: 'جيبوتي', KM: 'جزر القمر', GR: 'اليونان', TR: 'تركيا',
};

const flagFor = (code: string) => String.fromCodePoint(...[...code].map(char => 127397 + char.charCodeAt(0)));

export const countryOptions = isoAlpha2.map(code => ({
  code,
  arabic: legacyArabicNames[code] ?? arabicNames.of(code) ?? code,
  english: englishNames.of(code) ?? code,
  flag: flagFor(code),
})).sort((a, b) => a.arabic.localeCompare(b.arabic, 'ar'));

export const countries = countryOptions.map(country => country.arabic);
