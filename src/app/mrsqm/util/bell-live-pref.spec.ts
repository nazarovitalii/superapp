import { BELL_LIVE_KEY, isBellLiveOn, setBellLive } from './bell-live-pref';

describe('bell-live-pref', () => {
  beforeEach(() => localStorage.removeItem(BELL_LIVE_KEY));

  it('default ON, когда ключа нет', () => {
    expect(isBellLiveOn()).toBe(true);
  });

  it('setBellLive(false) → isBellLiveOn() === false', () => {
    setBellLive(false);
    expect(isBellLiveOn()).toBe(false);
    expect(localStorage.getItem(BELL_LIVE_KEY)).toBe('off');
  });

  it('setBellLive(true) → isBellLiveOn() === true', () => {
    setBellLive(false);
    setBellLive(true);
    expect(isBellLiveOn()).toBe(true);
  });
});
