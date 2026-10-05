// README screenshots (docs/screenshots/*.png) of the local dev server.
// Uses an installed Chrome via puppeteer-core — no browser download.
//   npm run dev            # in one terminal (port 5199 via .claude/launch.json, or pass BASE)
//   npm run screenshots    # then resize: sips -Z 1600 docs/screenshots/*.png (mobile: -Z 780)
import puppeteer from 'puppeteer-core';

const OUT = new URL('../docs/screenshots/', import.meta.url).pathname.replace(/\/$/, '');
const BASE = process.env.BASE ?? 'http://localhost:5199/';
const browser = await puppeteer.launch({
  executablePath: process.env.CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true,
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--hide-scrollbars'],
});

async function shot(name, hash, { width = 1440, height = 900, mobile = false, before } = {}) {
  const ctx = await browser.createBrowserContext(); // fresh storage: no saved plan
  const page = await ctx.newPage();
  await page.setViewport({ width, height, deviceScaleFactor: 2, isMobile: mobile, hasTouch: mobile });
  await page.goto(BASE + hash, { waitUntil: 'networkidle0', timeout: 60000 });
  // Wait for MapLibre to finish drawing tiles + dots (dev builds expose window.__map).
  await page.waitForFunction(() => window.__map && window.__map.loaded(), { timeout: 60000 }).catch(() => {});
  await page.evaluate(
    () =>
      new Promise((r) => {
        const m = window.__map;
        if (!m || m.areTilesLoaded()) return setTimeout(r, 800);
        m.once('idle', () => setTimeout(r, 500));
        setTimeout(r, 15000);
      }),
  );
  if (before) await page.evaluate(before);
  await new Promise((r) => setTimeout(r, 600));
  await page.screenshot({ path: `${OUT}/${name}.png` });
  console.log('wrote', name);
  await ctx.close();
}

const filtersShot = () =>
  shot('filters', '#view=list&only=southeast-asia,latin-america-and-caribbean&fly=yr&safe=50&cold=10&sort=qol', {
    before: () => {
      const d = [...document.querySelectorAll('details')].find((x) => x.innerText.includes('Livability'));
      if (d) d.open = true;
      const where = [...document.querySelectorAll('h2')].find((h) => h.innerText.trim().toUpperCase() === 'WHERE');
      const scroller = where?.closest('.overflow-y-auto');
      if (where && scroller) scroller.scrollTop = where.offsetTop - scroller.offsetTop - 12;
    },
  });

if (process.argv[2] === 'filters') await filtersShot();
else {
await shot('map', '#view=map');
  await shot('when-map', '#view=map&mode=when&tier=3');
  await shot('list', '#view=list&mintier=4&tierwhen=within&tierin=5');
  await shot('city-card', '#view=map&city=lisbon-pt');
  await filtersShot();
  await shot('mobile', '#view=list&mintier=3&tierwhen=at', { width: 390, height: 844, mobile: true });
  }
await browser.close();
