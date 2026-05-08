import { Component, Input, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { BaseChartDirective } from 'ng2-charts';
import { ChartData, ChartOptions } from 'chart.js';
import { getThemePalette } from '../../theme/color-tokens';

interface KPIData {
  title: string;
  value: number | string;
  percentage: number;
  icon: string;
  color: 'primary' | 'success' | 'warning' | 'danger';
  format: 'number' | 'currency' | 'percentage';
  trend?: number[];
  target?: number;
}

@Component({
  selector: 'app-kpi-card',
  standalone: true,
  imports: [
    CommonModule,
    MatCardModule,
    MatIconModule,
    MatProgressBarModule,
    MatTooltipModule,
    BaseChartDirective
  ],
  template: `
    <mat-card [ngClass]="['kpi-card', 'kpi-' + data.color]">
      <mat-card-content>
        <div class="kpi-header">
          <div class="kpi-info">
            <h3 class="kpi-title">{{ data.title }}</h3>
            <div class="kpi-value">
              {{ formatValue(data.value, data.format) }}
            </div>
          </div>
          <div class="kpi-icon" [style.background-color]="getIconColor()">
            <mat-icon>{{ data.icon }}</mat-icon>
          </div>
        </div>

        <div class="kpi-footer">
          <div class="kpi-change" [class.positive]="data.percentage > 0" [class.negative]="data.percentage < 0">
            <mat-icon>{{ data.percentage > 0 ? 'trending_up' : data.percentage < 0 ? 'trending_down' : 'trending_flat' }}</mat-icon>
            {{ data.percentage > 0 ? '+' : '' }}{{ data.percentage }}%
          </div>
          <span class="kpi-period">vs. período anterior</span>
        </div>

        <!-- Mini trend chart -->
        <div class="kpi-trend" *ngIf="data.trend && data.trend.length > 0">
          <canvas
            baseChart
            [data]="trendChartData"
            [options]="trendChartOptions"
            [type]="'line'"
            width="100"
            height="40">
          </canvas>
        </div>

        <!-- Progress bar for target -->
        <div class="kpi-progress" *ngIf="data.target">
          <div class="progress-info">
            <span class="progress-label">Meta: {{ formatValue(data.target, data.format) }}</span>
            <span class="progress-percentage">{{ getTargetProgress() }}%</span>
          </div>
          <mat-progress-bar
            mode="determinate"
            [value]="getTargetProgress()"
            [color]="getTargetProgress() >= 100 ? 'primary' : 'warn'">
          </mat-progress-bar>
        </div>

        <!-- Loading skeleton -->
        <div class="kpi-skeleton" *ngIf="isLoading">
          <div class="skeleton-title"></div>
          <div class="skeleton-value"></div>
          <div class="skeleton-footer"></div>
        </div>
      </mat-card-content>
    </mat-card>
  `,
  styles: [`
    .kpi-card {
      position: relative;
      overflow: hidden;
      transition: all 0.3s ease;
      border-radius: 16px;
      min-height: 200px;
      background-color: var(--card-background);
      color: var(--text-primary);
    }

    .kpi-card mat-card-content {
      background-color: var(--card-background);
      padding: 20px;
      display: flex;
      flex-direction: column;
      gap: 0;
    }

    .kpi-card:hover {
      transform: translateY(-4px);
      box-shadow: 0 8px 25px rgba(0, 0, 0, 0.15);
    }

    .kpi-card.kpi-primary {
      border-left: 4px solid var(--primary-ui, var(--primary-color));
    }

    .kpi-card.kpi-success {
      border-left: 4px solid var(--success-color);
    }

    .kpi-card.kpi-warning {
      border-left: 4px solid var(--warning-color);
    }

    .kpi-card.kpi-danger {
      border-left: 4px solid var(--error-color);
    }

    .kpi-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      margin-bottom: 16px;
    }

    .kpi-info {
      flex: 1;
    }

    .kpi-title {
      font-size: 0.875rem;
      font-weight: 500;
      color: var(--text-secondary);
      margin: 0 0 8px 0;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }

    .kpi-value {
      font-size: 2rem;
      font-weight: 700;
      color: var(--text-primary) !important;
      line-height: 1.2;
      margin-bottom: 8px;
    }

    .kpi-icon {
      width: 48px;
      height: 48px;
      border-radius: 12px;
      display: flex;
      align-items: center;
      justify-content: center;
      color: white;
    }

    .kpi-icon mat-icon {
      font-size: 24px;
      width: 24px;
      height: 24px;
    }

    .kpi-footer {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-bottom: 16px;
    }

    .kpi-change {
      display: flex;
      align-items: center;
      gap: 4px;
      font-size: 0.875rem;
      font-weight: 600;
    }

    .kpi-change.positive {
      color: var(--success-color);
    }

    .kpi-change.negative {
      color: var(--error-color);
    }

    .kpi-change mat-icon {
      font-size: 16px;
      width: 16px;
      height: 16px;
    }

    .kpi-period {
      font-size: 0.75rem;
      color: var(--text-secondary);
    }

    .kpi-trend {
      height: 40px;
      margin-bottom: 16px;
      position: relative;
      background: transparent;
    }

    .kpi-trend canvas {
      background: transparent !important;
      display: block;
      width: 100% !important;
      height: 100% !important;
    }

    .kpi-progress {
      margin-top: 16px;
    }

    .progress-info {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 8px;
    }

    .progress-label {
      font-size: 0.75rem;
      color: var(--text-secondary);
    }

    .progress-percentage {
      font-size: 0.75rem;
      font-weight: 600;
      color: var(--text-primary);
    }

    /* Loading skeleton */
    .kpi-skeleton {
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: var(--card-background);
      padding: 24px;
      display: flex;
      flex-direction: column;
      gap: 12px;
    }

    .skeleton-title,
    .skeleton-value,
    .skeleton-footer {
      background: linear-gradient(90deg, var(--border-color) 25%, transparent 50%, var(--border-color) 75%);
      background-size: 200% 100%;
      animation: loading 1.5s infinite;
      border-radius: 4px;
    }

    .skeleton-title {
      height: 16px;
      width: 60%;
    }

    .skeleton-value {
      height: 32px;
      width: 80%;
    }

    .skeleton-footer {
      height: 14px;
      width: 40%;
    }

    @keyframes loading {
      0% {
        background-position: 200% 0;
      }
      100% {
        background-position: -200% 0;
      }
    }

    /* Dark theme adjustments */
    [data-theme="dark"] .kpi-value {
      color: #ffffff !important;
    }

    [data-theme="dark"] .kpi-title {
      color: #e0e0e0 !important;
    }

    [data-theme="dark"] .progress-percentage {
      color: #ffffff !important;
    }
  `]
})
export class KpiCardComponent implements OnInit {
  @Input() data!: KPIData;
  @Input() isLoading = false;

  trendChartData!: ChartData<'line'>;
  trendChartOptions: ChartOptions<'line'> = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: false
      },
      tooltip: {
        enabled: false
      }
    },
    scales: {
      x: {
        display: false
      },
      y: {
        display: false
      }
    },
    elements: {
      point: {
        radius: 0
      },
      line: {
        borderWidth: 2,
        tension: 0.4
      }
    },
    interaction: {
      intersect: false
    }
  };

  ngOnInit(): void {
    this.setupTrendChart();
  }

  formatValue(value: number | string, format: string): string {
    if (typeof value === 'string') return value;

    switch (format) {
      case 'currency':
        return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
      case 'percentage':
        return `${value}%`;
      case 'number':
      default:
        return value.toLocaleString('pt-BR');
    }
  }

  getIconColor(): string {
    const palette = getThemePalette();
    const colors: Record<string, string> = {
      primary: palette.primary,
      success: palette.success,
      warning: palette.warning,
      danger: palette.error
    };
    return colors[this.data.color] ?? palette.primary;
  }

  getTargetProgress(): number {
    if (!this.data.target || typeof this.data.value !== 'number') return 0;
    return Math.min(100, (this.data.value / this.data.target) * 100);
  }

  private setupTrendChart(): void {
    if (!this.data.trend || this.data.trend.length === 0) return;

    const gradient = this.createGradient();

    this.trendChartData = {
      labels: this.data.trend.map((_, index) => index.toString()),
      datasets: [{
        data: this.data.trend,
        borderColor: this.getIconColor(),
        backgroundColor: gradient,
        fill: true,
        tension: 0.4
      }]
    };
  }

  private createGradient(): string {
    const color = this.getIconColor();
    return `linear-gradient(to bottom, ${color}20, transparent)`;
  }
}
