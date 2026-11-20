// فحص بصري شامل: كل القسم × الثيم (فاتح/داكن) × الأجهزة.
// ينتج qa/results.json + لقطات qa/shots/*.png. قراءة فقط — لا يعدّل شيئًا.
import {chromium, devices} from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SHOTS = path.join(HERE, 'shots');
fs.mkdirSync(SHOTS, {recursive: true});

const EMAIL = 'gui-audit-20261103@example.com';
const PASSWORD = 'TestGui2026!';
const BASE = process.env.QA_BASE ?? 'http://localhost:5173';

const DEVICES = [
  {name: 'phone-s', width: 375, height: 667, touch: true},
  {name: 'phone-l', width: 430, height: 932, touch: true},
  {name: 'phone-land', width: 667, height: 375, touch: true},
  {name: 'tab-p', width: 768, height: 1024, touch: true},
  {name: 'tab-lp', width: 820, height: 1180, touch: true},
  {name: 'tab-land', width: 1024, height: 768, touch: true},
  {name: 'lap-s', width: 1366, height: 768},
  {name: 'lap-l', width: 1440, height: 900},
  {name: 'xs', width: 320, height: 568, touch: true},
];
const THEMES = ['light', 'dark'];
const CONTRAST_VIEWPORTS = ['lap-s', 'phone-s'];

// عناصر الثيم المخالفة: أسطح كبيرة فاتحة في الداكن / خضراء واسعة

