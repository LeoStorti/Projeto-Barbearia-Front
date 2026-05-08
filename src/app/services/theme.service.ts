import { Injectable, Inject, PLATFORM_ID, Optional, DOCUMENT } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { BehaviorSubject } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class ThemeService {
  private currentTheme = new BehaviorSubject<string>('light');
  public theme$ = this.currentTheme.asObservable();

  constructor(
    @Inject(PLATFORM_ID) private platformId: Object,
    @Optional() @Inject(DOCUMENT) private document: Document | null
  ) {
    if (isPlatformBrowser(this.platformId)) {
      this.initializeTheme();
    }
  }

  private getDomDocument(): Document | null {
    if (this.document) return this.document;
    if (!isPlatformBrowser(this.platformId)) return null;
    try {
      return (globalThis as any)?.document ?? null;
    } catch {
      return null;
    }
  }

  private initializeTheme(): void {
    const doc = this.getDomDocument();
    if (!doc) return;

    try {
      const savedTheme = localStorage.getItem('theme');
      if (savedTheme) {
        this.setTheme(savedTheme);
      } else {
        const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
        this.setTheme(prefersDark ? 'dark' : 'light');
      }
    } catch (error) {
      console.warn('Erro ao inicializar tema:', error);
      this.setTheme('light');
    }
  }

  setTheme(theme: string): void {
    this.currentTheme.next(theme);

    if (isPlatformBrowser(this.platformId)) {
      try {
        localStorage.setItem('theme', theme);
      } catch (error) {
        console.warn('Erro ao salvar tema no localStorage:', error);
      }
    }

    const doc = this.getDomDocument();
    if (doc) {
      // Aplique no <html> e também no <body> para evitar inconsistências de herança
      // quando algum container recebe/retém atributos antigos.
      doc.documentElement.setAttribute('data-theme', theme);
      doc.body.setAttribute('data-theme', theme);

      if (theme === 'dark') {
        doc.body.classList.add('dark-theme');
        doc.body.classList.remove('light-theme');
      } else {
        doc.body.classList.add('light-theme');
        doc.body.classList.remove('dark-theme');
      }

      // Debug (sem impacto de UI): ajuda a diagnosticar quando o tema muda
      // no estado, mas não reflete no DOM/CSS.
      try {
        const bg = getComputedStyle(doc.body).getPropertyValue('--background-color').trim();
        const surface = getComputedStyle(doc.body).getPropertyValue('--surface-color').trim();
        const bodyBg = getComputedStyle(doc.body).backgroundColor;
        const htmlBg = getComputedStyle(doc.documentElement).backgroundColor;
        const appContainer = doc.querySelector('.mat-drawer-container, .mat-sidenav-container') as HTMLElement | null;
        const appBg = appContainer ? getComputedStyle(appContainer).backgroundColor : null;
        // eslint-disable-next-line no-console
        console.warn('[ThemeService] setTheme', {
          theme,
          htmlDataTheme: doc.documentElement.getAttribute('data-theme'),
          bodyDataTheme: doc.body.getAttribute('data-theme'),
          bodyClass: doc.body.className,
          cssVars: { bg, surface },
          computed: { bodyBg, htmlBg, appBg }
        });
      } catch {
        // ignore
      }
    }
  }

  getCurrentTheme(): string {
    return this.currentTheme.value;
  }

  toggleTheme(): void {
    const newTheme = this.currentTheme.value === 'light' ? 'dark' : 'light';
    this.setTheme(newTheme);
  }

  isDarkTheme(): boolean {
    return this.currentTheme.value === 'dark';
  }
}
