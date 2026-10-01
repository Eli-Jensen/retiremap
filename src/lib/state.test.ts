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
    readHash('#age=banana&only=atlantis,europe&city=nowhere&tier=99&into=mattress');
    expect(app.age).toBe(defaults.personas.fire.age);
    expect(app.only).toEqual(['europe']);
    expect(app.selectedCityId).toBeNull();
    expect(app.targetTier).toBe(5);
    expect(app.savingsTo).toBe('traditional');
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

describe('place filters', () => {
  it('"only" keeps matching places; "never" wins over "only"', () => {
    readHash('#only=europe&never=c-pt');
    const visible = cities.filter((c) => app.results.get(c.id)!.visible);
    expect(visible.length).toBeGreaterThan(100);
    expect(visible.every((c) => c.places.includes('europe') && c.iso2 !== 'PT')).toBe(true);
  });
  it('excluding Africa and India removes every city there', () => {
    readHash('#never=africa,c-in');
    const hidden = cities.filter((c) => !app.results.get(c.id)!.visible);
    expect(hidden.every((c) => c.places.includes('africa') || c.iso2 === 'IN')).toBe(true);
    expect(hidden.length).toBe(cities.filter((c) => c.places.includes('africa') || c.iso2 === 'IN').length);
    readHash('');
  });
});