// دالة الفحص ذاتية الاحتواء — تُنفَّذ داخل الصفحة عبر page.evaluate (بلا إغلاقات خارجية).
const IN_PAGE = function () {
  const lum = ([r, g, b]) => {const f = v => {v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4}; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b)};
  const norm = (value) => {
    if (!value || value === 'transparent' || value === 'none') return null;
    try {
      const ctx = window.__qaCtx ??= document.createElement('canvas').getContext('2d');
      ctx.fillStyle = '#000'; ctx.fillStyle = value;
      const v = ctx.fillStyle;
      if (typeof v !== 'string' || !v.startsWith('#')) return null;
      const n = parseInt(v.slice(1), 16);
      return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
    } catch {return null}
  };
  const parse = (s) => {
    if (!s || s === 'none' || s === 'transparent') return null;
    const m = /rgba?\(([^)]+)\)/.exec(s);
    if (m) {
      const p = m[1].split(',').map(x => parseFloat(x));
      return {rgb: [p[0], p[1], p[2]], a: p.length > 3 ? p[3] : 1};
    }
    const rgb = norm(s);
    return rgb ? {rgb, a: 1} : null;
  };
  const compositeBg = (el) => {
    let r = 0, g = 0, b = 0, a = 0, sawImage = false;
    for (let n = el; n && n.nodeType === 1; n = n.parentElement) {
      const cs = getComputedStyle(n);
      if (a >= 0.99) break;
      const c = parse(cs.backgroundColor);
      const op = Math.min(1, Math.max(0, parseFloat(cs.opacity ?? '1')));
      if (cs.backgroundImage && cs.backgroundImage !== 'none') sawImage = true;
      if (c && c.a > 0) {
        const ca = c.a * op;
        r = c.rgb[0] * ca + r * (1 - ca); g = c.rgb[1] * ca + g * (1 - ca); b = c.rgb[2] * ca + b * (1 - ca);
        a = ca + a * (1 - ca);
      }
      if (n === document.body || n === document.documentElement) {
        if (a < 1) {r = c ? c.rgb[0] : 255; g = c ? c.rgb[1] : 255; b = c ? c.rgb[2] : 255; a = 1}
      }
    }
    return a < 0.95 ? (sawImage ? {image: true} : null) : [r, g, b];
  };
  const ratio = (a, b) => {
    const L1 = lum(a), L2 = lum(b);
    return (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05);
  };
  const sel = (el) => {
    const parts = [];
    for (let n = el; n && n.nodeType === 1 && parts.length < 4; n = n.parentElement) {
      let s = n.tagName.toLowerCase();
      if (n.classList.length) s += '.' + Array.from(n.classList).slice(0, 2).join('.');
      parts.unshift(s);
      if (n.dataset && (n.dataset.section || n.id)) break;
    }
    return parts.join(' ');
  };
  const issues = {contrast: [], clipped: [], overlap: [], hscroll: [], scrollbar: [], themeClash: [], smallTargets: []};
  const visible = el => {const r = el.getBoundingClientRect(); return r.width > 2 && r.height > 2 && r.bottom > 0 && r.top < window.innerHeight};
  const all = Array.from(document.querySelectorAll('body *')).filter(el => !el.closest('iframe') && visible(el));

  // (a) contrast: text 4.5, icons 3
  for (const el of all) {
    const cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || cs.display === 'none') continue;
    if (el.closest('[disabled]') || el.matches(':disabled') || el.getAttribute('aria-disabled') === 'true') continue;
    const bg = compositeBg(el);
    const fg = (() => {const c = parse(cs.color); const op = Math.min(1, Math.max(0, parseFloat(cs.opacity ?? '1'))); return c ? {rgb: c.rgb, a: c.a * op} : null})();
    if (el.tagName === 'svg' || (el.querySelector('svg') && !el.textContent.trim())) {
      const stroke = parse(cs.stroke && cs.stroke !== 'none' ? cs.stroke : cs.color);
      const iconColor = stroke ?? fg;
      if (bg && !bg.image && iconColor && iconColor.a > 0.6) {
        const r = ratio(iconColor.rgb, bg);
        if (r < 3) issues.contrast.push({kind2: 'icon', sel: sel(el), fg: iconColor.rgb, bg, ratio: +r.toFixed(2)});
      }
      continue;
    }
    const own = Array.from(el.childNodes).some(n => n.nodeType === 3 && n.textContent.trim());
    if (!own || !fg || fg.a < 0.85 || !bg) {
      if (own && (!bg || bg.image)) issues.contrast.push({kind2: 'text-over-image', sel: sel(el), text: (el.textContent || '').trim().slice(0, 40)});
      continue;
    }
    const size = parseFloat(cs.fontSize), weight = parseInt(cs.fontWeight) || 400;
    const large = size >= 24 || (size >= 18.66 && weight >= 700);
    const need = large ? 3 : 4.5;
    const r = ratio(fg.rgb, bg);
    if (r < need) issues.contrast.push({kind2: 'text', sel: sel(el), fg: fg.rgb, bg, ratio: +r.toFixed(2), need, text: (el.textContent || '').trim().slice(0, 40), size, weight});
  }

  // (d) clipped text
  for (const el of all) {
    const cs = getComputedStyle(el);
    if (cs.overflowX === 'hidden' || cs.overflowY === 'hidden' || cs.overflow === 'hidden' || cs.textOverflow === 'ellipsis') {
      const hasText = Array.from(el.childNodes).some(n => n.nodeType === 3 && n.textContent.trim());
      if (hasText && (el.scrollWidth > el.clientWidth + 3 || el.scrollHeight > el.clientHeight + 6)) {
        const line = parseFloat(cs.lineHeight);
        const fs = parseFloat(cs.fontSize);
        const tightLine = cs.overflowY === 'hidden' && isFinite(line) && line < fs * 1.25 && el.scrollHeight > el.clientHeight + 2;
        issues.clipped.push({sel: sel(el), text: (el.textContent || '').trim().slice(0, 40), sw: el.scrollWidth, cw: el.clientWidth, sh: el.scrollHeight, ch: el.clientHeight, tightLine});
      }
    }
  }

  // (c) overlaps between interactive elements
  const inter = all.filter(el => ['BUTTON', 'A', 'INPUT', 'SELECT', 'TEXTAREA'].includes(el.tagName));
  const rects = inter.map(el => ({el, r: el.getBoundingClientRect()}));
  for (let i = 0; i < rects.length; i++) for (let j = i + 1; j < rects.length; j++) {
    const A = rects[i], B = rects[j];
    if (A.el.contains(B.el) || B.el.contains(A.el)) continue;
    const x = Math.max(0, Math.min(A.r.right, B.r.right) - Math.max(A.r.left, B.r.left));
    const y = Math.max(0, Math.min(A.r.bottom, B.r.bottom) - Math.max(A.r.top, B.r.top));
    const inter2 = x * y;
    if (!inter2) continue;
    const smaller = Math.min(A.r.width * A.r.height, B.r.width * B.r.height);
    if (inter2 > smaller * 0.4) issues.overlap.push({a: sel(A.el), b: sel(B.el), pct: Math.round(inter2 / smaller * 100)});
  }

  // (e) page horizontal scroll + forced native scrollbars
  const de = document.documentElement;
  if (de.scrollWidth > de.clientWidth + 1) issues.hscroll.push({sw: de.scrollWidth, cw: de.clientWidth});
  for (const el of all) {
    const cs = getComputedStyle(el);
    if (cs.overflowX === 'scroll' || cs.overflowY === 'scroll') issues.scrollbar.push({sel: sel(el), ox: cs.overflowX, oy: cs.overflowY});
  }

  // (f) small touch targets (phones/tablets only)
  if (window.innerWidth <= 1024) {
    for (const el of inter) {
      const r = el.getBoundingClientRect();
      if (r.width >= 42 || r.height >= 42) continue;
      const label = (el.getAttribute('aria-label') || el.textContent || '').trim().slice(0, 30);
      issues.smallTargets.push({sel: sel(el), w: Math.round(r.width), h: Math.round(r.height), label});
    }
  }

  // (b) theme coherence: big light surfaces in dark / big green surfaces
  const theme = document.documentElement.getAttribute('data-theme');
  for (const el of all) {
    const cs = getComputedStyle(el);
    if (cs.backgroundImage !== 'none') continue;
    const c = parse(cs.backgroundColor);
    if (!c || c.a < 0.9) continue;
    const r = el.getBoundingClientRect();
    if (r.width < 140 || r.height < 90) continue;
    const L = lum(c.rgb);
    const [rr, gg, bb] = c.rgb;
    const isGreen = gg > rr + 18 && gg > bb + 18 && gg > 70;
    if (theme === 'dark' && L > 0.72) issues.themeClash.push({type: 'light-surface-in-dark', sel: sel(el), rgb: c.rgb, area: `${Math.round(r.width)}x${Math.round(r.height)}`});
    if (isGreen && r.width > 180 && r.height > 110) issues.themeClash.push({type: 'green-surface', sel: sel(el), rgb: c.rgb, area: `${Math.round(r.width)}x${Math.round(r.height)}`});
  }
  // dedupe
  for (const k of Object.keys(issues)) {
    const seen = new Set();
    issues[k] = issues[k].filter(x => {const key = JSON.stringify(x); if (seen.has(key)) return false; seen.add(key); return true});
  }
  return issues;
};

