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

  it('показывает ошибку, если история не загрузилась (не молчит)', async () => {
    loadHistorySpy.and.rejectWith(new Error('Failed to fetch'));
    await createComponent();
    expect(component.error()).toContain('Failed to fetch');
    expect(component.loadingHistory()).toBeFalse();
  });

  it('sendSuggestion очищает draft и шлёт prompt', async () => {
    await createComponent();
    const mockGpt = TestBed.inject(GptStreamService) as jasmine.SpyObj<GptStreamService>;
    component.sendSuggestion('Покажи 2BR квартиры в Dubai Marina до 2 млн AED');
    expect(mockGpt.streamMessage).toHaveBeenCalledWith(
      'Покажи 2BR квартиры в Dubai Marina до 2 млн AED',
      jasmine.any(Object),
    );
    expect(component.draft()).toBe('');
    expect(component.messages().length).toBe(2); // user + пустой ассистент
  });

  it('onMessagesScroll: у низа → pinnedToBottom=true', async () => {
    await createComponent();
    component.pinnedToBottom.set(false);
    component.onMessagesScroll({
      target: { scrollHeight: 1000, scrollTop: 900, clientHeight: 100 },
    } as unknown as Event);
    expect(component.pinnedToBottom()).toBeTrue();
  });

  it('onMessagesScroll: отлистано вверх → pinnedToBottom=false', async () => {
    await createComponent();
    component.onMessagesScroll({
      target: { scrollHeight: 1000, scrollTop: 100, clientHeight: 100 },
    } as unknown as Event);
    expect(component.pinnedToBottom()).toBeFalse();
  });

  it('scrollToBottom ставит pinnedToBottom=true', async () => {
    await createComponent();
    component.pinnedToBottom.set(false);
    component.scrollToBottom();
    expect(component.pinnedToBottom()).toBeTrue();
  });

  it('suggestions — массив из 4 подсказок', async () => {
    await createComponent();
    expect(component.suggestions.length).toBe(4);
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

  it('пустой экран: рендерит 4 чипа-подсказки', async () => {
    await createComponent(); // loadHistory по умолчанию резолвит [] → пусто
    const chips = fixture.nativeElement.querySelectorAll('.chat-chip');
    expect(chips.length).toBe(4);
  });

  it('подсказки видны над композером даже при наличии истории', async () => {
    loadHistorySpy.and.resolveTo([{ role: 'user', text: 'было', created_at: 'x' }]);
    await createComponent();
    // история есть, но поле пустое → полоска чипов всё равно показана
    expect(fixture.nativeElement.querySelectorAll('.chat-chip').length).toBe(4);
  });

  it('клик по чипу вызывает streamMessage', async () => {
    await createComponent();
    const mockGpt = TestBed.inject(GptStreamService) as jasmine.SpyObj<GptStreamService>;
    const firstChip = fixture.nativeElement.querySelector(
      '.chat-chip',
    ) as HTMLButtonElement;
    firstChip.click();
    expect(mockGpt.streamMessage).toHaveBeenCalled();
  });

  it('ассистентский месседж: тело без аватара и без пузыря, со строкой действий', async () => {
    loadHistorySpy.and.resolveTo([
      { role: 'assistant', text: 'привет', created_at: 'x' },
    ]);
    await createComponent();
    const a = fixture.nativeElement.querySelector('.msg.assistant');
    expect(a.querySelector('.msg-avatar')).toBeNull(); // иконку-робота убрали
    expect(a.querySelector('.msg-body')).toBeTruthy();
    expect(a.querySelector('.msg-bubble')).toBeNull();
    // под завершённым ответом — 3 действия: копировать / лайк / дизлайк
    expect(a.querySelectorAll('.msg-action').length).toBe(3);
  });

  it('юзерский месседж: пузырь', async () => {
    loadHistorySpy.and.resolveTo([{ role: 'user', text: 'вопрос', created_at: 'x' }]);
    await createComponent();
    const u = fixture.nativeElement.querySelector('.msg.user');
    expect(u.querySelector('.msg-bubble')).toBeTruthy();
  });

  it('copyMessage помечает сообщение скопированным', async () => {
    loadHistorySpy.and.resolveTo([
      { role: 'assistant', text: 'ответ для копии', created_at: 'x' },
    ]);
    await createComponent();
    component.copyMessage(0);
    expect(component.messages()[0].copied).toBeTrue();
  });

  it('setFeedback ставит и снимает оценку повторным кликом', async () => {
    loadHistorySpy.and.resolveTo([{ role: 'assistant', text: 'ответ', created_at: 'x' }]);
    await createComponent();
    component.setFeedback(0, 'like');
    expect(component.messages()[0].feedback).toBe('like');
    component.setFeedback(0, 'like'); // повторный клик — снять
    expect(component.messages()[0].feedback).toBeUndefined();
    component.setFeedback(0, 'dislike');
    expect(component.messages()[0].feedback).toBe('dislike');
  });

  it('композер: textarea + кнопка отправки внутри .chat-composer', async () => {
    await createComponent();
    const composer = fixture.nativeElement.querySelector('.chat-composer');
    expect(composer.querySelector('textarea')).toBeTruthy();
    expect(composer.querySelector('.chat-send')).toBeTruthy();
  });
});
