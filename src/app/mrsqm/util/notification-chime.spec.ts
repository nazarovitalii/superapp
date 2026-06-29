import { playNotificationChime } from './notification-chime';

describe('playNotificationChime', () => {
  it('создаёт осциллятор и стартует его', () => {
    const osc = {
      connect: jasmine.createSpy('connect'),
      start: jasmine.createSpy('start'),
      stop: jasmine.createSpy('stop'),
      frequency: { setValueAtTime: jasmine.createSpy() },
      type: '',
    };
    const gain = {
      connect: jasmine.createSpy('connect'),
      gain: {
        setValueAtTime: jasmine.createSpy(),
        exponentialRampToValueAtTime: jasmine.createSpy(),
      },
    };
    const ctx = {
      createOscillator: jasmine.createSpy().and.returnValue(osc),
      createGain: jasmine.createSpy().and.returnValue(gain),
      destination: {},
      currentTime: 0,
    };
    const spy = jasmine
      .createSpy('AudioContext')
      .and.returnValue(ctx) as unknown as typeof AudioContext;
    (window as unknown as { AudioContext: typeof AudioContext }).AudioContext = spy;

    playNotificationChime();

    expect(ctx.createOscillator).toHaveBeenCalled();
    expect(osc.start).toHaveBeenCalled();
  });

  it('не кидает, если AudioContext недоступен', () => {
    (window as unknown as { AudioContext: unknown }).AudioContext =
      undefined as unknown as typeof AudioContext;
    expect(() => playNotificationChime()).not.toThrow();
  });
});
