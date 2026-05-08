import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { ThemeService } from '../services/theme.service';
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-theme-toggle',
  standalone: true,
  imports: [CommonModule, MatButtonModule, MatIconModule, MatTooltipModule],
  template: `
    <button
      mat-icon-button
      (click)="toggleTheme()"
      [matTooltip]="isDarkTheme ? 'Mudar para tema claro' : 'Mudar para tema escuro'"
      class="theme-toggle-btn">
      <mat-icon>{{ isDarkTheme ? 'light_mode' : 'dark_mode' }}</mat-icon>
    </button>
  `,
  styles: [`
    .theme-toggle-btn {
      transition: all 0.3s ease;
      color: var(--text-primary, #333);
    }

    .theme-toggle-btn:hover {
      background-color: var(--primary-ui, var(--primary-color, #d6ff00));
      color: var(--surface-color, #fff);
      transform: scale(1.05);
    }

    .theme-toggle-btn mat-icon {
      font-size: 20px;
      height: 20px;
      width: 20px;
    }
  `]
})
export class ThemeToggleComponent implements OnInit, OnDestroy {
  isDarkTheme = false;
  private subscription?: Subscription;

  constructor(private themeService: ThemeService) {}

  ngOnInit(): void {
    this.subscription = this.themeService.theme$.subscribe(theme => {
      this.isDarkTheme = theme === 'dark';
    });
  }

  ngOnDestroy(): void {
    if (this.subscription) {
      this.subscription.unsubscribe();
    }
  }

  toggleTheme(): void {
    // eslint-disable-next-line no-console
    console.warn('[ThemeToggle] click', { from: this.isDarkTheme ? 'dark' : 'light' });
    this.themeService.toggleTheme();
  }
}
