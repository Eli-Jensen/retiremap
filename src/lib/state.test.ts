import { describe, expect, it } from 'vitest';
import { app, readHash, writeHash, defaults, cities } from './state.svelte.ts';

describe('URL hash state', () => {
  it('writes nothing for an untouched app', () => {
    readHash('');
    expect(writeHash()).toBe('');
  });

  it('round-trips edited fields, including lists', () => {
    readHash(
      '#age=52&hh=couple&at=60&nw=750000&roth=50000&brk=20000&ss=30000&mode=when&tier=4&qol=150&only=europe,southeast-asia&never=c-in,africa&health=false&cols=at,t3,qol&city=lisbon-pt',
    );
    expect(app.age).toBe(52);
    expect(app.household).toBe('couple');
    expect(app.retireAge).toBe(60);
    expect(app.traditional).toBe(750000);
    expect(app.netWorth).toBe(750000 + 50000 + 20000 + app.checking);
    expect(app.only).toEqual(['europe', 'southeast-asia']);
    expect(app.never).toEqual(['c-in', 'africa']);
    expect(app.columns).toEqual(['at', 't3', 'qol']);
    expect(app.healthOn).toBe(false);
    const again = writeHash();
    expect(again).toContain('only=europe,southeast-asia');
    readHash('');
    readHash(again);
    expect(writeHash()).toBe(again);
  });

  it('a hash that omits a key resets that field to its default', () => {
    readHash('#nw=1000000&mode=when&never=africa');
    readHash('#mode=when');
    expect(app.traditionalInput).toBeNull();
    expect(app.traditional).toBe(defaults.personas.fire.retirementByAge.find((b) => app.age <= b.maxAge)!.value);
    expect(app.never).toEqual([]);
  });

  it('ignores junk', () => {
    readHash('#age=banana&only=atlantis,europe&city=nowhere&tier=99&c-hsa=lots');
    expect(app.age).toBe(defaults.personas.fire.age);
    expect(app.only).toEqual(['europe']);
    expect(app.selectedCityId).toBeNull();
    expect(app.targetTier).toBe(5);
    expect(app.contribInput.hsa).toBeUndefined();
  });

  it('retirement age follows the persona but never comes before today', () => {
    readHash('');
    expect(app.retireAge).toBe(48);
    readHash('#p=typical');
    expect(app.retireAge).toBe(66);
    readHash('#age=70');
    expect(app.retireAge).toBe(70);
  });

  it('switching persona changes only the fields you have not edited', () => {
    readHash('#age=40&brk=5000');
    const fireTrad = app.traditional;
    app.persona = 'typical';
    expect(app.age).toBe(40);
    expect(app.brokerage).toBe(5000);
    expect(app.household).toBe('single');
    expect(app.stockPct).toBe(75);
    expect(app.traditional).not.toBe(fireTrad);
    expect(writeHash()).toContain('p=typical');
    readHash('');
    expect(app.persona).toBe('fire');
    expect(app.household).toBe('couple');
  });
});

describe('income, contributions, Social Security', () => {
  it('default contributions follow income, and edited ones stick', () => {
    readHash('');
    const at = app.contributions.k401;
    expect(at).toBe(Math.round((0.155 * app.householdIncome) / 100) * 100);
    readHash('#inc1=200000&inc2=0');
    expect(app.contributions.k401).toBe(Math.round((0.155 * 200_000) / 100) * 100);
    readHash('#inc1=200000&inc2=0&c-k401=5000');
    expect(app.contributions.k401).toBe(5000);
    expect(app.contributions.match).toBe(Math.round((0.045 * 200_000) / 100) * 100);
  });
  it('Social Security is estimated from income until typed over', () => {
    readHash('');
    expect(app.socialSecurity).toBeGreaterThan(20_000);
    const est = app.socialSecurity;
    readHash('#at=60');
    expect(app.socialSecurity).toBeGreaterThan(est); // more working years
    readHash('#ss=12345');
    expect(app.socialSecurity).toBe(12345);
  });
  it('maps v2.1 links (one savings number into one account)', () => {
    readHash('#save=30000&into=brokerage');
    expect(app.contributions.brokerage).toBe(30000);
    expect(app.contributions.k401).toBe(0);
    readHash('');
  });
});

