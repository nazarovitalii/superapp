import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ChatPageComponent } from './chat-page.component';
import { GptStreamService, StreamHandlers } from '../../services/gpt-stream.service';
import { MrsqmSupabaseService } from '../../services/supabase.service';
import { PanelContentService } from '../../../features/panels/panel-content.service';
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
      sendFeedback: jasmine.createSpy('sendFeedback').and.resolveTo(undefined),
    };

    loadHistorySpy = mockGptStreamService.loadHistory;

    const mockSupabase = {
      rpc: jasmine.createSpy('rpc').and.resolveTo(null),
    };
    const mockPanels = {
      openProperty: jasmine.createSpy('openProperty'),
    };

    await TestBed.configureTestingModule({
      imports: [ChatPageComponent, NoopAnimationsModule, MarkdownModule.forRoot()],
      providers: [
        { provide: GptStreamService, useValue: mockGptStreamService },
        { provide: MrsqmSupabaseService, useValue: mockSupabase },
        { provide: PanelContentService, useValue: mockPanels },
      ],
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

  it('клик по ссылке mrsqm://property/<uuid> грузит объект и открывает панель', async () => {
    await createComponent();
    const supabase = TestBed.inject(
      MrsqmSupabaseService,
    ) as unknown as jasmine.SpyObj<MrsqmSupabaseService>;
    const panels = TestBed.inject(
      PanelContentService,
    ) as unknown as jasmine.SpyObj<PanelContentService>;
    (supabase.rpc as jasmine.Spy).and.resolveTo({ id: 'abc-123' });

    const link = document.createElement('a');
    link.setAttribute('href', 'mrsqm://property/abc-123');
    const event = {
      target: link,
      preventDefault: jasmine.createSpy('pd'),
    } as unknown as MouseEvent;
    component.onMessageClick(event);
    await Promise.resolve();
    await Promise.resolve();

    expect(event.preventDefault).toHaveBeenCalled();
    expect(supabase.rpc).toHaveBeenCalledWith('get_property_by_id', { p_id: 'abc-123' });
    expect(panels.openProperty).toHaveBeenCalledWith(
      jasmine.objectContaining({ id: 'abc-123' }),
    );
  });

  it('клик по обычной http-ссылке не трогает панель', async () => {
    await createComponent();
    const supabase = TestBed.inject(
      MrsqmSupabaseService,
    ) as unknown as jasmine.SpyObj<MrsqmSupabaseService>;

    const link = document.createElement('a');
    link.setAttribute('href', 'https://example.com');
    const event = {
      target: link,
      preventDefault: jasmine.createSpy('pd'),
    } as unknown as MouseEvent;
    component.onMessageClick(event);

    expect(event.preventDefault).not.toHaveBeenCalled();
    expect(supabase.rpc).not.toHaveBeenCalled();
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

  it('поповер подсказок скрыт по умолчанию', async () => {
    await createComponent();
    expect(component.showSuggestions()).toBeFalse();
    expect(fixture.nativeElement.querySelectorAll('.chat-suggest-item').length).toBe(0);
  });

  it('toggleSuggestions открывает поповер с 4 подсказками, повторный клик закрывает', async () => {
    await createComponent();
    component.toggleSuggestions();
    fixture.detectChanges();
    expect(component.showSuggestions()).toBeTrue();
    expect(fixture.nativeElement.querySelectorAll('.chat-suggest-item').length).toBe(4);

    component.toggleSuggestions();
    fixture.detectChanges();
    expect(component.showSuggestions()).toBeFalse();
    expect(fixture.nativeElement.querySelectorAll('.chat-suggest-item').length).toBe(0);
  });

  it('клик по подсказке вызывает streamMessage и закрывает поповер', async () => {
    await createComponent();
    const mockGpt = TestBed.inject(GptStreamService) as jasmine.SpyObj<GptStreamService>;
    component.toggleSuggestions();
    fixture.detectChanges();
    const firstItem = fixture.nativeElement.querySelector(
      '.chat-suggest-item',
    ) as HTMLButtonElement;
    firstItem.click();
    expect(mockGpt.streamMessage).toHaveBeenCalled();
    expect(component.showSuggestions()).toBeFalse();
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

  it('setFeedback: like ставится и снимается; dislike требует выбора причины', async () => {
    loadHistorySpy.and.resolveTo([{ role: 'assistant', text: 'ответ', created_at: 'x' }]);
    await createComponent();

    // лайк ставится сразу
    component.setFeedback(0, 'like');
    expect(component.messages()[0].feedback).toBe('like');

    // повторный клик снимает
    component.setFeedback(0, 'like');
    expect(component.messages()[0].feedback).toBeUndefined();

    // дизлайк: открывает reason picker, feedback ещё не commit
    component.setFeedback(0, 'dislike');
    expect(component.feedbackReasonIdx()).toBe(0);
    expect(component.messages()[0].feedback).toBeUndefined();

    // выбор причины → commit
    component.setDislikeReason(0, 'inaccurate');
    expect(component.messages()[0].feedback).toBe('dislike');
    expect(component.feedbackReasonIdx()).toBeNull();

    // повторный клик дизл. → снять
    component.setFeedback(0, 'dislike');
    expect(component.messages()[0].feedback).toBeUndefined();
  });

  it('setFeedback вызывает sendFeedback если есть messageId', async () => {
    loadHistorySpy.and.resolveTo([
      { id: 'msg-1', role: 'assistant', text: 'ответ', created_at: 'x' },
    ]);
    await createComponent();
    const mockGpt = TestBed.inject(GptStreamService) as jasmine.SpyObj<GptStreamService>;

    component.setFeedback(0, 'like');
    expect(mockGpt.sendFeedback).toHaveBeenCalledWith('msg-1', 1);
  });

  it('композер: textarea + кнопка отправки внутри .chat-composer', async () => {
    await createComponent();
    const composer = fixture.nativeElement.querySelector('.chat-composer');
    expect(composer.querySelector('textarea')).toBeTruthy();
    expect(composer.querySelector('.chat-send')).toBeTruthy();
  });
});
