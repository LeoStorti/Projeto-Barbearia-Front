import { Component, Inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatAutocompleteModule } from '@angular/material/autocomplete';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatSelectModule } from '@angular/material/select';
import { MatOptionModule } from '@angular/material/core';
import { ReactiveFormsModule, FormControl } from '@angular/forms';
import { startWith, map, Observable } from 'rxjs';

export interface AgendamentoDialogData {
  horario: string;
  dataISO: string; // Data selecionada no slot em ISO
  profissionalId: number;
  clientes: Array<{ ClienteId: number; Nome: string; Email?: string; Alergias?: string; Endereco?: string; Telefone?: string }>;
  servicos: Array<{ ServicoId?: number; servicoId?: number; Nome?: string; nome?: string; Duracao?: number; duracao?: number }>;
}

export interface AgendamentoDialogResult {
  clienteId: number;
  servicoId: number;
  duracaoMinutos: number;
  observacoes: string;
  clienteNome?: string;
  servicoNome?: string;
  email?: string;
  alergias?: string;
  endereco?: string;
  telefone?: string;
  // reminder options
  reminderEnabled?: boolean;
  reminderChannels?: ('email'|'sms'|'whatsapp'|'push')[];
  reminderMinutesBefore?: number;
}

@Component({
  selector: 'app-agendamento-dialog',
  standalone: true,
  imports: [
    CommonModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatAutocompleteModule,
    MatCheckboxModule,
    MatSelectModule,
    MatOptionModule,
    ReactiveFormsModule,
    FormsModule,
  ],
  template: `
  <div style="min-width:320px; max-width:520px">
    <h2 mat-dialog-title>Novo agendamento</h2>
    <div style="margin: 0 24px 12px; color:var(--text-secondary); font-size:13px">
      <div>Profissional: <strong>#{{data.profissionalId}}</strong></div>
  <div>Data/Hora: <strong>{{ data.dataISO | date:'short' }}</strong></div>
    </div>

    <div mat-dialog-content style="display:flex; flex-direction:column; gap:12px;">
      <mat-form-field appearance="fill">
        <mat-label>Cliente</mat-label>
        <input type="text" matInput [formControl]="clienteCtrl" [matAutocomplete]="autoCliente" placeholder="Digite para pesquisar" />
        <mat-autocomplete #autoCliente="matAutocomplete" [displayWith]="displayCliente" (optionSelected)="onClienteSelected($event.option.value)">
          <mat-option *ngFor="let c of filteredClientes$ | async" [value]="c">{{ c.Nome }}</mat-option>
        </mat-autocomplete>
      </mat-form-field>

      <mat-form-field appearance="fill">
        <mat-label>Email do cliente</mat-label>
        <input matInput [value]="selectedCliente()?.Email || ''" placeholder="Email do cliente" readonly />
      </mat-form-field>

      <mat-form-field appearance="fill">
        <mat-label>Telefone do cliente</mat-label>
        <input matInput [value]="selectedCliente()?.Telefone || ''" placeholder="Telefone do cliente" readonly />
      </mat-form-field>

      <mat-form-field appearance="fill">
        <mat-label>Alergias do cliente</mat-label>
        <textarea matInput rows="2" [value]="selectedCliente()?.Alergias || ''" placeholder="Alergias do cliente" readonly></textarea>
      </mat-form-field>

      <mat-form-field appearance="fill">
        <mat-label>Endereço do cliente</mat-label>
        <textarea matInput rows="2" [value]="selectedCliente()?.Endereco || ''" placeholder="Endereço do cliente" readonly></textarea>
      </mat-form-field>

      <mat-form-field appearance="fill">
        <mat-label>Serviço</mat-label>
        <input type="text" matInput [formControl]="servicoCtrl" [matAutocomplete]="autoServico" placeholder="Digite para pesquisar" />
        <mat-autocomplete #autoServico="matAutocomplete" [displayWith]="displayServico" (optionSelected)="onServicoSelected($event.option.value)">
          <mat-option *ngFor="let s of filteredServicos$ | async" [value]="s">{{ getServicoNome(s) }}</mat-option>
        </mat-autocomplete>
      </mat-form-field>

      <mat-form-field appearance="fill">
        <mat-label>Duração (minutos)</mat-label>
        <input matInput type="number" min="5" step="5" [formControl]="duracaoCtrl" placeholder="Ex.: 30" />
      </mat-form-field>

      <mat-form-field appearance="fill">
        <mat-label>Observações (opcional)</mat-label>
        <textarea matInput rows="2" [formControl]="observacoesCtrl" placeholder="Ex.: Preferência por cadeira próxima à janela"></textarea>
      </mat-form-field>

      <div style="display:flex; gap:12px; align-items:center;">
        <mat-checkbox [(ngModel)]="reminderEnabled">Enviar lembrete ao cliente</mat-checkbox>
        <mat-form-field appearance="fill" *ngIf="reminderEnabled" style="min-width:160px;">
          <mat-label>Canal</mat-label>
          <mat-select multiple [(ngModel)]="reminderChannels">
            <mat-option value="email">Email</mat-option>
            <mat-option value="sms">SMS</mat-option>
            <mat-option value="whatsapp">WhatsApp</mat-option>
            <mat-option value="push">Push</mat-option>
          </mat-select>
        </mat-form-field>

        <mat-form-field appearance="fill" *ngIf="reminderEnabled" style="width:120px;">
          <mat-label>Antecedência</mat-label>
          <mat-select [(ngModel)]="reminderMinutesBefore">
            <mat-option [value]="1440">24h</mat-option>
            <mat-option [value]="60">1h</mat-option>
            <mat-option [value]="15">15min</mat-option>
          </mat-select>
        </mat-form-field>
      </div>
    </div>

    <div mat-dialog-actions style="justify-content:flex-end; gap:8px; padding: 8px 24px 16px;">
      <button mat-button (click)="onCancel()">Cancelar</button>
  <button mat-flat-button color="primary" [disabled]="!canConfirm()" (click)="onConfirm()">Agendar</button>
    </div>
  </div>
  `,
})
export class AgendamentoDialogComponent {
  clienteCtrl = new FormControl('');
  servicoCtrl = new FormControl('');
  duracaoCtrl = new FormControl<number | null>(null);
  observacoesCtrl = new FormControl('');
  // reminder controls
  reminderEnabled: boolean = false;
  reminderChannels: ('email'|'sms'|'whatsapp'|'push')[] = ['email'];
  reminderMinutesBefore: number = 60;

