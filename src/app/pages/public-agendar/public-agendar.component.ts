import { CommonModule } from '@angular/common';
import { Component, computed, inject } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { finalize } from 'rxjs/operators';
import { HttpErrorResponse } from '@angular/common/http';
import { PublicAgendamentosService, PublicService } from '../../services/public-agendamentos.service';

type BookingStep = 'service' | 'date' | 'time' | 'customer' | 'done';


@Component({
  selector: 'app-public-agendar',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  template: `
    <main class="flex-1">
      <div class="page-container">
        <header class="mb-4">
          <h1 class="text-xl font-semibold">Agendamento Online</h1>
          <p class="text-sm text-muted-foreground">
            Você está agendando na barbearia: <strong>{{ slug() }}</strong>
          </p>
        </header>

        <section class="card">
          <div class="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 class="text-base font-semibold">Agende em poucos passos</h2>
              <p class="mt-1 text-sm text-muted-foreground">
                Sem preferência de profissional (o sistema escolhe um disponível).
              </p>
            </div>

            <div class="text-sm text-muted-foreground">
              Etapa {{ stepNumber() }}/4
            </div>
          </div>

          <!-- Step: Service -->
          <ng-container *ngIf="step === 'service'">
            <div class="mt-4">
              <div class="text-sm font-medium">1) Escolha o serviço</div>
              <div class="mt-2 text-sm text-muted-foreground" *ngIf="isCatalogLoading">Carregando serviços…</div>

              <div
                class="mt-3 rounded-lg border px-4 py-3 text-sm text-muted-foreground"
                style="border-color: var(--border)"
                *ngIf="!isCatalogLoading && services.length === 0 && !errorMessage"
              >
                Nenhum serviço disponível para agendamento online no momento.
                <div class="mt-1">
                  Peça para a barbearia cadastrar serviços e tente novamente.
                </div>
              </div>

              <div class="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2">
                <button
                  type="button"
                  class="choice"
                  *ngFor="let s of services"
                  (click)="selectService(s)"
                >
                  <div class="font-semibold">{{ s.nome }}</div>
                  <div class="text-xs text-muted-foreground">Duração: {{ s.duracaoMinutos }} min</div>
                </button>
              </div>

              <div class="mt-3 text-sm" *ngIf="errorMessage" style="color: var(--destructive)">
                {{ errorMessage }}
              </div>
            </div>
          </ng-container>

          <!-- Step: Date -->
          <ng-container *ngIf="step === 'date'">
            <div class="mt-4">
              <div class="text-sm font-medium">2) Escolha a data</div>
              <div class="mt-2 text-sm text-muted-foreground" *ngIf="selectedService">
                Serviço: <strong>{{ selectedService.nome }}</strong>
              </div>

              <div class="mt-3 flex flex-col sm:flex-row sm:items-end gap-3">
                <label class="field">
                  <span class="label">Data</span>
                  <input class="input" type="date" [value]="selectedDate" (change)="onDateChange($event)" />
                </label>

                <div class="flex gap-2">
                  <button type="button" class="btn" (click)="back()">Voltar</button>
                  <button type="button" class="btn-primary" [disabled]="!selectedDate" (click)="nextFromDate()">
                    Continuar
                  </button>
                </div>
              </div>
            </div>
          </ng-container>

          <!-- Step: Time -->
          <ng-container *ngIf="step === 'time'">
            <div class="mt-4">
              <div class="text-sm font-medium">3) Escolha o horário</div>
              <div class="mt-2 text-sm text-muted-foreground">
                {{ selectedService?.nome }} · {{ formatDate(selectedDate) }}
              </div>

              <div class="mt-2 text-sm text-muted-foreground" *ngIf="isAvailabilityLoading">Buscando horários…</div>

              <div class="mt-3 grid grid-cols-3 sm:grid-cols-5 md:grid-cols-6 gap-2">
                <button
                  type="button"
                  class="slot"
                  *ngFor="let t of availableTimes"
                  [class.slot-selected]="selectedTime === t"
                  (click)="selectTime(t)"
                >
                  {{ t }}
                </button>
              </div>

              <div
                class="mt-3 text-sm"
                *ngIf="!isAvailabilityLoading && isSelectedDayBlocked"
                style="color: var(--muted-foreground)"
              >
                Barbearia fechada nesta data.
                <span *ngIf="blockedReason"> Motivo: {{ blockedReason }}.</span>
              </div>

              <div
                class="mt-3 text-sm"
                *ngIf="!isAvailabilityLoading && !isSelectedDayBlocked && availableTimes.length === 0"
                style="color: var(--muted-foreground)"
              >
                Sem horários disponíveis para esta data.
              </div>

              <div class="mt-3 text-sm" *ngIf="errorMessage" style="color: var(--destructive)">
                {{ errorMessage }}
              </div>

              <div class="mt-4 flex gap-2">
                <button type="button" class="btn" (click)="back()">Voltar</button>
                <button type="button" class="btn-primary" [disabled]="!selectedTime" (click)="nextFromTime()">
                  Continuar
                </button>
              </div>
            </div>
          </ng-container>

          <!-- Step: Customer -->
          <ng-container *ngIf="step === 'customer'">
            <div class="mt-4">
              <div class="text-sm font-medium">4) Seus dados</div>
              <div class="mt-2 text-sm text-muted-foreground">
                {{ selectedService?.nome }} · {{ formatDate(selectedDate) }} · {{ selectedTime }}
              </div>

              <form class="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3" [formGroup]="customerForm" (ngSubmit)="confirm()">
                <label class="field sm:col-span-1">
                  <span class="label">Nome</span>
                  <input class="input" type="text" formControlName="nome" placeholder="Seu nome" />
                </label>

                <label class="field sm:col-span-1">
                  <span class="label">WhatsApp</span>
                  <input class="input" type="tel" formControlName="whatsapp" placeholder="(DDD) 99999-9999" />
                </label>

                <div class="sm:col-span-2 flex flex-wrap gap-2">
                  <button type="button" class="btn" (click)="back()">Voltar</button>
                  <button type="submit" class="btn-primary" [disabled]="customerForm.invalid || isConfirming">
                    {{ isConfirming ? 'Confirmando…' : 'Confirmar agendamento' }}
                  </button>
                </div>

                <div class="sm:col-span-2 text-xs text-muted-foreground" *ngIf="customerForm.touched && customerForm.invalid">
                  Preencha nome e WhatsApp.
                </div>

                <div class="sm:col-span-2 text-sm" *ngIf="errorMessage" style="color: var(--destructive)">
                  {{ errorMessage }}
                </div>
              </form>
            </div>
          </ng-container>

          <!-- Step: Done -->
          <ng-container *ngIf="step === 'done'">
            <div class="mt-4">
              <div class="text-sm font-medium">
                {{ lastConfirmation?.status === 'confirmed' ? 'Agendamento confirmado' : 'Solicitação enviada' }}
              </div>
              <p class="mt-2 text-sm text-muted-foreground" *ngIf="lastConfirmation?.status === 'confirmed'">
                Agendamento confirmado. Cliente foi associado (ou criado) pelo WhatsApp.
              </p>
              <p class="mt-2 text-sm text-muted-foreground" *ngIf="lastConfirmation?.status !== 'confirmed'">
                Solicitação recebida. A barbearia vai analisar e confirmar pelo WhatsApp.
              </p>

              <div class="mt-4 rounded-lg border px-4 py-3" style="border-color: var(--border)">
                <div class="text-sm"><strong>Serviço:</strong> {{ selectedService?.nome }}</div>
                <div class="text-sm"><strong>Data:</strong> {{ formatDate(selectedDate) }}</div>
                <div class="text-sm"><strong>Horário:</strong> {{ selectedTime }}</div>
                <div class="text-sm"><strong>Cliente:</strong> {{ customerForm.value.nome }} ({{ customerForm.value.whatsapp }})</div>
                <div class="text-sm" *ngIf="lastConfirmation">
                  <strong>Código:</strong> {{ lastConfirmation.appointmentId }}
                </div>
                <div class="text-sm" *ngIf="lastConfirmation">
                  <strong>Status:</strong>
                  {{ lastConfirmation.status === 'confirmed' ? 'Confirmado' : 'Pendente' }}
                </div>
              </div>

              <div class="mt-3 text-xs text-muted-foreground">
                Para cancelar ou alterar este agendamento, entre em contato com a barbearia.
              </div>

              <div class="mt-4 flex flex-wrap gap-2">
                <button type="button" class="btn" (click)="reset()">Fazer outro agendamento</button>
              </div>
            </div>
          </ng-container>
        </section>
      </div>
    </main>
  `,
  styles: [
    `
      :host {
        display: block;

        /* Fallback de tokens para este componente (não depende de variáveis externas). */
        --background: var(--background-color);
        --foreground: var(--text-primary);
        --border: var(--border-color);
        --card: var(--surface-color);
        --card-foreground: var(--text-primary);
        --muted-foreground: var(--text-secondary);
        --ring: var(--primary-color);
        --destructive: var(--error-color);
      }

      .card {
        border: 1px solid color-mix(in srgb, var(--border) 80%, transparent);
        background: var(--card);
        color: var(--card-foreground);
        border-radius: var(--radius-lg);
        padding: 16px;
        box-shadow: var(--shadow-xs);
      }

      .choice {
        text-align: left;
        border: 1px solid color-mix(in srgb, var(--border) 80%, transparent);
        background: var(--background);
        color: var(--foreground);
        border-radius: var(--radius-lg);
        padding: 12px;
      }

      .choice:hover {
        background: color-mix(in srgb, var(--card) 75%, var(--background));
      }

      .field {
        display: flex;
        flex-direction: column;
        gap: 6px;
      }

      .label {
        font-size: 12px;
        color: var(--muted-foreground);
      }

      .input {
        border: 1px solid color-mix(in srgb, var(--border) 80%, transparent);
        background: var(--background);
        color: var(--foreground);
        border-radius: var(--radius-lg);
        padding: 10px 12px;
        outline: none;
      }

      .input:focus {
        border-color: color-mix(in srgb, var(--ring) 45%, var(--border));
        box-shadow: 0 0 0 3px color-mix(in srgb, var(--ring) 18%, transparent);
      }

      .slot {
        border: 1px solid color-mix(in srgb, var(--border) 80%, transparent);
        background: var(--background);
        color: var(--foreground);
        border-radius: var(--radius-lg);
        padding: 10px 8px;
        font-size: 13px;
      }

      .slot:hover {
        background: color-mix(in srgb, var(--card) 75%, var(--background));
      }

      .slot-selected {
        border-color: color-mix(in srgb, var(--ring) 45%, var(--border));
        background: color-mix(in srgb, var(--ring) 12%, var(--background));
      }

      .btn,
      .btn-primary {
        border-radius: var(--radius-lg);
        padding: 10px 12px;
        font-weight: 600;
      }

      .btn {
        border: 1px solid color-mix(in srgb, var(--border) 80%, transparent);
        background: var(--background);
        color: var(--foreground);
      }

      .btn:hover {
        background: color-mix(in srgb, var(--card) 75%, var(--background));
      }

      .btn-primary {
        border: 1px solid color-mix(in srgb, var(--ring) 45%, var(--border));
        background: color-mix(in srgb, var(--ring) 14%, var(--background));
        color: var(--foreground);
      }

      .btn-primary:disabled {
        opacity: 0.6;
        cursor: not-allowed;
      }

    `,
  ],
})
export class PublicAgendarComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly fb = inject(FormBuilder);
  private readonly publicAgendamentos = inject(PublicAgendamentosService);

  readonly slug = computed(() => this.route.snapshot.paramMap.get('slug') ?? '');

  step: BookingStep = 'service';

  services: PublicService[] = [];
  isCatalogLoading = true;
  isAvailabilityLoading = false;
  isConfirming = false;
  errorMessage: string | null = null;

  lastConfirmation: { appointmentId: string; customerId: string; status: 'pending' | 'confirmed' } | null = null;

  selectedService: PublicService | null = null;
  selectedDate: string = '';
  selectedTime: string | null = null;

  availableTimes: string[] = [];
  isSelectedDayBlocked = false;
  blockedReason: string | null = null;

  customerForm = this.fb.group({
    nome: ['', [Validators.required, Validators.minLength(2)]],
    whatsapp: ['', [Validators.required, Validators.minLength(8)]],
  });

  constructor() {
    const slug = this.slug();
    this.publicAgendamentos
      .getCatalog(slug)
      .pipe(
        finalize(() => {
          this.isCatalogLoading = false;
        })
      )
      .subscribe({
        next: (catalog) => {
          this.services = catalog.services;
        },
        error: () => {
          this.errorMessage = 'Não foi possível carregar os serviços agora.';
        },
      });
  }

  stepNumber(): number {
    switch (this.step) {
      case 'service':
        return 1;
      case 'date':
        return 2;
      case 'time':
        return 3;
      case 'customer':
        return 4;
      case 'done':
        return 4;
      default:
        return 1;
    }
  }

  selectService(service: PublicService) {
    this.errorMessage = null;
    this.lastConfirmation = null;
    this.selectedService = service;
    this.selectedDate = '';
    this.selectedTime = null;
    this.availableTimes = [];
    this.isSelectedDayBlocked = false;
    this.blockedReason = null;
    this.step = 'date';
  }

  onDateChange(event: Event) {
    this.errorMessage = null;
    const value = (event.target as HTMLInputElement).value;
    this.selectedDate = value;
    this.selectedTime = null;
    this.isSelectedDayBlocked = false;
    this.blockedReason = null;
  }

  nextFromDate() {
    if (!this.selectedService || !this.selectedDate) return;

    this.errorMessage = null;
    this.isAvailabilityLoading = true;
    this.availableTimes = [];
    this.selectedTime = null;
    this.isSelectedDayBlocked = false;
    this.blockedReason = null;

    const slug = this.slug();
    this.publicAgendamentos
      .getAvailability(slug, this.selectedService.id, this.selectedDate)
      .pipe(
        finalize(() => {
          this.isAvailabilityLoading = false;
        })
      )
      .subscribe({
        next: (resp) => {
          this.availableTimes = resp.slots;
          this.isSelectedDayBlocked = !!resp.blocked;
          this.blockedReason = resp.reason ?? null;
          this.step = 'time';
        },
        error: (err: unknown) => {
          if (err instanceof HttpErrorResponse) {
            this.errorMessage = err.error?.message || 'Não foi possível carregar horários agora.';
          } else {
            this.errorMessage = 'Não foi possível carregar horários agora.';
          }
        },
      });
  }

  selectTime(time: string) {
    this.errorMessage = null;
    this.selectedTime = time;
  }

  nextFromTime() {
    if (!this.selectedTime) return;
    this.step = 'customer';
  }

  confirm() {
    if (!this.selectedService || !this.selectedDate || !this.selectedTime) return;
    if (this.customerForm.invalid) {
      this.customerForm.markAllAsTouched();
      return;
    }

    this.errorMessage = null;
    this.isConfirming = true;
    const slug = this.slug();

    const nome = String(this.customerForm.value.nome || '').trim();
    const whatsapp = String(this.customerForm.value.whatsapp || '').trim();

    this.publicAgendamentos
      .createAppointment(slug, {
        serviceId: this.selectedService.id,
        date: this.selectedDate,
        time: this.selectedTime,
        customerName: nome,
        customerWhatsapp: whatsapp,
      })
      .pipe(
        finalize(() => {
          this.isConfirming = false;
        })
      )
      .subscribe({
        next: (resp) => {
          this.lastConfirmation = {
            appointmentId: resp.appointmentId,
            customerId: resp.customerId,
            status: resp.status ?? 'pending',
          };
          this.step = 'done';
        },
        error: (err: unknown) => {
          if (err instanceof HttpErrorResponse) {
            this.errorMessage = err.error?.message || 'Não foi possível confirmar agora.';
          } else {
            this.errorMessage = err instanceof Error ? err.message : 'Não foi possível confirmar agora.';
          }
        },
      });
  }

  back() {
    switch (this.step) {
      case 'date':
        this.step = 'service';
        return;
      case 'time':
        this.step = 'date';
        return;
      case 'customer':
        this.step = 'time';
        return;
      default:
        return;
    }
  }

  reset() {
    this.step = 'service';
    this.selectedService = null;
    this.selectedDate = '';
    this.selectedTime = null;
    this.availableTimes = [];
    this.lastConfirmation = null;
    this.errorMessage = null;
    this.customerForm.reset({ nome: '', whatsapp: '' });
  }

  formatDate(isoDate: string): string {
    if (!isoDate) return '';
    const date = new Date(`${isoDate}T00:00:00`);
    if (Number.isNaN(date.getTime())) return isoDate;
    return new Intl.DateTimeFormat('pt-BR', {
      weekday: 'short',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    }).format(date);
  }

}
