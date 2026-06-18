import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ChatPageComponent } from './chat-page.component';
import { GptStreamService, StreamHandlers } from '../../services/gpt-stream.service';
import { MarkdownModule } from 'ngx-markdown';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';

describe('ChatPageComponent', () => {
  let component: ChatPageComponent;
  let fixture: ComponentFixture<ChatPageComponent>;
  let capturedHandlers: StreamHandlers;
  let loadHistorySpy: jasmine.Spy;
  let mockAbortController: { abort: jasmine.Spy };

  // Создание фикстуры вынесено в помощник, чтобы тест истории мог
  // переопределить loadHistory ДО инстанцирования компонента (конструктор вызывает _init).
  const createComponent = async (): Promise<void> => {
    fixture = TestBed.createComponent(ChatPageComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  };

  beforeEach(async () => {
    mockAbortController = { abort: jasmine.createSpy('abort') };
    capturedHandlers = {};

    const mockGptStreamService = {
      streamMessage: jasmine
        .createSpy('streamMessage')
        .and.callFake((_text: string, h: StreamHandlers) => {
          capturedHandlers = h;
          return mockAbortController as unknown as AbortController;
        }),
      loadHistory: jasmine.createSpy('loadHistory').and.resolveTo([]),
    };

    loadHistorySpy = mockGptStreamService.loadHistory;

    await TestBed.configureTestingModule({
      imports: [ChatPageComponent, NoopAnimationsModule, MarkdownModule.forRoot()],
      providers: [{ provide: GptStreamService, useValue: mockGptStreamService }],
    }).compileComponents();
  });

  it('грузит историю при инициализации', async () => {
    loadHistorySpy.and.resolveTo([{ role: 'user', text: 'прошлое', created_at: 'x' }]);
    await createComponent();
    expect(component.messages().length).toBe(1);
    expect(component.loadingHistory()).toBeFalse();
  });

  it('send добавляет пузырь юзера и пустой ассистента, streaming=true', async () => {
    await createComponent();
    component.send('привет');
    const m = component.messages();
    expect(m.at(-2)).toEqual(jasmine.objectContaining({ role: 'user', text: 'привет' }));
    expect(m.at(-1)).toEqual(
      jasmine.objectContaining({ role: 'assistant', text: '', streaming: true }),
    );
    expect(component.streaming()).toBeTrue();
  });

  it('onToken дописывает текст в ассистентский пузырь', async () => {
    await createComponent();
    component.send('q');
    capturedHandlers.onToken!('Наш');
    capturedHandlers.onToken!('ёл');
    expect(component.messages().at(-1)!.text).toBe('Нашёл');
  });

  it('onToolStart ставит человекочитаемый статус', async () => {
    await createComponent();
    component.send('q');
    capturedHandlers.onToolStart!('search_properties');
    expect(component.status()).toBe('Ищу объявления на платформе…');
  });

  it('onDone снимает streaming', async () => {
    await createComponent();
    component.send('q');
    capturedHandlers.onDone!();
    expect(component.streaming()).toBeFalse();
    expect(component.messages().at(-1)!.streaming).toBeFalsy();
  });

  it('onError показывает ошибку и разблокирует', async () => {
    await createComponent();
    component.send('q');
    capturedHandlers.onError!('сбой');
    expect(component.error()).toBe('сбой');
    expect(component.streaming()).toBeFalse();
  });

  it('textarea input обновляет draft и send использует набранный текст', async () => {
    await createComponent();
    const ta = fixture.nativeElement.querySelector('textarea') as HTMLTextAreaElement;

    // Симулируем ввод текста пользователем
    ta.value = 'привет ИИ';
    ta.dispatchEvent(new Event('input'));
    fixture.detectChanges();

    // draft() должен отразить введённый текст
    expect(component.draft()).toBe('привет ИИ');

    // Отправка через onSendClick — должен передать набранный текст в streamMessage
    const mockGpt = TestBed.inject(GptStreamService) as jasmine.SpyObj<GptStreamService>;
    component.onSendClick();

    expect(mockGpt.streamMessage).toHaveBeenCalledWith('привет ИИ', jasmine.any(Object));
    // После отправки draft очищается
    expect(component.draft()).toBe('');
  });
});