const NAV = {
  home: async page => {await page.evaluate(() => document.querySelector('.crumb-home')?.click())},
  tasks: async page => {await page.getByText('مهام اليوم').first().click()},
  day: async page => {await clickNav(page, 'حياتي مع الله', 'حياتي')},
  week: async page => {await page.getByText('أسبوعي مع الله').first().click()},
  month: async page => {await page.getByText('شهري مع الله').first().click()},
  goals: async page => {await page.getByText('المؤمن القوي').first().click()},
  learn: async page => {await clickNav(page, 'السير إلى الله', 'السير')},
  quran: async page => {await clickNav(page, 'القرآن والسنة', 'القرآن')},
  haramain: async page => {await clickNav(page, 'من الحريمين|من الحرمين', 'الحرمين')},
  reflect: async page => {await clickNav(page, 'حاسب نفسك', 'المحاسبة')},
  wird: async page => {
    await clickNav(page, 'حاسب نفسك', 'المحاسبة');
    const b = page.locator('button', {hasText: 'زكِّ نفسك'}).first();
    if (await b.count()) await b.click(); else throw new Error('wird entry not found');
  },
  profile: async page => {await page.locator('.user-chip').first().click()},
  settings: async page => {await page.evaluate(() => document.querySelector('.side-bottom button')?.dispatchEvent && (Array.from(document.querySelectorAll('.side-bottom button')).find(b => (b.textContent||'').includes('الإعدادات')))?.click())},
  paymentHistory: async page => {
    if (page.viewportSize().width < 768) throw new Error('mobile-no-entry');
    await page.evaluate(() => (Array.from(document.querySelectorAll('.side-bottom button')).find(b => (b.textContent||'').includes('سجل الدفع')))?.click());
  },
};
const QURAN_SECTIONS = ['المصحف الشريف', 'حفظ القرآن', 'مراجعة القرآن', 'صحيح البخاري', 'صحيح مسلم', 'حفظ السنة', 'وردي اليومي', 'سجل الإنجاز', 'أذكار'];

