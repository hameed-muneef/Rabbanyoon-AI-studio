// فحص دقة المواقيت (يحتاج الإنترنت، لذلك ليس ضمن npm test):
// يقارن ما يعيده AlAdhan (المستخدم في التطبيق) بحساب مستقل من مكتبة adhan.
// الاستخدام: npm run prayer:check [-- --tolerance=2]
import {Coordinates, CalculationMethod, Madhab, PrayerTimes} from 'adhan';

const prayerDate = (now = new Date()) => `${String(now.getDate()).padStart(2, '0')}-${String(now.getMonth() + 1).padStart(2, '0')}-${now.getFullYear()}`;
const prayerTimingsQuery = (city, zone, options) => new URLSearchParams({latitude: String(city.latitude), longitude: String(city.longitude), timezonestring: zone, method: String(options.method), school: String(options.school)});

const tolerance = Number(process.argv.find(arg => arg.startsWith('--tolerance='))?.split('=')[1] ?? 3);

const cities = [
  {name: 'مكة المكرمة', latitude: 21.4225, longitude: 39.8262, zone: 'Asia/Riyadh', method: 4, params: () => CalculationMethod.UmmAlQura()},
  {name: 'القاهرة', latitude: 30.0444, longitude: 31.2357, zone: 'Africa/Cairo', method: 5, params: () => CalculationMethod.Egyptian()},
  {name: 'كراتشي', latitude: 24.8607, longitude: 67.0011, zone: 'Asia/Karachi', method: 1, params: () => CalculationMethod.Karachi()},
  {name: 'لندن', latitude: 51.5072, longitude: -0.1276, zone: 'Europe/London', method: 3, params: () => CalculationMethod.MuslimWorldLeague()},
  {name: 'صنعاء', latitude: 15.3694, longitude: 44.191, zone: 'Asia/Aden', method: 3, params: () => CalculationMethod.MuslimWorldLeague()},
];

const names = {Fajr: 'fajr', Dhuhr: 'dhuhr', Asr: 'asr', Maghrib: 'maghrib', Isha: 'isha'};
const minutesIn = (date, zone) => {
  const parts = new Intl.DateTimeFormat('en-GB', {timeZone: zone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23'}).formatToParts(date);
  return Number(parts.find(p => p.type === 'hour').value) * 60 + Number(parts.find(p => p.type === 'minute').value);
};

let failures = 0;
for (const city of cities) {
  const url = `https://api.aladhan.com/v1/timings/${prayerDate()}?${prayerTimingsQuery(city, city.zone, {method: city.method, school: 0})}`;
  const body = await (await fetch(url)).json();
  if (body.code !== 200) {console.error(`${city.name}: فشل الطلب`); failures++; continue}
  const params = city.params();
  params.madhab = Madhab.Shafi;
  const reference = new PrayerTimes(new Coordinates(city.latitude, city.longitude), new Date(), params);
  const row = [];
  for (const [apiName, refName] of Object.entries(names)) {
    const [h, m] = body.data.timings[apiName].split(':').map(Number);
    const diff = h * 60 + m - minutesIn(reference[refName], city.zone);
    const wrapped = Math.abs(diff) > 720 ? diff - Math.sign(diff) * 1440 : diff;
    if (Math.abs(wrapped) > tolerance) failures++;
    row.push(`${apiName} ${wrapped >= 0 ? '+' : ''}${wrapped}`);
  }
  console.log(`${city.name}: ${row.join(' | ')}`);
}
console.log(failures ? `FAIL: ${failures} فروق تتجاوز ${tolerance} دقيقة` : `OK: كل الفروق ضمن ${tolerance} دقيقة`);
process.exitCode = failures ? 1 : 0;