  filteredClientes$: Observable<{ ClienteId: number; Nome: string; Email?: string; Alergias?: string; Endereco?: string; Telefone?: string }[]>;
  filteredServicos$: Observable<any[]>;

  // hold selections
  selectedCliente = signal<{ ClienteId: number; Nome: string; Email?: string; Alergias?: string; Endereco?: string; Telefone?: string } | null>(null);
  selectedServico = signal<any | null>(null);

  constructor(
    @Inject(MAT_DIALOG_DATA) public data: AgendamentoDialogData,
    private dialogRef: MatDialogRef<AgendamentoDialogComponent, AgendamentoDialogResult>
  ) {
    this.filteredClientes$ = this.clienteCtrl.valueChanges.pipe(
      startWith(''),
      map(val => this.filterClientes(typeof val === 'string' ? val : this.getClienteNome(val)))
    );
    this.filteredServicos$ = this.servicoCtrl.valueChanges.pipe(
      startWith(''),
      map(val => this.filterServicos(typeof val === 'string' ? val : this.getServicoNome(val)))
    );
  }

  // displayWith callbacks as arrow functions to preserve `this`
  displayCliente = (c: any): string => {
    if (!c) return '';
    return typeof c === 'object' ? (c.Nome || c.nome || '') : String(c);
  };
  displayServico = (s: any): string => {
    if (!s) return '';
    return typeof s === 'object' ? (s.NomeServico || s.nomeServico || s.Nome || s.nome || '') : String(s);
  };

  private getClienteNome(c: any): string {
    return c && typeof c === 'object' ? (c.Nome || c.nome || '') : (c || '');
  }
  getServicoNome(s: any): string {
    if (!s) return '';
    // Servicos no app usam NomeServico/servicoId
    return typeof s === 'object' ? (s.NomeServico || s.nomeServico || s.Nome || s.nome || '') : s;
  }

