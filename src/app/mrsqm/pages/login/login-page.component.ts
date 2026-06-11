import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { AuthError, MrsqmAuthService } from '../../services/auth.service';

@Component({
  selector: 'mrsqm-login-page',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule,
    FormsModule,
    MatIconModule,
    MatButtonModule,
    MatProgressSpinnerModule,
  ],
  templateUrl: './login-page.component.html',
  styleUrl: './login-page.component.scss',
})
export class LoginPageComponent {
  private readonly _auth = inject(MrsqmAuthService);
  private readonly _router = inject(Router);

  readonly email = signal('');
  readonly password = signal('');
  readonly errorMsg = signal<string | null>(null);
  readonly isLoading = signal(false);

  async submit(): Promise<void> {
    if (this.isLoading()) return;
    this.errorMsg.set(null);

    const email = this.email().trim();
    const password = this.password();
    if (!email || !password) {
      this.errorMsg.set('Введите email и пароль');
      return;
    }

    this.isLoading.set(true);
    try {
      await this._auth.signIn(email, password);
      await this._router.navigateByUrl('/mrsqm/feed');
    } catch (err) {
      this.errorMsg.set(
        err instanceof AuthError ? err.message : 'Не удалось войти. Попробуйте позже',
      );
    } finally {
      this.isLoading.set(false);
    }
  }
}
