import { describe, expect, it } from 'vitest';
import { app, readHash, writeHash, defaults } from './state.svelte.ts';

describe('URL hash state', () => {
  it('writes nothing for an untouched app', () => {
    readHash('');
    expect(writeHash()).toBe('');
  });
  it('round-trips edited fields', () => {
    readHash('#age=52&hh=couple&nw=750000&ss=30000&mode=when&tier=4&qol=150&region=Europe&health=false&city=lisbon-pt');
    expect(app.age).toBe(52);
    expect(app.household).toBe('couple');
    expect(app.portfolio).toBe(750000);
    expect(app.healthOn).toBe(false);
    expect(app.selectedCityId).toBe('lisbon-pt');
    const again = writeHash();
    readHash('');
    readHash(again);
    expect(writeHash()).toBe(again);
  });
  it('a hash that omits a key resets that field to its default', () => {
    readHash('#nw=1000000&mode=when');
    readHash('#mode=when');
    expect(app.portfolioInput).toBeNull();
    expect(app.portfolio).toBe(defaults.portfolioByAge.brackets.find((b) => app.age <= b.maxAge)!.value);
  });
  it('ignores junk', () => {
    readHash('#age=banana&region=Atlantis&city=nowhere&tier=99');
    expect(app.age).toBe(defaults.age);
    expect(app.region).toBe('all');
    expect(app.selectedCityId).toBeNull();
    expect(app.targetTier).toBe(5);
  });
});
