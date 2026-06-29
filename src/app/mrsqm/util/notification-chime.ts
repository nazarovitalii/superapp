// Простой звук «пришло уведомление» — короткий двухтоновый дзинь через WebAudio.
// Без ассетов и сети. Молча глотает ошибки (нет AudioContext / autoplay-политика
// браузера до первого пользовательского взаимодействия).
export const playNotificationChime = (): void => {
  try {
    const Ctx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const now = ctx.currentTime;

    // Два коротких тона (G5 → C6) — мягкий «динь-динь».
    const tone = (freq: number, start: number, dur: number): void => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now + start);
      gain.gain.setValueAtTime(0.0001, now + start);
      gain.gain.exponentialRampToValueAtTime(0.18, now + start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + start + dur);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + start);
      osc.stop(now + start + dur);
    };
    tone(784, 0, 0.18);
    tone(1047, 0.12, 0.22);
  } catch {
    // звук опционален — любая ошибка не должна влиять на уведомления
  }
};