async function clickNav(page, desktopText, mobileText) {
  const rx = new RegExp(desktopText);
  const side = page.locator('.sidebar button', {hasText: rx}).first();
  if (await side.count() && await side.isVisible()) return side.click();
  const mob = page.locator('.mobile-nav button', {hasText: mobileText}).first();
  if (await mob.count() && await mob.isVisible()) return mob.click();
  throw new Error(`nav not found: ${desktopText}`);
}

const consoleLog = [];
let loginState = null;

async function newPage(browser, theme, device, opts = {}) {
  const context = await browser.newContext({
    viewport: {width: device.width, height: device.height},
    hasTouch: !!device.touch,
    isMobile: !!device.touch && device.width < 800,
    colorScheme: 'light',
    storageState: loginState && !opts.fresh ? loginState : undefined,
    deviceScaleFactor: 1,
  });
  await context.addInitScript(themeValue => {
    try {localStorage.setItem('rabbani-theme-v1', themeValue)} catch {}
  }, theme);
  const page = await context.newPage();
  page.setDefaultTimeout(9000);
  const errors = [];
  page.on('console', m => {if (m.type() === 'error') errors.push(m.text().slice(0, 220))});
  page.on('pageerror', e => errors.push('pageerror: ' + String(e).slice(0, 220)));
  page.on('requestfailed', r => {if (r.url().includes('localhost')) errors.push('reqfail: ' + r.url().slice(-80))});
  page.on('response', r => {if (r.status() >= 500) errors.push(`http${r.status}: ` + r.url().slice(-80))});
  return {context, page, errors};
}

async function login(page) {
  await page.goto(BASE + '/');
  await page.waitForTimeout(800);
  await page.evaluate(async ({email, password}) => {
    const mod = await import('/src/auth.ts');
    if (mod.authClient) await mod.authClient.auth.signInWithPassword({email, password});
  }, {email: EMAIL, password: PASSWORD});
  await page.reload();
  await page.waitForSelector('.app', {state: 'attached', timeout: 30000});
}

async function settle(page) {
  await page.waitForSelector('.app', {state: 'attached', timeout: 30000});
  await page.waitForTimeout(700);
}

const results = [];
const browser = await chromium.launch();

// login once, reuse storage state
{
  const {context, page} = await newPage(browser, 'light', DEVICES[6], {fresh: true});
  await login(page);
  loginState = await context.storageState({path: path.join(HERE, 'login-state.json')});
  await context.close();
}
loginState = path.join(HERE, 'login-state.json');

