import { Injectable, computed, inject, signal } from '@angular/core';
import { Store } from '@ngrx/store';
import {
  INITIAL_LAYOUT_STATE,
  selectLayoutFeatureState,
} from '../../core-ui/layout/store/layout.reducer';
import { toSignal } from '@angular/core/rxjs-interop';
import { TaskService } from '../tasks/task.service';
import { TaskDetailTargetPanel } from '../tasks/task.model';
import { PropertyFeedItem } from '../../mrsqm/types/database';

export type PanelContentType =
  | 'NOTES'
  | 'TASK'
  | 'ADD_TASK_PANEL'
  | 'ISSUE_PANEL'
  | 'TASK_VIEW_CUSTOMIZER_PANEL'
  | 'PLUGIN'
  | 'SCHEDULE_DAY_PANEL'
  | 'PROPERTY'
  | 'FILTERS'
  | 'AI_CHAT'
  | 'NOTIFICATIONS';

@Injectable({ providedIn: 'root' })
export class PanelContentService {
  private _taskService = inject(TaskService);
  private _store = inject(Store);

  // MrSQM: выбранный объект недвижимости
  readonly selectedProperty = signal<PropertyFeedItem | null>(null);
  // MrSQM: открыта ли панель фильтров ленты
  readonly isFilterPanelOpen = signal(false);
  // MrSQM: открыт ли AI-чат в правой панели
  readonly isAiChatOpen = signal(false);
  // MrSQM: открыта ли панель «Все уведомления»
  readonly isNotificationsOpen = signal(false);

  openProperty(property: PropertyFeedItem): void {
    // Закрываем task-panel чтобы не конфликтовать
    this._taskService.setSelectedId(null);
    this.isFilterPanelOpen.set(false);
    // Объект приоритетнее AI-чата: клик по ссылке в чате заменяет чат карточкой
    this.isAiChatOpen.set(false);
    this.isNotificationsOpen.set(false);
    this.selectedProperty.set(property);
  }

  closeProperty(): void {
    this.selectedProperty.set(null);
  }

  openFilterPanel(): void {
    this._taskService.setSelectedId(null);
    this.selectedProperty.set(null);
    this.isAiChatOpen.set(false);
    this.isNotificationsOpen.set(false);
    this.isFilterPanelOpen.set(true);
  }

  closeFilterPanel(): void {
    this.isFilterPanelOpen.set(false);
  }

  toggleFilterPanel(): void {
    if (this.isFilterPanelOpen()) {
      this.closeFilterPanel();
    } else {
      this.openFilterPanel();
    }
  }

  openAiChat(): void {
    this._taskService.setSelectedId(null);
    this.selectedProperty.set(null);
    this.isFilterPanelOpen.set(false);
    this.isNotificationsOpen.set(false);
    this.isAiChatOpen.set(true);
  }

  openNotifications(): void {
    this._taskService.setSelectedId(null);
    this.selectedProperty.set(null);
    this.isFilterPanelOpen.set(false);
    this.isAiChatOpen.set(false);
    this.isNotificationsOpen.set(true);
  }

  closeNotifications(): void {
    this.isNotificationsOpen.set(false);
  }

  closeAiChat(): void {
    this.isAiChatOpen.set(false);
  }

  toggleAiChat(): void {
    if (this.isAiChatOpen()) {
      this.closeAiChat();
    } else {
      this.openAiChat();
    }
  }

  private readonly _selectedTask = toSignal(this._taskService.selectedTask$, {
    initialValue: null,
  });

  private readonly _taskDetailPanelTargetPanel = toSignal(
    this._taskService.taskDetailPanelTargetPanel$,
    { initialValue: null },
  );

  private readonly _layoutFeatureState = toSignal(
    this._store.select(selectLayoutFeatureState),
    {
      initialValue: INITIAL_LAYOUT_STATE,
    },
  );

  readonly panelType = computed<PanelContentType | null>(() => {
    const layoutState = this._layoutFeatureState();
    const selectedTask = this._selectedTask();
    if (!layoutState) return null;

    const {
      isShowNotes,
      isShowIssuePanel,
      isShowTaskViewCustomizerPanel,
      isShowPluginPanel,
      isShowScheduleDayPanel,
    } = layoutState;

    if (isShowNotes) return 'NOTES';
    if (isShowIssuePanel) return 'ISSUE_PANEL';
    if (isShowTaskViewCustomizerPanel) return 'TASK_VIEW_CUSTOMIZER_PANEL';
    if (isShowPluginPanel) return 'PLUGIN';
    if (isShowScheduleDayPanel) return 'SCHEDULE_DAY_PANEL';
    if (this.isAiChatOpen()) return 'AI_CHAT';
    if (this.isNotificationsOpen()) return 'NOTIFICATIONS';
    if (this.isFilterPanelOpen()) return 'FILTERS';
    if (this.selectedProperty()) return 'PROPERTY';
    if (selectedTask) return 'TASK';
    return null;
  });

  readonly hasContent = computed<boolean>(() => {
    const layoutState = this._layoutFeatureState();
    const selectedTask = this._selectedTask();
    if (!layoutState) return false;
    const {
      isShowNotes,
      isShowIssuePanel,
      isShowTaskViewCustomizerPanel,
      isShowPluginPanel,
      isShowScheduleDayPanel,
    } = layoutState;
    return !!(
      selectedTask ||
      isShowNotes ||
      isShowIssuePanel ||
      isShowTaskViewCustomizerPanel ||
      isShowPluginPanel ||
      isShowScheduleDayPanel ||
      this.selectedProperty() ||
      this.isFilterPanelOpen() ||
      this.isAiChatOpen() ||
      this.isNotificationsOpen()
    );
  });

  readonly canOpen = computed<boolean>(() => {
    const target = this._taskDetailPanelTargetPanel();
    return this.hasContent() && target !== TaskDetailTargetPanel.DONT_OPEN_PANEL;
  });

  getCurrentPanelType(): PanelContentType | null {
    return this.panelType();
  }

  getHasContent(): boolean {
    return this.hasContent();
  }

  getCanOpen(): boolean {
    return this.canOpen();
  }
}
