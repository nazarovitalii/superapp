import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import {
  MrsqmConfirmDialogComponent,
  MrsqmConfirmData,
} from './confirm-dialog.component';

describe('MrsqmConfirmDialogComponent', () => {
  let fixture: ComponentFixture<MrsqmConfirmDialogComponent>;
  let component: MrsqmConfirmDialogComponent;
  const closeSpy = jasmine.createSpy('close');
  const data: MrsqmConfirmData = {
    title: 'Удалить объект навсегда?',
    message: 'Это действие нельзя отменить.',
    okTxt: 'Удалить навсегда',
    icon: 'delete_forever',
    danger: true,
  };

  beforeEach(async () => {
    closeSpy.calls.reset();
    await TestBed.configureTestingModule({
      imports: [MrsqmConfirmDialogComponent],
      providers: [
        { provide: MatDialogRef, useValue: { close: closeSpy } },
        { provide: MAT_DIALOG_DATA, useValue: data },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(MrsqmConfirmDialogComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('создаётся', () => {
    expect(component).toBeTruthy();
  });

  it('close(true) закрывает диалог с true', () => {
    component.close(true);
    expect(closeSpy).toHaveBeenCalledWith(true);
  });

  it('close(false) закрывает диалог с false', () => {
    component.close(false);
    expect(closeSpy).toHaveBeenCalledWith(false);
  });
});