for (const device of DEVICES) {
  for (const theme of THEMES) {
    const {context, page, errors} = await newPage(browser, theme, device);
    const tag = `${device.name}-${theme}`;
    await page.goto(BASE + '/');
    await settle(page);

    for (const view of Object.keys(NAV)) {
      try {
        await NAV.home(page);
        await page.waitForTimeout(250);
        await NAV[view](page);
        await page.waitForTimeout(600);
        const shot = path.join(SHOTS, `${tag}-${view}.png`);
        await page.screenshot({path: shot});
        const issues = await page.evaluate(IN_PAGE);
        const errs = errors.splice(0);
        for (const [kind, list] of Object.entries(issues)) {
          for (const item of list.slice(0, 25)) results.push({view, theme, device: device.name, kind, ...item, shot});
        }
        for (const e of errs) results.push({view, theme, device: device.name, kind: 'console', message: e, shot});
        console.log(`${tag} ${view}: ok`);
      } catch (e) {
        results.push({view, theme, device: device.name, kind: 'nav-fail', message: String(e).slice(0, 160)});
        console.log(`${tag} ${view}: NAV FAIL ${String(e).slice(0, 80)}`);
      }
    }

    // admin page
    try {
      await page.goto(BASE + '/admin');
      await page.waitForTimeout(1500);
      const shot = path.join(SHOTS, `${tag}-admin.png`);
      await page.screenshot({path: shot});
      const issues = await page.evaluate(IN_PAGE);
      for (const [kind, list] of Object.entries(issues)) for (const item of list.slice(0, 25)) results.push({view: 'admin', theme, device: device.name, kind, ...item, shot});
      for (const e of errors.splice(0)) results.push({view: 'admin', theme, device: device.name, kind: 'console', message: e, shot});
      console.log(`${tag} admin: ok`);
    } catch (e) {
      results.push({view: 'admin', theme, device: device.name, kind: 'nav-fail', message: String(e).slice(0, 160)});
    }

    // quran sub-sections (desktop + phones)
    try {
      await page.goto(BASE + '/');
      await settle(page);
      await NAV.quran(page);
      for (const label of QURAN_SECTIONS) {
        const btn = page.locator('.quran-section-grid button', {hasText: label}).first();
        if (!(await btn.count())) continue;
        await btn.click();
        await page.waitForTimeout(900);
        const id = 'quran/' + label.replace(/\s+/g, '-');
        const shot = path.join(SHOTS, `${tag}-${id}.png`);
        await page.screenshot({path: shot});
        const issues = await page.evaluate(IN_PAGE);
        for (const [kind, list] of Object.entries(issues)) for (const item of list.slice(0, 25)) results.push({view: id, theme, device: device.name, kind, ...item, shot});
        for (const e of errors.splice(0)) results.push({view: id, theme, device: device.name, kind: 'console', message: e, shot});
      }
      console.log(`${tag} quran-sections: ok`);
    } catch (e) {
      results.push({view: 'quran-sections', theme, device: device.name, kind: 'nav-fail', message: String(e).slice(0, 160)});
    }

    // notifications panel open state (interactive overlay)
    try {
      await page.goto(BASE + '/');
      await settle(page);
      const bell = page.locator('.top-actions button:has(svg)').last();
      await bell.click({timeout: 5000});
      await page.waitForTimeout(700);
      const shot = path.join(SHOTS, `${tag}-notif-open.png`);
      await page.screenshot({path: shot});
      const issues = await page.evaluate(IN_PAGE);
      for (const [kind, list] of Object.entries(issues)) for (const item of list.slice(0, 25)) results.push({view: 'notif-open', theme, device: device.name, kind, ...item, shot});
      await page.keyboard.press('Escape');
    } catch (e) {
      results.push({view: 'notif-open', theme, device: device.name, kind: 'nav-fail', message: String(e).slice(0, 120)});
    }

    await context.close();
  }
}

// contrast-dedicated deep pass (2 viewports) — includes per-element fg/bg dump for triage
for (const theme of THEMES) {
  for (const devName of CONTRAST_VIEWPORTS) {
    const device = DEVICES.find(d => d.name === devName);
    const {context, page} = await newPage(browser, theme, device);
    await page.goto(BASE + '/');
    await settle(page);
    for (const view of Object.keys(NAV)) {
      try {
        await NAV[view](page);
        await page.waitForTimeout(400);
        const issues = await page.evaluate(IN_PAGE);
        for (const item of issues.contrast.slice(0, 40)) results.push({view, theme, device: devName, kind: 'contrast', ...item});
      } catch {}
    }
    await context.close();
  }
}

// theme mechanism: system mode follows OS scheme
{
  const {context, page} = await newPage(browser, 'system', DEVICES[6]);
  await page.emulateMedia({colorScheme: 'dark'});
  await page.goto(BASE + '/');
  await settle(page);
  const darkOk = await page.evaluate(() => document.documentElement.getAttribute('data-theme')) === 'dark';
  await page.emulateMedia({colorScheme: 'light'});
  await page.waitForTimeout(300);
  const lightOk = await page.evaluate(() => document.documentElement.getAttribute('data-theme')) === 'light';
  results.push({view: 'theme-mechanism', kind: 'system-mode', pass: darkOk && lightOk});
  await context.close();
}

await browser.close();
fs.writeFileSync(path.join(HERE, 'results.json'), JSON.stringify(results, null, 1));
const byKind = {};
for (const r of results) byKind[r.kind] = (byKind[r.kind] || 0) + 1;
console.log('DONE', JSON.stringify(byKind), 'total rows:', results.length);