  private filterClientes(term: string): { ClienteId: number; Nome: string; Email?: string; Alergias?: string; Endereco?: string; Telefone?: string }[] {
    const t = (term || '').toLowerCase();
    return (this.data.clientes || []).filter((c: any) => {
      const nome = (c?.Nome ?? c?.nome ?? '').toString().toLowerCase();
      return nome.includes(t);
    }).slice(0, 20);
  }
  private filterServicos(term: string): any[] {
    const t = (term || '').toLowerCase();
    return (this.data.servicos || []).filter(s => (this.getServicoNome(s) || '').toLowerCase().includes(t)).slice(0, 20);
  }

  onClienteSelected(c: any) {
    this.selectedCliente.set(c);
  }
  onServicoSelected(s: any) {
    this.selectedServico.set(s);
    // Preenche duração padrão do serviço, se existir
    try {
      const dur = Number(s?.duracao ?? s?.Duracao ?? 0);
      if (Number.isFinite(dur) && dur > 0) {
        this.duracaoCtrl.setValue(dur);
      }
    } catch {}
  }

  onCancel() { this.dialogRef.close(); }

  private resolveClienteFromInput(): { ClienteId: number; Nome: string; Email?: string; Alergias?: string; Endereco?: string; Telefone?: string } | null {
    const val = this.clienteCtrl.value as any;
    if (val && typeof val === 'object') return val;
    const t = String(val || '').toLowerCase();
    if (!t) return null;
    const match = (this.data.clientes || []).find((c: any) => ((c?.Nome ?? c?.nome ?? '') as string).toLowerCase() === t);
    return match || null;
  }

  private resolveServicoFromInput(): any | null {
    const val = this.servicoCtrl.value as any;
    if (val && typeof val === 'object') return val;
    const t = String(val || '').toLowerCase();
    if (!t) return null;
    const match = (this.data.servicos || []).find((s: any) => ((s.NomeServico || s.nomeServico || s.Nome || s.nome || '') as string).toLowerCase() === t);
    return match || null;
  }

  canConfirm(): boolean {
    // Cliente e Serviço são obrigatórios; Observações terá fallback padrão se vazio
    const clienteOk = !!(this.selectedCliente() || this.resolveClienteFromInput());
    const servicoOk = !!(this.selectedServico() || this.resolveServicoFromInput());
    const dur = Number(this.duracaoCtrl.value ?? 0);
    const durOk = Number.isFinite(dur) && dur > 0;
    return clienteOk && servicoOk && durOk;
  }

  onConfirm() {
    const cliente = this.selectedCliente() || this.resolveClienteFromInput();
    const servico = this.selectedServico() || this.resolveServicoFromInput();
    if (!cliente || !servico) return;

    const duracao = Number(this.duracaoCtrl.value ?? servico?.duracao ?? servico?.Duracao ?? 30);
    if (!Number.isFinite(duracao) || duracao <= 0) return;

    const obs = (this.observacoesCtrl.value || '').toString().trim() || 'Agendado via calendário';
    const clienteId = Number((cliente as any).ClienteId ?? (cliente as any).clienteId ?? (cliente as any).id ?? (cliente as any).Id);
    const servicoId = Number((servico as any).servicoId ?? (servico as any).ServicoId ?? (servico as any).id ?? (servico as any).Id);
    if (!Number.isFinite(clienteId) || clienteId <= 0) return;
    if (!Number.isFinite(servicoId) || servicoId <= 0) return;
    const result: AgendamentoDialogResult = {
      clienteId,
      servicoId,
      duracaoMinutos: duracao,
      observacoes: obs,
      clienteNome: String((cliente as any)?.Nome ?? (cliente as any)?.nome ?? '').trim() || undefined,
      servicoNome: String((servico as any)?.NomeServico ?? (servico as any)?.nomeServico ?? (servico as any)?.Nome ?? (servico as any)?.nome ?? '').trim() || undefined,
      email: cliente.Email,
      alergias: cliente.Alergias,
      endereco: cliente.Endereco || 'Não informado',
      telefone: cliente.Telefone,
      reminderEnabled: this.reminderEnabled,
      reminderChannels: this.reminderChannels,
      reminderMinutesBefore: this.reminderMinutesBefore
    };
    this.dialogRef.close(result);
  }
}