describe('tier thresholds', () => {
  it('a tier is ✓ by your retirement age exactly when your savings then cover its nest egg', () => {
    for (const hash of ['', '#at=40', '#p=typical', '#age=50&at=55&nw=900000&hh=single']) {
      readHash(hash);
      const res = app.results;
      const have = app.atRetirement.portfolio;
      for (const c of cities) {
        const r = res.get(c.id)!;
        for (const t of [1, 2, 3, 4, 5]) {
          const onPlan = r.years[t] !== null && app.age + r.years[t]! <= app.retireAge;
          expect(onPlan, `${c.id} tier ${t} ${hash}`).toBe(r.nestEggs[t] <= have + 1e-6);
        }
        expect(r.tierAt).toBe([1, 2, 3, 4, 5].filter((t) => r.nestEggs[t] <= have + 1e-6).pop() ?? 0);
      }
    }
    readHash('');
  });
});

describe('lifestyle filter', () => {
  it('"like a king today" keeps exactly the cities where king is reachable now', () => {
    readHash('#nw=3000000&mintier=5&tierwhen=now');
    const res = app.results; // read once: outside a component every read recomputes
    const shown = cities.filter((c) => res.get(c.id)!.visible);
    expect(shown.length).toBeGreaterThan(0);
    expect(shown.every((c) => res.get(c.id)!.tierNow === 5)).toBe(true);
    const hiddenKings = cities.filter((c) => !res.get(c.id)!.visible && res.get(c.id)!.tierNow === 5);
    expect(hiddenKings).toEqual([]);
    readHash('');
  });
});

describe('"live well within 5 years"', () => {
  it('keeps exactly the cities where living well is reachable in ≤ 5 years', () => {
    readHash('#mintier=4&tierwhen=within&tierin=5');
    expect(app.tierDeadline).toBe(app.age + 5);
    const res = app.results;
    for (const c of cities) {
      const y = res.get(c.id)!.years[4];
      expect(res.get(c.id)!.visible, c.id).toBe(y !== null && y <= 5);
    }
    readHash('');
  });
});

describe('index filters', () => {
  it('"at least" for higher-is-better, "at most" for lower-is-better; unrated cities drop out', () => {
    readHash('#safe=70&rent=30');
    expect(app.metricLimits).toEqual({ safety: 70, rent: 30 });
    const res = app.results;
    for (const c of cities) {
      const ok = c.safety !== undefined && c.safety >= 70 && c.rent <= 30;
      expect(res.get(c.id)!.visible, c.id).toBe(ok);
    }
    expect(writeHash()).toContain('safe=70');
    readHash('');
    expect(app.metricLimits).toEqual({});
  });
  it('safety now covers more cities than the Quality of Life table', () => {
    const rated = cities.filter((c) => c.qol).length;
    expect(cities.filter((c) => c.safety !== undefined).length).toBeGreaterThan(rated + 50);
    expect(cities.filter((c) => c.healthCare !== undefined).length).toBeGreaterThan(rated);
  });
  it('every city has a population, and population is a default, sortable column', async () => {
    expect(cities.every((c) => (c.pop ?? 0) > 0)).toBe(true);
    const { DEFAULT_COLUMNS, COLUMNS } = await import('./state.svelte.ts');
    expect(DEFAULT_COLUMNS).toContain('pop');
    expect(COLUMNS.some((c) => c.id === 'pop')).toBe(true);
  });
  it('clearFilters removes index limits too', () => {
    readHash('#hc=60&poll=40&pop=500000&never=africa');
    expect(app.filtersActive).toBe(4);
    app.clearFilters();
    expect(app.filtersActive).toBe(0);
    readHash('');
  });
});

describe('place filters', () => {
  it('"only" keeps matching places; "never" wins over "only"', () => {
    readHash('#only=europe&never=c-pt');
    const res = app.results;
    const visible = cities.filter((c) => res.get(c.id)!.visible);
    expect(visible.length).toBeGreaterThan(100);
    expect(visible.every((c) => c.places.includes('europe') && c.iso2 !== 'PT')).toBe(true);
  });
  it('excluding Africa and India removes every city there', () => {
    readHash('#never=africa,c-in');
    const res = app.results;
    const hidden = cities.filter((c) => !res.get(c.id)!.visible);
    expect(hidden.every((c) => c.places.includes('africa') || c.iso2 === 'IN')).toBe(true);
    expect(hidden.length).toBe(cities.filter((c) => c.places.includes('africa') || c.iso2 === 'IN').length);
    readHash('');
  });
});
