// Тумблер живости (localStorage). default ON. OFF хранится как 'off'.
export const BELL_LIVE_KEY = 'mrsqm.bellLive';

export const isBellLiveOn = (): boolean => {
  try {
    return localStorage.getItem(BELL_LIVE_KEY) !== 'off';
  } catch {
    return true;
  }
};

export const setBellLive = (on: boolean): void => {
  try {
    localStorage.setItem(BELL_LIVE_KEY, on ? 'on' : 'off');
  } catch {
    // приватный режим / квота — тумблер просто не запомнится
  }
};
