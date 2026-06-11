import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { MrsqmAuthService } from '../services/auth.service';

// Пускает на mrsqm/* только залогиненного пользователя с активной записью
// в `users`. Иначе — redirect на /login. Ждёт восстановления сессии при
// перезагрузке страницы, чтобы не выкидывать уже вошедшего пользователя.
export const mrsqmAuthGuard: CanActivateFn = async () => {
  const auth = inject(MrsqmAuthService);
  const router = inject(Router);

  // Дождаться первичной проверки сессии (getSession + профиль) при F5.
  while (auth.isInitializing()) {
    await new Promise((r) => setTimeout(r, 20));
  }

  if (auth.isAuthenticated()) {
    return true;
  }
  return router.createUrlTree(['/login']);
};
