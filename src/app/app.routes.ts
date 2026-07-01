import { Routes } from '@angular/router';

import {
  ActiveWorkContextGuard,
  DefaultStartPageGuard,
  FocusOverlayOpenGuard,
  ValidProjectIdGuard,
  ValidTagIdGuard,
} from './app.guard';

import { TagTaskPageComponent } from './pages/tag-task-page/tag-task-page.component';

import { mrsqmAuthGuard } from './mrsqm/guards/auth.guard';

export const APP_ROUTES: Routes = [
  // Eagerly loaded — this is the main view
  {
    path: 'tag/:id/tasks',
    component: TagTaskPageComponent,
    data: { page: 'tag-tasks' },
    canActivate: [ValidTagIdGuard, FocusOverlayOpenGuard],
  },
  // Tag sub-routes (worklog, history, summary, metrics)
  // Must appear after tag/:id/tasks so the more specific path matches first
  {
    path: 'tag/:id',
    canActivate: [ValidTagIdGuard],
    canActivateChild: [FocusOverlayOpenGuard],
    loadChildren: () => import('./routes/context.routes').then((m) => m.TAG_CHILD_ROUTES),
  },
  // Project routes (tasks, worklog, history, summary, metrics)
  // Shares one chunk with tag routes via context.routes.ts
  {
    path: 'project/:id',
    canActivate: [ValidProjectIdGuard],
    canActivateChild: [FocusOverlayOpenGuard],
    loadChildren: () =>
      import('./routes/context.routes').then((m) => m.PROJECT_CHILD_ROUTES),
  },
  // Standalone pages — all import from same barrel so they share one chunk
  {
    path: 'config',
    loadComponent: () =>
      import('./routes/pages.routes').then((m) => m.ConfigPageComponent),
    data: { page: 'config' },
    canActivate: [FocusOverlayOpenGuard],
  },
  {
    path: 'search',
    loadComponent: () =>
      import('./routes/pages.routes').then((m) => m.SearchPageComponent),
    data: { page: 'search' },
    canActivate: [FocusOverlayOpenGuard],
  },
  {
    path: 'scheduled-list',
    loadComponent: () =>
      import('./routes/pages.routes').then((m) => m.ScheduledListPageComponent),
    data: { page: 'scheduled-list' },
    canActivate: [FocusOverlayOpenGuard],
  },
  {
    path: 'planner',
    loadComponent: () => import('./routes/pages.routes').then((m) => m.PlannerComponent),
    data: { page: 'planner' },
    canActivate: [FocusOverlayOpenGuard],
  },
  {
    path: 'schedule',
    loadComponent: () => import('./routes/pages.routes').then((m) => m.ScheduleComponent),
    data: { page: 'schedule' },
    canActivate: [FocusOverlayOpenGuard],
  },
  {
    path: 'boards',
    loadComponent: () => import('./routes/pages.routes').then((m) => m.BoardsComponent),
    data: { page: 'boards' },
    canActivate: [FocusOverlayOpenGuard],
  },
  {
    path: 'habits',
    loadComponent: () =>
      import('./routes/pages.routes').then((m) => m.HabitPageComponent),
    data: { page: 'habits' },
    canActivate: [FocusOverlayOpenGuard],
  },
  {
    path: 'archived-projects',
    loadComponent: () =>
      import('./routes/pages.routes').then((m) => m.ArchivedProjectsPageComponent),
    data: { page: 'archived-projects' },
    canActivate: [FocusOverlayOpenGuard],
  },
  {
    path: 'donate',
    loadComponent: () =>
      import('./routes/pages.routes').then((m) => m.DonatePageComponent),
    data: { page: 'donate' },
    canActivate: [FocusOverlayOpenGuard],
  },
  {
    path: 'contrast-test',
    loadComponent: () =>
      import('./routes/pages.routes').then((m) => m.ContrastTestComponent),
    data: { page: 'contrast-test' },
  },
  {
    path: 'plugins/:pluginId/index',
    loadComponent: () =>
      import('./routes/pages.routes').then((m) => m.PluginIndexComponent),
    data: { page: 'plugin-index' },
    canActivate: [FocusOverlayOpenGuard],
  },
  {
    path: 'active/:subPageType',
    canActivate: [ActiveWorkContextGuard, FocusOverlayOpenGuard],
    loadComponent: () =>
      import('./routes/pages.routes').then((m) => m.ConfigPageComponent),
  },
  {
    path: 'active/:subPageType/:param',
    canActivate: [ActiveWorkContextGuard, FocusOverlayOpenGuard],
    loadComponent: () =>
      import('./routes/pages.routes').then((m) => m.ConfigPageComponent),
  },
  {
    path: 'active',
    canActivate: [ActiveWorkContextGuard, FocusOverlayOpenGuard],
    loadComponent: () =>
      import('./routes/pages.routes').then((m) => m.ConfigPageComponent),
  },
  // ─── MrSQM — риелторская CRM ─────────────────────────────────────────────
  // Публичный вход.
  {
    path: 'login',
    loadComponent: () =>
      import('./mrsqm/pages/login/login-page.component').then(
        (m) => m.LoginPageComponent,
      ),
    data: { page: 'mrsqm-login' },
  },
  // Все mrsqm/* — только для залогиненного пользователя (mrsqmAuthGuard).
  {
    path: 'mrsqm/feed',
    loadComponent: () =>
      import('./mrsqm/pages/feed/feed-page.component').then((m) => m.FeedPageComponent),
    data: { page: 'mrsqm-feed' },
    canActivate: [mrsqmAuthGuard, FocusOverlayOpenGuard],
  },
  {
    path: 'mrsqm/add',
    loadComponent: () =>
      import('./mrsqm/pages/add-property/add-property-page.component').then(
        (m) => m.AddPropertyPageComponent,
      ),
    data: { page: 'mrsqm-add', title: 'Добавить объект', icon: 'add_home' },
    canActivate: [mrsqmAuthGuard],
  },
  {
    path: 'mrsqm/edit/:id',
    loadComponent: () =>
      import('./mrsqm/pages/edit-property/edit-property.component').then(
        (m) => m.EditPropertyPageComponent,
      ),
    data: { page: 'mrsqm-edit', title: 'Редактировать объект', icon: 'edit' },
    canActivate: [mrsqmAuthGuard],
  },
  {
    path: 'mrsqm/network',
    loadComponent: () =>
      import('./mrsqm/pages/stub/stub-page.component').then((m) => m.StubPageComponent),
    data: { page: 'mrsqm-network', title: 'Сеть', icon: 'group' },
    canActivate: [mrsqmAuthGuard],
  },
  {
    path: 'mrsqm/chat',
    loadComponent: () =>
      import('./mrsqm/pages/chat/chat-page.component').then((m) => m.ChatPageComponent),
    data: { page: 'mrsqm-chat', title: 'AI Chat', icon: 'wand_stars' },
    canActivate: [mrsqmAuthGuard],
  },
  {
    path: 'mrsqm/profile',
    loadComponent: () =>
      import('./mrsqm/pages/profile/profile-page.component').then(
        (m) => m.ProfilePageComponent,
      ),
    data: { page: 'mrsqm-profile', title: 'Профиль', icon: 'person' },
    canActivate: [mrsqmAuthGuard],
  },
  // Wildcard — redirects to default start page
  {
    path: '**',
    canActivate: [DefaultStartPageGuard],
    component: TagTaskPageComponent,
  },
];
