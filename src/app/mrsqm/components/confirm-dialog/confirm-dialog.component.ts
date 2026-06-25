import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { MatIcon } from '@angular/material/icon';

// Данные подтверждающего диалога MrSQM. Своя стилизация (не апстримный
// ui/dialog-confirm) — чтобы кнопки/акценты были под наш дизайн, а деструктив
// читался красным. Апстрим-компонент остаётся нетронутым для остального приложения.
export interface MrsqmConfirmData {
  title: string;
  message?: string;
  okTxt: string;
  cancelTxt?: string;
  // Имя material-иконки в кружке-аватаре заголовка.
  icon?: string;
  // true → акцент опасного действия: красные иконка и кнопка подтверждения.
  danger?: boolean;
}

@Component({
  selector: 'mrsqm-confirm-dialog',
  templateUrl: './confirm-dialog.component.html',
  styleUrl: './confirm-dialog.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatIcon],
})
export class MrsqmConfirmDialogComponent {
  private readonly _ref =
    inject<MatDialogRef<MrsqmConfirmDialogComponent, boolean>>(MatDialogRef);
  readonly data = inject<MrsqmConfirmData>(MAT_DIALOG_DATA);

  close(result: boolean): void {
    this._ref.close(result);
  }
}
