import { Component, NgZone, OnDestroy, OnInit } from '@angular/core';
import { MatDatepickerInputEvent } from '@angular/material/datepicker';
import { HttpClient, HttpHeaders, HttpErrorResponse } from '@angular/common/http';
import { MatSnackBar } from '@angular/material/snack-bar';
import { CommonModule } from '@angular/common';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatNativeDateModule } from '@angular/material/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { FormsModule } from '@angular/forms';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatDialogModule } from '@angular/material/dialog';
import { ProfissionaisService, Profissional } from 'app/services/profissionais.service';
import { ClientesService, Clientes } from 'app/services/clientes.service';
import { DragDropModule, CdkDragDrop, CdkDrag, CdkDropList } from '@angular/cdk/drag-drop';
import { MatDialog } from '@angular/material/dialog';
import { forkJoin, of, throwError } from 'rxjs';
import { catchError, map, switchMap } from 'rxjs/operators';
import { AgendamentoDialogComponent, AgendamentoDialogResult } from './agendamento-dialog.component';
import { ReminderService } from '../../services/reminder.service';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatSidenavModule } from '@angular/material/sidenav';
import { MatDividerModule } from '@angular/material/divider';
import { CalendarModule, DateAdapter } from 'angular-calendar';
import { adapterFactory } from 'angular-calendar/date-adapters/date-fns';


@Component({
  selector: 'app-agenda',
  standalone: true,
  imports: [
    CommonModule,
    MatFormFieldModule,
    MatInputModule,
    MatDatepickerModule,
    MatNativeDateModule,
    MatButtonModule,
    MatIconModule,
    FormsModule,
    MatTooltipModule,
    DragDropModule,
    MatDialogModule,
    MatCheckboxModule,
    MatSidenavModule,
    MatDividerModule,
    CalendarModule
  ],
  providers: [
    { provide: DateAdapter, useFactory: adapterFactory }
  ],
  templateUrl: './business-agendamentos.component.html',
  styleUrls: ['./business-agendamentos.component.css'],
})
export class BusinessAgendamento implements OnInit, OnDestroy {
  readonly baseUrl = '/api';

  // Debug visível (remover depois que estabilizar o clique do Finalizar)
  debugFinalizeCount = 0;
  debugFinalizeLast = '';
  debugAnyClickCount = 0;
  debugAnyLast = '';
  debugIframeCount = 0;
  debugIframeSuppressed = 0;
  debugOverlaySuppressed = 0;
  debugOverlayLast = '';
  debugHeartbeat = 0;

  private removeAnyCaptureListener: (() => void) | null = null;
  private removeScrollClickGuardListener: (() => void) | null = null;
  private removeScrollMoveGuardListener: (() => void) | null = null;
  private overlayIntervalId: any = null;
  private heartbeatIntervalId: any = null;

  private readonly profFotoFalhou = new Set<number>();
  private profFotoCacheToken = Date.now();

  // Bloqueio manual de dia fechado (ex.: feriado, manutenção, etc.)
  // Multi-barbearias: usamos EmpresaId como chave real.
  // O front tenta descobrir automaticamente via /api/Empresa e cacheia no localStorage.
  private empresaId: number = Number(localStorage.getItem('empresa_id') || 0);
  blockedReasonInput: string = '';
  blockedDayChecked = false;
  isSelectedDayBlocked = false;
  blockedDayId: string | null = null;
  blockedDayReason: string | null = null;
  clientes: Clientes[] = [];
  servicos: any[] = [];
  horariosPadrao: string[] = [
    '08:00', '08:30',
    '09:00', '09:30',
    '10:00', '10:30',
    '11:00', '11:30',
    '12:00', '12:30',
    '13:00', '13:30',
    '14:00', '14:30',
    '15:00', '15:30',
    '16:00', '16:30',
    '17:00', '17:30',
    '18:00', '18:30',
    '19:00'
  ];
  profissionais: Profissional[] = [];
  agendamentos: any[] = [];
  horariosDisponiveis: any[] = [];

  // Seleção para ações fora da grade
  selectedAgendamento: any | null = null;
  selectedAgendamentoKey: string = '';

  // Painel lateral de detalhes
  detailsOpen = false;
  // Começa com a data de hoje para garantir abertura do calendário
  selectedDate: Date = new Date();
  selectedProfissional: number | null = null;
  selectedServico: number | null = null;
  filtroProfissional: string = '';
  agendamentosAgrupados: { profissional: Profissional, agendamentos: any[] }[] = [];
  // UI state
  compactMode = true; // inicia compacto para reduzir poluição visual
  showOnlyOccupied = false;
  maxProfessionalsVisible = 5; // limite provisório de exibição
  // Controle de feedback de processamento
  private processingAgendamentos = new Set<string>();
  private cancelandoAgendamentos = new Set<string>();
  private readonly apiHeaders = new HttpHeaders({
    'Accept': 'application/json',
    'Content-Type': 'application/json'
  });

  trackByProfissionalId(_index: number, grupo: { profissional: any }): number {
    return grupo.profissional.id;
  }

  get gridTemplateColumns(): string {
    const cols = this.gruposFiltrados()?.length ?? 0;
    const profCols = Array.from({ length: cols }, () => 'minmax(220px, 1fr)').join(' ');
    return `100px ${profCols || 'minmax(220px, 1fr)'}`;
  }

  get gridMinWidth(): string {
    const cols = Math.max(1, this.gruposFiltrados()?.length ?? 0);
    // 100px coluna horário + cols * 220px largura mínima por profissional
    return `${100 + cols * 220}px`;
  }

  // Drag & Drop helpers
  dropListId(hora: string, profissionalId: number): string {
    return `drop-${profissionalId}-${(hora || '').replace(':', '-')}`;
  }

  get totalSlotsVisiveis(): number {
    const profs = this.gruposFiltrados()?.length ?? 0;
    const horas = this.horariosPadrao?.length ?? 0;
    return profs * horas;
  }

  private normalizarStatus(raw: any): string {
    return String(raw ?? '').trim().toLowerCase();
  }

  countStatus(status: 'pendente' | 'cancelado' | 'finalizado'): number {
    const target = String(status).toLowerCase();
    return (this.agendamentos || []).filter(a => this.normalizarStatus(a?.status ?? a?.Status) === target).length;
  }

  get ocupadosVisiveis(): number {
    // Considera ocupados todos os agendamentos do dia (mesmo cancelados) para consistência de leitura.
    return (this.agendamentos || []).length;
  }

  get disponiveisVisiveis(): number {
    return Math.max(0, this.totalSlotsVisiveis - this.ocupadosVisiveis);
  }

  getProfissionalNomeById(id: any): string {
    const pid = Number(id ?? 0);
    const prof = (this.profissionais || []).find(p => Number((p as any)?.id ?? 0) === pid);
    return prof?.nome || (pid ? `#${pid}` : '-');
  }

  openAgendamentoDetails(ag: any, event?: Event): void {
    try {
      event?.stopPropagation?.();
      (event as any)?.preventDefault?.();
    } catch {}
    if (!ag) return;
    this.setSelectedAgendamento(ag);
    this.detailsOpen = true;
  }

  closeDetails(): void {
    this.detailsOpen = false;
  }

  get allDropListIds(): string[] {
    const profs = this.profissionaisFiltrados();
    const ids: string[] = [];
    for (const h of this.horariosPadrao) {
      for (const p of profs) {
        ids.push(this.dropListId(h, p.id));
      }
    }
    return ids;
  }

  // Impede soltar em alvo ocupado (a menos que seja o mesmo agendamento)
  allowEnter = (drag: CdkDrag, drop: CdkDropList): boolean => {
    try {
      const target = drop.data as { hora: string; profissionalId: number };
      const item = drag.data as any; // { id, horario, ProfissionalId, ... }
      const ocupado = this.getAgendamento(target.hora, target.profissionalId);
      if (!ocupado) return true;
      // Permitir se estiver soltando no mesmo agendamento (sem mudança)
      return ocupado.id === item?.id;
    } catch {
      return true;
    }
  };

  constructor(
    private http: HttpClient,
    private snackBar: MatSnackBar,
    private profissionalService: ProfissionaisService,
    private clientesService: ClientesService,
    private dialog: MatDialog,
    private reminderService: ReminderService,
    private ngZone: NgZone
  ) {}

  private removeFinalizeDocCaptureListener: (() => void) | null = null;
  private lastFinalizeToken = '';
  private removeCancelDocCaptureListener: (() => void) | null = null;
  private lastCancelToken = '';
  private removeSlotDocCaptureListener: (() => void) | null = null;
  private lastSlotClickToken = 0;
  private lastScheduleClickAt = 0;
  private removeSelectDocCaptureListener: (() => void) | null = null;
  private lastSelectToken = '';

  // --- Detecção de scroll em mobile por célula (abordagem com touchend + preventDefault) ---
  // Registra a posição do touchstart em qualquer célula interativa da grade
  private _cellTouchStart: { x: number; y: number } | null = null;
  private readonly TOUCH_SCROLL_THRESHOLD = 25;
  private _isTouchMoving = false;
  // Timestamp do último touchend — usado para bloquear o click sintético gerado pelo browser
  private _lastTouchEndAt = 0;
  // Long press: timer e timestamp do último touchstart para bloquear clicks de touch
  private _pendingLongPress: any = null;
  private _lastTouchStartAt = 0;

  onCellTouchStart(e: TouchEvent): void {
    const t = e.touches[0];
    if (t) this._cellTouchStart = { x: t.clientX, y: t.clientY };
    this._isTouchMoving = false;
  }

  /** Inicia o timer de long press (1.5s). Chame no (touchstart) do elemento. */
  startLongPress(fn: () => void): void {
    this.cancelLongPress();
    this._pendingLongPress = setTimeout(() => {
      this._pendingLongPress = null;
      if (!this._isTouchMoving) {
        try { (navigator as any).vibrate?.(50); } catch {}
        this.ngZone.run(() => fn());
      }
    }, 1500);
  }

  startLongPressAgendamento(agendamento: any): void {
    this.startLongPress(() => this.openAgendamentoDetails(agendamento, undefined));
  }

  startLongPressSlot(hora: string, profissionalId: number): void {
    this.startLongPress(() => this.onAgendamentoClick(hora, profissionalId, true));
  }

  /** Cancela o timer de long press. Chame no (touchend) e ao detectar scroll. */
  cancelLongPress(): void {
    if (this._pendingLongPress !== null) {
      clearTimeout(this._pendingLongPress);
      this._pendingLongPress = null;
    }
  }

  onCellTouchMove(e: TouchEvent): void {
    if (this._isTouchMoving) return;
    const t = e.touches[0];
    if (!t || !this._cellTouchStart) return;
    const dy = Math.abs(t.clientY - this._cellTouchStart.y);
    if (dy > 8) {
      this._isTouchMoving = true;
      // Marca imediatamente para que o guard capture-phase já funcione
      // caso o browser dispare o click antes do touchend
      this._lastTouchEndAt = Date.now();
    }
  }

  /** Retorna true se o dedo se moveu o suficiente para ser considerado scroll */
  private isTouchScroll(e: TouchEvent): boolean {
    if (this._isTouchMoving) return true;
    if (!this._cellTouchStart) return false;
    const t = e.changedTouches[0];
    if (!t) return false;
    const dx = Math.abs(t.clientX - this._cellTouchStart.x);
    const dy = Math.abs(t.clientY - this._cellTouchStart.y);
    return dx > this.TOUCH_SCROLL_THRESHOLD || dy > this.TOUCH_SCROLL_THRESHOLD;
  }

  onSlotCellTouchEnd(e: TouchEvent, hora: string, profissionalId: number): void {
    const scrolled = this.isTouchScroll(e);
    this._cellTouchStart = null;
    this._lastTouchEndAt = Date.now();
    e.preventDefault();
    if (!scrolled) {
      this.onSlotCellSelect(e, hora, profissionalId);
    }
  }

  onAgendamentoCardTouchEnd(e: TouchEvent, agendamento: any): void {
    const scrolled = this.isTouchScroll(e);
    this._cellTouchStart = null;
    this._lastTouchEndAt = Date.now();
    e.preventDefault();
    if (!scrolled) {
      this.openAgendamentoDetails(agendamento, e);
    }
  }

  onSlotDisponnivelTouchEnd(e: TouchEvent, hora: string, profissionalId: number): void {
    const scrolled = this.isTouchScroll(e);
    this._cellTouchStart = null;
    this._lastTouchEndAt = Date.now();
    e.preventDefault();
    if (!scrolled) {
      this.onAgendamentoClick(hora, profissionalId);
    }
  }

  onSlotCellSelect(event: Event, horario: string, profissionalId: number): void {
    // Bloqueia o click sintético gerado pelo browser após um touchend
    if (event instanceof MouseEvent && Date.now() - this._lastTouchEndAt < 600) {
      return;
    }
    try {
      const el = (event?.target as HTMLElement | null);
      // Não interfere em botões dentro da célula
      if (el && (
        el.closest('[data-action="finalizar"]') || el.closest('.finalizar-btn') ||
        el.closest('[data-action="agendar"]') || el.closest('.slot-disponivel') ||
        el.closest('.cancelar-btn')
      )) {
        return;
      }
    } catch {}

    try {
      const ag = this.getAgendamento(horario, profissionalId);
      if (!ag) return;
      this.setSelectedAgendamento(ag);
      this.debugAnyLast = `select:cell id=${this.getAgendamentoIdKey(ag) || '?'} @${new Date().toLocaleTimeString()}`;
    } catch {}
  }

  private findActionElementFromEvent(ev: Event, selector: string): HTMLElement | null {
    try {
      const target = ev.target as HTMLElement | null;

      // Se o evento veio de um overlay (ex.: MatDialog), não tente "achar" elementos por trás.
      // elementsFromPoint retorna a pilha inteira e acabava encontrando botões/slots do grid atrás do dialog.
      if (target?.closest?.('.cdk-overlay-container')) return null;

      if (target?.closest) {
        const direct = target.closest(selector) as HTMLElement | null;
        if (direct) return direct;
      }

      // Se algum overlay/camada captura o clique, o target pode não estar dentro do botão.
      // elementsFromPoint permite localizar o elemento "debaixo" do cursor.
      const anyEv = ev as any;
      const x = typeof anyEv?.clientX === 'number' ? anyEv.clientX : null;
      const y = typeof anyEv?.clientY === 'number' ? anyEv.clientY : null;
      if (x === null || y === null) return null;
      const els = (document as any).elementsFromPoint?.(x, y) as Element[] | undefined;
      if (!els?.length) return null;

      // Se existe um dialog/backdrop na pilha desse ponto, não considere elementos abaixo dele.
      for (const el of els) {
        const h = el as HTMLElement;
        if (h?.classList?.contains('cdk-overlay-backdrop') || h?.closest?.('.mat-mdc-dialog-container, mat-dialog-container')) {
          return null;
        }
      }

      for (const el of els) {
        const h = (el as HTMLElement);
        if (h?.closest) {
          const hit = h.closest(selector) as HTMLElement | null;
          if (hit) return hit;
        }
      }
    } catch {}
    return null;
  }

  private getAgendamentoIdKey(ag: any): string {
    const id = ag?.id ?? ag?.AgendamentoId ?? ag?.agendamentoId ?? ag?.Id;
    return id === null || id === undefined ? '' : String(id);
  }

  isCancelando(ag: any): boolean {
    const key = this.getAgendamentoIdKey(ag);
    return !!key && this.cancelandoAgendamentos.has(key);
  }

  clearSelectedAgendamento(): void {
    this.selectedAgendamento = null;
    this.selectedAgendamentoKey = '';
    this.detailsOpen = false;
  }

  private setSelectedAgendamento(ag: any): void {
    this.selectedAgendamento = ag;
    this.selectedAgendamentoKey = this.getAgendamentoIdKey(ag);
  }

  selectAgendamentoById(rawId: any): void {
    const id = rawId === null || rawId === undefined ? '' : String(rawId);
    if (!id) {
      this.clearSelectedAgendamento();
      return;
    }

    const ag = (this.agendamentos || []).find(a => String(a?.id ?? a?.AgendamentoId ?? a?.agendamentoId ?? a?.Id) === id);
    if (!ag) {
      // mantém a key para refletir no select, mas sinaliza que não achou
      this.selectedAgendamento = null;
      this.selectedAgendamentoKey = id;
      try {
        this.snackBar.open('Agendamento não encontrado na lista carregada.', 'Fechar', { duration: 1500 });
      } catch {}
      return;
    }

    this.setSelectedAgendamento(ag);
    try {
      const nome = ag?.cliente || ag?.Cliente || 'Agendamento';
      this.snackBar.open(`Selecionado: ${nome}`, 'Fechar', { duration: 1200 });
    } catch {}
  }

  isAgendamentoSelected(ag: any): boolean {
    const key = this.getAgendamentoIdKey(ag);
    return !!key && key === this.selectedAgendamentoKey;
  }

  ngOnInit(): void {
    // Inicialização

    // Debug global: confirma que QUALQUER clique/pointerdown está chegando.
    // Se isso não incrementar, você não está na instância certa ou há um overlay/iframe.
    if (!this.removeAnyCaptureListener) {
      const anyHandler = (ev: Event) => {
        try {
          this.debugAnyClickCount++;
          const anyEv = ev as any;
          const x = typeof anyEv?.clientX === 'number' ? anyEv.clientX : null;
          const y = typeof anyEv?.clientY === 'number' ? anyEv.clientY : null;
          let topDesc = '';
          try {
            if (x !== null && y !== null && (document as any).elementsFromPoint) {
              const els = (document as any).elementsFromPoint(x, y) as Element[];
              const top = els?.[0] as HTMLElement | undefined;

              if (top) {
                const cls = (top.className && typeof top.className === 'string') ? `.${top.className.split(' ').filter(Boolean).slice(0, 2).join('.')}` : '';
                topDesc = `${top.tagName.toLowerCase()}${cls}`;
              }
            }
          } catch {}
          this.debugAnyLast = `any:${String((ev as any)?.type || 'event')} ${topDesc} @${new Date().toLocaleTimeString()}`;
        } catch {}
      };
      window.addEventListener('pointerdown', anyHandler, true);
      window.addEventListener('click', anyHandler, true);
      window.addEventListener('mousedown', anyHandler, true);
      window.addEventListener('touchstart', anyHandler, true);

      document.addEventListener('pointerdown', anyHandler, true);
      document.addEventListener('click', anyHandler, true);
      document.addEventListener('mousedown', anyHandler, true);
      document.addEventListener('touchstart', anyHandler, true);
      this.removeAnyCaptureListener = () => {
        window.removeEventListener('pointerdown', anyHandler, true);
        window.removeEventListener('click', anyHandler, true);
        window.removeEventListener('mousedown', anyHandler, true);
        window.removeEventListener('touchstart', anyHandler, true);

        document.removeEventListener('pointerdown', anyHandler, true);
        document.removeEventListener('click', anyHandler, true);
        document.removeEventListener('mousedown', anyHandler, true);
        document.removeEventListener('touchstart', anyHandler, true);
      };
    }

    // Guard nativo (capture phase) que bloqueia o click sintético gerado pelo browser
    // após um touchend — evita que scroll seja interpretado como tap na grade.
    if (!this.removeScrollClickGuardListener) {
      const scrollClickGuard = (ev: Event) => {
        if (!(ev instanceof MouseEvent)) return;
        if (Date.now() - this._lastTouchEndAt < 600) {
          ev.stopImmediatePropagation();
          ev.preventDefault();
        }
      };
      document.addEventListener('click', scrollClickGuard, true);
      this.removeScrollClickGuardListener = () => {
        document.removeEventListener('click', scrollClickGuard, true);
      };
    }

    // Listener global de touchmove no document (capture, passivo).
    // Detecta scroll vertical independente de qual elemento recebeu o touch —
    // necessário porque o container .agenda-scroll absorve touchmove nativamente
    // e o listener do elemento filho pode nunca disparar.
    if (!this.removeScrollMoveGuardListener) {
      let _globalTouchStartY = 0;
      let _globalTouchStartX = 0;

      const globalTouchStartHandler = (ev: TouchEvent) => {
        const t = ev.touches[0];
        if (t) { _globalTouchStartY = t.clientY; _globalTouchStartX = t.clientX; }
        // Reseta o flag de scroll junto com o touchstart
        this._isTouchMoving = false;
        // Registra o momento do toque para bloquear clicks sintéticos de touch
        this._lastTouchStartAt = Date.now();
      };

      const globalTouchMoveHandler = (ev: TouchEvent) => {
        if (this._isTouchMoving) return;
        const t = ev.touches[0];
        if (!t) return;
        const dx = Math.abs(t.clientX - _globalTouchStartX);
        const dy = Math.abs(t.clientY - _globalTouchStartY);
        if (dx > 10 || dy > 10) {
          this._isTouchMoving = true;
          this._lastTouchEndAt = Date.now();
          this.cancelLongPress(); // scroll detectado: cancela long press
        }
      };

      const globalTouchEndHandler = () => {
        this.cancelLongPress(); // dedo levantou antes de 1.5s: cancela
        if (this._isTouchMoving) {
          this._lastTouchEndAt = Date.now();
        }
      };

      document.addEventListener('touchstart', globalTouchStartHandler, { passive: true, capture: true });
      document.addEventListener('touchmove', globalTouchMoveHandler, { passive: true, capture: true });
      document.addEventListener('touchend', globalTouchEndHandler, { passive: true, capture: true });

      this.removeScrollMoveGuardListener = () => {
        document.removeEventListener('touchstart', globalTouchStartHandler, true);
        document.removeEventListener('touchmove', globalTouchMoveHandler, true);
        document.removeEventListener('touchend', globalTouchEndHandler, true);
      };
    }

    // Já inicia com a data atual para facilitar a pesquisa
    this.selectedDate = new Date();
    this.loadProfissionais();
    this.loadClientes();
    this.loadServicos();
    // Carregar agendamentos do dia automaticamente
    this.pesquisarPorData();
    this.initEmpresaIdAndBlockedStatus();

    // Fallback: caso o (click) do template não dispare em produção por algum motivo,
    // capturamos o clique no document e acionamos o finalizar sem bloquear a UI.
    this.installFinalizeCaptureFallback();

    // Fallback similar para o botão "Cancelar"
    this.installCancelCaptureFallback();

    // Fallback similar para o slot "Disponível" (agendar)
    this.installSlotClickCaptureFallback();

    // Fallback para seleção de agendamento (quando o click no card não dispara)
    this.installAgendamentoSelectCaptureFallback();

    // Mitigação: alguns ambientes/extensões injetam iframes transparentes por cima da página.
    // Cliques dentro desses iframes NÃO chegam no window do app, então tudo parece "morto".
    // Como esta tela não depende de iframe, neutralizamos (pointer-events: none) os iframes visíveis.
    if (!this.overlayIntervalId) {
      const isBgTransparentish = (bg: string): boolean => {
        try {
          const s = String(bg || '').trim().toLowerCase();
          if (!s) return false;
          if (s === 'transparent' || s === 'rgba(0, 0, 0, 0)' || s === 'rgba(0,0,0,0)') return true;
          const m = s.match(/^rgba\((\d+),\s*(\d+),\s*(\d+),\s*([0-9.]+)\)$/);
          if (m) {
            const a = Number(m[4]);
            return Number.isFinite(a) && a <= 0.08;
          }
        } catch {}
        return false;
      };

      this.overlayIntervalId = setInterval(() => {
        try {
          // Nesta tela, não dependemos de iframe/embed/object: neutraliza todos.
          const frames = Array.from(document.querySelectorAll('iframe, embed, object')) as any[];
          this.debugIframeCount = frames.length;
          let suppressed = 0;
          const vw = window.innerWidth || 1;
          const vh = window.innerHeight || 1;

          for (const frame of frames) {
            try {
              const style = window.getComputedStyle(frame);
              if (style.pointerEvents !== 'none') {
                frame.style.pointerEvents = 'none';
                suppressed++;
              }
            } catch {}
          }

          if (suppressed > 0) {
            this.debugIframeSuppressed += suppressed;
            console.warn('[Agendamentos] iframe overlay detectado e neutralizado. suppressed=', suppressed);
          }

          // Mitigação adicional: overlays transparentes (DIV/IMG/etc) por cima da página.
          // Se um elemento grande e transparente estiver no topo e NÃO pertencer ao app,
          // desativamos pointer-events para recuperar os cliques.
          try {
            const points: Array<[number, number]> = [
              [Math.floor(vw * 0.5), Math.floor(vh * 0.25)],
              [Math.floor(vw * 0.5), Math.floor(vh * 0.55)],
              [Math.floor(vw * 0.2), Math.floor(vh * 0.5)],
              [Math.floor(vw * 0.8), Math.floor(vh * 0.5)],
            ];

            for (const [x, y] of points) {
              const els = (document as any).elementsFromPoint?.(x, y) as Element[] | undefined;
              const top = els?.[0] as HTMLElement | undefined;
              if (!top) continue;

              // Ignora overlays legítimos do Angular Material
              if (top.closest?.('.cdk-overlay-container, .mat-mdc-tooltip, .mat-mdc-snack-bar-container')) continue;

              const rect = top.getBoundingClientRect?.();
              if (!rect) continue;
              const area = Math.max(0, rect.width) * Math.max(0, rect.height);
              const viewportArea = vw * vh;
              const ratio = viewportArea ? area / viewportArea : 0;
              if (ratio < 0.25) continue;

              const style = window.getComputedStyle(top);
              const position = style.position;
              if (position !== 'fixed' && position !== 'absolute') continue;
              if (style.pointerEvents === 'none') continue;
              if (style.display === 'none' || style.visibility === 'hidden') continue;

              const z = Number.parseInt(style.zIndex || '0', 10);

              const opacity = Number(style.opacity || '1');
              const bg = style.backgroundColor || '';
              const looksTransparent = opacity < 0.25 || isBgTransparentish(bg);
              if (!looksTransparent) continue;

              // Ajuda a evitar falsos positivos em elementos comuns
              const tag = (top.tagName || '').toLowerCase();
              if (tag === 'td' || tag === 'tr' || tag === 'table') continue;

              // Overlays problemáticos costumam ter z-index alto
              if (Number.isFinite(z) && z > 0 && z < 100) continue;

              top.style.pointerEvents = 'none';
              this.debugOverlaySuppressed++;
              const cls = (top.className && typeof top.className === 'string') ? `.${top.className.split(' ').filter(Boolean).slice(0, 2).join('.')}` : '';
              this.debugOverlayLast = `overlay:${tag}${cls} z=${Number.isFinite(z) ? z : '?'} sup @${new Date().toLocaleTimeString()}`;
              console.warn('[Agendamentos] overlay (non-iframe) detectado e neutralizado:', top);
              break;
            }
          } catch {}
        } catch {}
      }, 600);
    }

    // Heartbeat: confirma que o bundle está vivo/atualizando na tela
    if (!this.heartbeatIntervalId) {
      this.heartbeatIntervalId = setInterval(() => {
        try {
          this.debugHeartbeat++;
        } catch {}
      }, 1000);
    }
  }

  ngOnDestroy(): void {
    try {
      this.removeFinalizeDocCaptureListener?.();
    } catch {}
    this.removeFinalizeDocCaptureListener = null;

    try {
      this.removeCancelDocCaptureListener?.();
    } catch {}
    this.removeCancelDocCaptureListener = null;

    try {
      this.removeSlotDocCaptureListener?.();
    } catch {}
    this.removeSlotDocCaptureListener = null;

    try {
      this.removeAnyCaptureListener?.();
    } catch {}
    this.removeAnyCaptureListener = null;

    try {
      this.removeScrollClickGuardListener?.();
    } catch {}
    this.removeScrollClickGuardListener = null;

    this.cancelLongPress();

    try {
      this.removeScrollMoveGuardListener?.();
    } catch {}
    this.removeScrollMoveGuardListener = null;

    try {
      this.removeSelectDocCaptureListener?.();
    } catch {}
    this.removeSelectDocCaptureListener = null;

    try {
      if (this.overlayIntervalId) {
        clearInterval(this.overlayIntervalId);
      }
    } catch {}
    this.overlayIntervalId = null;

    try {
      if (this.heartbeatIntervalId) {
        clearInterval(this.heartbeatIntervalId);
      }
    } catch {}
    this.heartbeatIntervalId = null;
  }

  onAgendamentoSelect(agendamento: any, event?: Event): void {
    try {
      event?.stopPropagation?.();
      (event as any)?.preventDefault?.();
    } catch {}
    try {
      if (agendamento) this.setSelectedAgendamento(agendamento);
    } catch {}
  }

  private installAgendamentoSelectCaptureFallback(): void {
    if (this.removeSelectDocCaptureListener) return;
    try {
      const handler = (ev: Event) => {
        try {
          // Ignora se o usuário estava scrollando
          if (this._isTouchMoving) return;
          if (Date.now() - this._lastTouchEndAt < 600) return;

          const now = Date.now();

          // Se o clique foi em ações (finalizar/cancelar/agendar), não abrir detalhes aqui.
          const isActionClick = !!(
            this.findActionElementFromEvent(ev, '[data-action="finalizar"]') ||
            this.findActionElementFromEvent(ev, '[data-action="cancelar"]') ||
            this.findActionElementFromEvent(ev, '[data-action="agendar"]')
          );
          // 1) Tenta selecionar pelo card
          const card = this.findActionElementFromEvent(ev, '[data-action="select-agendamento"]');
          let rawId = card?.getAttribute('data-agendamento-id') || '';

          // 2) Se não achar card (hit-test estranho), tenta mapear pela célula (hora+prof)
          if (!rawId) {
            const cell = this.findActionElementFromEvent(ev, '.slot-cell');
            const hora = cell?.getAttribute('data-hora') || '';
            const profRaw = cell?.getAttribute('data-profissional-id') || '';
            const profissionalId = Number(profRaw);
            if (hora && Number.isFinite(profissionalId)) {
              const ag2 = this.getAgendamento(hora, profissionalId);
              const id2 = this.getAgendamentoIdKey(ag2);
              if (id2) rawId = id2;
            }
          }

          if (!rawId) return;

          // Dedupe rápido (pointerdown + click)
          const token = `${rawId}|${now}`;
          if (this.lastSelectToken && this.lastSelectToken.startsWith(`${rawId}|`)) {
            const lastTs = Number(this.lastSelectToken.split('|')[1] || 0);
            if (Number.isFinite(lastTs) && now - lastTs < 400) return;
          }
          this.lastSelectToken = token;

          const ag = (this.agendamentos || []).find(a => String(a?.id ?? a?.AgendamentoId ?? a?.agendamentoId ?? a?.Id) === String(rawId))
            || { id: Number(rawId) || rawId, cliente: 'Agendamento' };

          this.ngZone.run(() => {
            try {
              this.setSelectedAgendamento(ag);
              if (!isActionClick) {
                this.detailsOpen = true;
              }
              // pequena marca pra confirmar visualmente
              this.debugAnyLast = `select:capture id=${rawId} @${new Date().toLocaleTimeString()}`;
            } catch {}
          });
        } catch {}
      };

      window.addEventListener('click', handler, true);
      document.addEventListener('click', handler, true);
      this.removeSelectDocCaptureListener = () => {
        window.removeEventListener('click', handler, true);
        document.removeEventListener('click', handler, true);
      };
    } catch {
      // ignore
    }
  }

  private installSlotClickCaptureFallback(): void {
    if (this.removeSlotDocCaptureListener) return;
    try {
      const handler = (ev: Event) => {
        try {
          // Ignora se o usuário estava scrollando
          if (this._isTouchMoving) return;
          if (Date.now() - this._lastTouchEndAt < 600) return;

          const btn = this.findActionElementFromEvent(ev, '[data-action="agendar"]');
          if (!btn) return;

          const hora = btn.getAttribute('data-hora') || '';
          const profRaw = btn.getAttribute('data-profissional-id') || '';
          const profissionalId = Number(profRaw);
          if (!hora || !Number.isFinite(profissionalId)) return;

          // Evita abrir duas vezes: agenda para o próximo tick e só abre
          // se o Angular não tiver aberto um dialog.
          const token = Date.now();
          this.lastSlotClickToken = token;
          setTimeout(() => {
            try {
              if (this.lastSlotClickToken !== token) return;
              // Importante: o handler global roda fora do Angular; reentrar no NgZone
              // para garantir detecção de mudanças e Material overlays/snackbar.
              this.ngZone.run(() => {
                console.debug('[Agendar fallback] clique capturado para', { hora, profissionalId });
                this.onAgendamentoClick(hora, profissionalId);
              });
            } catch {}
          }, 0);
        } catch {}
      };

      // Window capture roda antes do document e sobrevive a stopPropagation no document.
      window.addEventListener('pointerdown', handler, true);
      window.addEventListener('click', handler, true);
      document.addEventListener('pointerdown', handler, true);
      document.addEventListener('click', handler, true);
      this.removeSlotDocCaptureListener = () => {
        window.removeEventListener('pointerdown', handler, true);
        window.removeEventListener('click', handler, true);
        document.removeEventListener('pointerdown', handler, true);
        document.removeEventListener('click', handler, true);
      };
    } catch {
      // ignore
    }
  }

  private installFinalizeCaptureFallback(): void {
    if (this.removeFinalizeDocCaptureListener) return;
    try {
      const handler = (ev: Event) => {
        try {
          // Pointerdown + click podem disparar; dedupe por target+time.
          const now = Date.now();
          const btn = this.findActionElementFromEvent(ev, '[data-action="finalizar"]');
          if (!btn) return;

          const token = `${btn.getAttribute('data-agendamento-id') || ''}|${now}`;
          // janela curta de dedupe
          if (this.lastFinalizeToken && token.slice(0, token.indexOf('|')) && this.lastFinalizeToken.startsWith(token.slice(0, token.indexOf('|')))) {
            const lastTs = Number(this.lastFinalizeToken.split('|')[1] || 0);
            if (Number.isFinite(lastTs) && now - lastTs < 400) return;
          }
          this.lastFinalizeToken = token;

          const rawId = btn.getAttribute('data-agendamento-id');
          if (!rawId) {
            console.log('[Finalizar] clique capturado, sem id no DOM');
            return;
          }

          // Evita disparos duplicados
          if (this.processingAgendamentos.has(String(rawId))) return;

          const ag = (this.agendamentos || []).find(a => String(a?.id ?? a?.AgendamentoId ?? a?.agendamentoId ?? a?.Id) === String(rawId))
            || { id: Number(rawId) || rawId };
          // Importante: handler global roda fora do Angular. Reentrar no NgZone.
          this.ngZone.run(() => {
            this.debugFinalizeCount++;
            this.debugFinalizeLast = `capture:${String((ev as any)?.type || 'event')} id=${rawId} @${new Date().toLocaleTimeString()}`;
            console.log('[Finalizar] clique capturado (capture). id=', rawId, 'eventType=', (ev as any)?.type);
            this.onFinalizarAgendamento(ag);
          });
        } catch {}
      };

      // Alguns ambientes/extensões/overlays suprimem o click; pointerdown é mais confiável.
      window.addEventListener('pointerdown', handler, true);
      window.addEventListener('click', handler, true);
      document.addEventListener('pointerdown', handler, true);
      document.addEventListener('click', handler, true);
      this.removeFinalizeDocCaptureListener = () => {
        window.removeEventListener('pointerdown', handler, true);
        window.removeEventListener('click', handler, true);
        document.removeEventListener('pointerdown', handler, true);
        document.removeEventListener('click', handler, true);
      };
    } catch {
      // ignore
    }
  }

  private installCancelCaptureFallback(): void {
    if (this.removeCancelDocCaptureListener) return;
    try {
      const handler = (ev: Event) => {
        try {
          const now = Date.now();
          const btn = this.findActionElementFromEvent(ev, '[data-action="cancelar"]');
          if (!btn) return;

          const rawId = btn.getAttribute('data-agendamento-id');
          if (!rawId) return;

          const token = `${rawId}|${now}`;
          if (this.lastCancelToken && this.lastCancelToken.startsWith(`${rawId}|`)) {
            const lastTs = Number(this.lastCancelToken.split('|')[1] || 0);
            if (Number.isFinite(lastTs) && now - lastTs < 400) return;
          }
          this.lastCancelToken = token;

          const ag = (this.agendamentos || []).find(a => String(a?.id ?? a?.AgendamentoId ?? a?.agendamentoId ?? a?.Id) === String(rawId))
            || { id: Number(rawId) || rawId };

          this.ngZone.run(() => {
            this.onCancelarAgendamento(ag, ev);
          });
        } catch {}
      };

      window.addEventListener('pointerdown', handler, true);
      window.addEventListener('click', handler, true);
      document.addEventListener('pointerdown', handler, true);
      document.addEventListener('click', handler, true);
      this.removeCancelDocCaptureListener = () => {
        window.removeEventListener('pointerdown', handler, true);
        window.removeEventListener('click', handler, true);
        document.removeEventListener('pointerdown', handler, true);
        document.removeEventListener('click', handler, true);
      };
    } catch {
      // ignore
    }
  }



  private initEmpresaIdAndBlockedStatus(): void {
    // Se já temos EmpresaId em cache, segue.
    if (this.empresaId && this.empresaId > 0) {
      this.loadBlockedDayStatus();
      return;
    }

    // Tenta descobrir a empresa pelo endpoint padrão.
    // Observação: o backend do usuário pode retornar array, objeto único ou ApiResponse { success, data }.
    this.http
      .get<any>(`${this.baseUrl}/Empresa`, { headers: this.apiHeaders, responseType: 'json' })
      .subscribe({
        next: (resp) => {
          const rawList = Array.isArray(resp)
            ? resp
            : Array.isArray(resp?.data)
              ? resp.data
              : Array.isArray(resp?.Data)
                ? resp.Data
                : resp?.data
                  ? [resp.data]
                  : resp?.Data
                    ? [resp.Data]
                    : resp
                      ? [resp]
                      : [];

          const first = rawList?.[0] ?? null;
          const id = Number(first?.empresaId ?? first?.EmpresaId ?? first?.id ?? first?.Id ?? 0);
          if (Number.isFinite(id) && id > 0) {
            this.empresaId = id;
            localStorage.setItem('empresa_id', String(this.empresaId));
            this.loadBlockedDayStatus();
            return;
          }

          // Não existe empresa cadastrada (ou formato inesperado): não chute "1".
          this.empresaId = 0;
          localStorage.removeItem('empresa_id');
          this.blockedDayChecked = false;
          this.isSelectedDayBlocked = false;
          this.blockedDayId = null;
          this.blockedDayReason = null;
          this.mostrarErro('Nenhuma empresa cadastrada. Cadastre uma empresa para usar o bloqueio de dia.');
        },
        error: () => {
          // Não chute EmpresaId. Sem empresa válida, o backend pode falhar (FK) e gerar 500.
          this.empresaId = 0;
          localStorage.removeItem('empresa_id');
          this.blockedDayChecked = false;
          this.isSelectedDayBlocked = false;
          this.blockedDayId = null;
          this.blockedDayReason = null;
          this.mostrarErro('Não foi possível identificar a empresa. Verifique se existe uma empresa cadastrada.');
        },
      });
  }

  loadBlockedDayStatus(): void {
    try {
      if (!this.empresaId || this.empresaId <= 0) {
        this.blockedDayChecked = false;
        this.isSelectedDayBlocked = false;
        this.blockedDayId = null;
        this.blockedDayReason = null;
        return;
      }
      const date = this.formatarDataParaAPI(this.selectedDate);
      const slug = encodeURIComponent(String(this.empresaId || 1));
      this.blockedDayChecked = false;
      this.http
        .get<any>(`${this.baseUrl}/shops/${slug}/blocked-days/check?date=${encodeURIComponent(date)}`, {
          headers: this.apiHeaders,
          responseType: 'json',
        })
        .subscribe({
          next: (resp) => {
            this.blockedDayChecked = true;
            this.isSelectedDayBlocked = !!resp?.blocked;
            this.blockedDayId = (resp?.blockedDay?.id ?? resp?.blockedDay?.Id ?? resp?.blockedDay?.diaBloqueadoId ?? resp?.blockedDay?.DiaBloqueadoId ?? null)?.toString?.() ?? null;
            this.blockedDayReason = resp?.blockedDay?.reason ?? resp?.blockedDay?.Reason ?? resp?.blockedDay?.motivo ?? resp?.blockedDay?.Motivo ?? null;
          },
          error: (err) => {
            this.blockedDayChecked = false;
            // não bloquear a agenda se falhar; só avisa
            this.handleApiError(err, 'Erro ao verificar dia bloqueado');
          },
        });
    } catch {
      // ignore
    }
  }

  bloquearDiaSelecionado(): void {
    if (!this.empresaId || this.empresaId <= 0) {
      this.mostrarErro('Cadastre uma empresa antes de bloquear um dia.');
      return;
    }
    const date = this.formatarDataParaAPI(this.selectedDate);
    const slug = encodeURIComponent(String(this.empresaId || 1));
    const reason = (this.blockedReasonInput || '').trim() || null;
    // Enviar exatamente o DTO esperado pelo endpoint (igual ao Swagger)
    const payload: any = { date, reason };

    this.http
      .post<any>(`${this.baseUrl}/shops/${slug}/blocked-days`, payload, { headers: this.apiHeaders })
      .subscribe({
        next: (resp) => {
          this.snackBar.open('Dia bloqueado com sucesso.', 'Fechar', { duration: 3000 });
          this.isSelectedDayBlocked = true;
          this.blockedDayId = resp?.id ?? null;
          this.blockedDayReason = resp?.reason ?? null;
          this.loadBlockedDayStatus();
        },
        error: (err) => this.handleApiError(err, 'Erro ao bloquear o dia'),
      });
  }

  desbloquearDiaSelecionado(): void {
    if (!this.empresaId || this.empresaId <= 0) {
      this.mostrarErro('Cadastre uma empresa antes de desbloquear um dia.');
      return;
    }
    const slug = encodeURIComponent(String(this.empresaId || 1));
    const id = this.blockedDayId;
    if (!id) {
      this.mostrarErro('Não foi possível identificar o bloqueio deste dia.');
      return;
    }

    this.http
      .delete<any>(`${this.baseUrl}/shops/${slug}/blocked-days/${encodeURIComponent(id)}`, { headers: this.apiHeaders })
      .subscribe({
        next: () => {
          this.snackBar.open('Dia desbloqueado.', 'Fechar', { duration: 3000 });
          this.isSelectedDayBlocked = false;
          this.blockedDayId = null;
          this.blockedDayReason = null;
          this.loadBlockedDayStatus();
        },
        error: (err) => this.handleApiError(err, 'Erro ao desbloquear o dia'),
      });
  }

  loadClientes(): void {
    this.clientesService.getClientes().subscribe({
      next: (data: Clientes[]) => {
        this.clientes = data;
        if (this.agendamentos.length > 0) {
          this.agendamentos = this.agendamentos.map(ag => {
            const clienteObj = this.clientes.find(c => c.ClienteId === (ag.ClienteId ?? ag.clienteId));
            let nomeCliente = '';
            if (clienteObj) {
              nomeCliente = clienteObj.Nome || '';
            }
            if (!nomeCliente) {
              nomeCliente = 'Cliente #' + (ag.ClienteId ?? ag.clienteId ?? '?');
            }
            return { ...ag, cliente: nomeCliente };
          });
        }
      },
      error: (err) => this.mostrarErro('Erro ao carregar clientes: ' + (err.message || ''))
    });
  }

  loadServicos(): void {
    this.http.get<any[]>(`${this.baseUrl}/Servicos`, { headers: this.apiHeaders }).subscribe({
      next: (data) => {
        // normaliza para conter NomeServico e servicoId
        this.servicos = (data || []).map(s => ({
          ...s,
          NomeServico: s.NomeServico ?? s.nomeServico ?? s.Nome ?? s.nome,
          servicoId: s.servicoId ?? s.ServicoId ?? s.id ?? s.Id ?? s.ServicoID ?? s.servicoID,
          // garantir preço para cálculo de venda
          preco: s.preco ?? s.Preco ?? s.precoVenda ?? s.PrecoVenda ?? s.valor ?? s.Valor ?? 0
        }));
      },
      error: () => { /* silencioso, não bloqueia UI */ }
    });
  }

  loadProfissionais(): void {
    this.profissionalService.getProfissionais().subscribe({
      next: (data: Profissional[]) => {
        this.profissionais = data;

        // Evita cache após uploads/atualizações recentes.
        this.profFotoCacheToken = Date.now();
        this.profFotoFalhou.clear();

        if (!data.length) {
          this.mostrarErro('Nenhum profissional encontrado');
        }
        // Após carregar profissionais pela primeira vez, garantir uma pesquisa
        // Isso evita telas vazias por ordem de carregamento/offset
        if (!this.agendamentos || this.agendamentos.length === 0) {
          this.pesquisarPorData();
        }
      },
      error: (err) => this.mostrarErro(err.message || 'Falha ao carregar profissionais')
    });
  }

  getInitial(nome?: string): string {
    const text = (nome ?? '').trim();
    return (text ? text.charAt(0) : '?').toUpperCase();
  }

  profFotoDisponivel(p: Profissional): boolean {
    const id = Number((p as any)?.id ?? 0);
    const url = ((p as any)?.fotoUrl ?? '').toString().trim();
    if (!url) return false;
    if (!id) return true;
    return !this.profFotoFalhou.has(id);
  }

  getProfFotoSrc(rawUrl?: string | null): string {
    const url = (rawUrl ?? '').toString().trim();
    if (!url) return '';
    const normalized = /^https?:\/\//i.test(url)
      ? url
      : url.startsWith('/')
        ? url
        : `/${url}`;
    const join = normalized.includes('?') ? '&' : '?';
    return `${normalized}${join}v=${this.profFotoCacheToken}`;
  }

  onProfFotoError(profissionalId: number): void {
    const id = Number(profissionalId ?? 0);
    if (id) this.profFotoFalhou.add(id);
  }

  profissionaisFiltrados(): Profissional[] {
    const filtro = this.filtroProfissional?.toLowerCase() || '';
    const lista = this.profissionais.filter(p => p.nome?.toLowerCase().includes(filtro));
    // Exibir somente os primeiros N profissionais (teste: 5)
    return lista.slice(0, this.maxProfessionalsVisible);
  }
    gruposFiltrados(): { profissional: Profissional; agendamentos: any[] }[] {
    const termo = (this.filtroProfissional || '').toLowerCase().trim();

    // Sempre derive as colunas a partir da lista de profissionais
    const profs = this.profissionaisFiltrados();
    const grupos = profs.map(p => ({
      profissional: p,
      agendamentos: (this.agendamentos || []).filter(a => Number(a?.ProfissionalId ?? a?.profissionalId ?? 0) === Number(p.id))
    }));

    if (!termo) {
      return grupos;
    }

    return grupos.filter((grupo) =>
      grupo.profissional?.nome?.toLowerCase().includes(termo)
    );
  }

  pesquisarPorData(): void {
    if (!this.selectedDate) {
      this.mostrarErro('Selecione uma data válida');
      return;
    }
    const dataFormatada = this.formatarDataParaAPI(this.selectedDate);
    let url = `${this.baseUrl}/Agendamentos?data=${dataFormatada}`;
    if (this.selectedProfissional) {
      url += `&profissionalId=${this.selectedProfissional}`;
    }
    this.http.get<any>(url, {
      headers: this.apiHeaders,
      responseType: 'json'
    }).subscribe({
      next: (response) => {
        if (this.isHtmlResponse(response)) {
          this.handleApiError(new HttpErrorResponse({
            error: response,
            status: 200,
            statusText: 'OK'
          }), 'Configuração incorreta do servidor');
          return;
        }
        if (Array.isArray(response)) {
          const list = (response as any[]).filter(ag => this.isAgendamentoDoDia(ag, dataFormatada));
          this.agendamentos = list.map(ag => {
            const clienteId = ag['ClienteId'] ?? ag['clienteId'];
            const servicoId = ag['ServicoId'] ?? ag['servicoId'];
            const profissionalId = Number(ag['ProfissionalId'] ?? ag['profissionalId'] ?? 0);
            const dataHoraRaw = ag['DataHora'] ?? ag['dataHora'] ?? ag['Horario'] ?? ag['horario'] ?? ag['data_hora'] ?? '';
            const clienteObj = this.clientes.find(c => c.ClienteId === clienteId);
            let nomeCliente = clienteObj?.Nome || ('Cliente #' + (clienteId ?? '?'));
            return {
              id: ag['Id'] ?? ag['AgendamentoId'] ?? ag['id'] ?? ag['agendamentoId'],
              horario: this.normalizarHoraHHmm(String(dataHoraRaw ?? '')),
              ProfissionalId: profissionalId,
              ClienteId: clienteId,
              ServicoId: servicoId,
              servicoId: servicoId,
              cliente: nomeCliente,
              servico: ag['Servico'] ?? ag['servico'] ?? ag['nomeServico'] ?? ag['NomeServico'] ?? '',
              status: (ag['Status'] ?? ag['status'] ?? 'Pendente')
            };
          });
          this.agruparPorProfissional(this.agendamentos);
          if (this.selectedProfissional && this.selectedServico) {
            this.buscarHorariosDisponiveis(this.selectedServico);
          }
        } else if (response?.success && Array.isArray(response.data)) {
          const list = (response.data as any[]).filter((ag: any) => this.isAgendamentoDoDia(ag, dataFormatada));
          this.agendamentos = list.map(ag => {
            const clienteId = ag['ClienteId'] ?? ag['clienteId'];
            const servicoId = ag['ServicoId'] ?? ag['servicoId'];
            const profissionalId = Number(ag['ProfissionalId'] ?? ag['profissionalId'] ?? 0);
            const dataHoraRaw = ag['DataHora'] ?? ag['dataHora'] ?? ag['Horario'] ?? ag['horario'] ?? ag['data_hora'] ?? '';
            const clienteObj = this.clientes.find(c => c.ClienteId === clienteId);
            let nomeCliente = '';
            if (clienteObj) {
              nomeCliente = clienteObj.Nome || '';
            }
            if (!nomeCliente) {
              nomeCliente = 'Cliente #' + (clienteId ?? '?');
            }
            return {
              id: ag['Id'] ?? ag['AgendamentoId'] ?? ag['id'] ?? ag['agendamentoId'],
              horario: this.normalizarHoraHHmm(String(dataHoraRaw ?? '')),
              ProfissionalId: profissionalId,
              ClienteId: clienteId,
              ServicoId: servicoId,
              servicoId: servicoId,
              cliente: nomeCliente,
              servico: ag['Servico'] ?? ag['servico'] ?? ag['nomeServico'] ?? ag['NomeServico'] ?? '',
              status: (ag['Status'] ?? ag['status'] ?? 'Pendente')
            };
          });
          this.agruparPorProfissional(this.agendamentos);
          if (this.selectedProfissional && this.selectedServico) {
            this.buscarHorariosDisponiveis(this.selectedServico);
          }
        } else if (response?.Success && Array.isArray(response?.Data)) {
          // Suporte ao formato com "Success"/"Data" em maiúsculas
          const list = (response.Data as any[]).filter((ag: any) => this.isAgendamentoDoDia(ag, dataFormatada));
          this.agendamentos = list.map(ag => {
            const clienteId = ag['ClienteId'] ?? ag['clienteId'];
            const servicoId = ag['ServicoId'] ?? ag['servicoId'];
            const profissionalId = Number(ag['ProfissionalId'] ?? ag['profissionalId'] ?? 0);
            const dataHoraRaw = ag['DataHora'] ?? ag['dataHora'] ?? ag['Horario'] ?? ag['horario'] ?? ag['data_hora'] ?? '';
            const clienteObj = this.clientes.find(c => c.ClienteId === clienteId);
            let nomeCliente = clienteObj?.Nome || ('Cliente #' + (clienteId ?? '?'));
            return {
              id: ag['Id'] ?? ag['AgendamentoId'] ?? ag['id'] ?? ag['agendamentoId'],
              horario: this.normalizarHoraHHmm(String(dataHoraRaw ?? '')),
              ProfissionalId: profissionalId,
              ClienteId: clienteId,
              ServicoId: servicoId,
              servicoId: servicoId,
              cliente: nomeCliente,
              servico: ag['Servico'] ?? ag['servico'] ?? ag['nomeServico'] ?? ag['NomeServico'] ?? '',
              status: (ag['Status'] ?? ag['status'] ?? 'Pendente')
            };
          });
          this.agruparPorProfissional(this.agendamentos);
          if (this.selectedProfissional && this.selectedServico) {
            this.buscarHorariosDisponiveis(this.selectedServico);
          }
        } else {
          this.agendamentos = [];
          this.agendamentosAgrupados = [];
          this.mostrarErro(response?.message || 'Nenhum agendamento encontrado');
        }
      },
      error: (err) => this.handleApiError(err, 'Erro ao buscar agendamentos')
    });
  }

  isHorarioOcupado(horario: string, profissionalId: number): boolean {
    return this.agendamentos.some(ag => {
      const agHora = this.normalizarHoraHHmm(ag?.horario ?? ag?.DataHora ?? '');
      const agProfId = Number(ag?.ProfissionalId ?? ag?.profissionalId ?? 0);
      return agHora === horario && agProfId === Number(profissionalId);
    });
  }

  buscarHorariosDisponiveis(servicoId: number): void {
    if (!this.selectedProfissional) {
      this.mostrarErro('Selecione um profissional');
      return;
    }
    const dataFormatada = this.formatarDataParaAPI(this.selectedDate);
    this.http.get<any>(
      `${this.baseUrl}/Agendamentos/disponibilidade?profissionalId=${this.selectedProfissional}&data=${dataFormatada}&servicoId=${servicoId}`,
      {
        headers: this.apiHeaders,
        responseType: 'json'
      }
    ).subscribe({
      next: (response) => {
        if (this.isHtmlResponse(response)) {
          this.handleApiError(new HttpErrorResponse({
            error: response,
            status: 200,
            statusText: 'OK'
          }), 'Configuração incorreta do servidor');
          return;
        }
        if (response?.success && Array.isArray(response.data)) {
          this.horariosDisponiveis = response.data.map((h: any) => ({
            ...h,
            horaFormatada: this.formatarHoraParaExibicao(h.dataHora)
          }));
        } else {
          this.horariosDisponiveis = [];
          this.mostrarErro(response?.message || 'Nenhum horário disponível');
        }
      },
      error: (err) => this.handleApiError(err, 'Erro ao buscar horários disponíveis')
    });
  }

  getAgendamento(horario: string, profissionalId: number): any | null {
    return this.agendamentos.find(a => {
      const agHora = this.normalizarHoraHHmm(a?.horario ?? a?.DataHora ?? '');
      if (agHora !== horario) return false;
      const agProfId = Number(a?.ProfissionalId ?? a?.profissionalId ?? 0);
      if (agProfId !== Number(profissionalId)) return false;

      // Cancelado deve liberar o slot para novo agendamento.
      const st = this.normalizarStatus(a?.status ?? a?.Status);
      if (st === 'cancelado' || st === 'canceled' || st === 'cancelled') return false;

      return true;
    }) || null;
  }
    isSlotVisible(horario: string, profissionalId: number): boolean {
    // Se não estiver marcado "Mostrar só ocupados", sempre exibe o slot
    if (!this.showOnlyOccupied) {
      return true;
    }

    // Quando "Mostrar só ocupados" estiver marcado,
    // só renderiza slots que realmente tenham agendamento
    return !!this.getAgendamento(horario, profissionalId);
  }

  onDateChange(event: MatDatepickerInputEvent<Date>): void {
    this.selectedDate = event.value || new Date();
    // Atualiza a grade imediatamente ao mudar a data
    this.pesquisarPorData();
    this.loadBlockedDayStatus();
  }

  onAgendamentoClick(horario: string, profissionalId: number, fromLongPress = false): void {
    try {
      // Em touch: long press dispara a ação diretamente; clicks sintéticos de touch são bloqueados
      if (!fromLongPress && Date.now() - this._lastTouchStartAt < 3000) return;
      // Evita disparos duplicados (pointerdown + click)
      const now = Date.now();
      if (now - this.lastScheduleClickAt < 350) return;
      this.lastScheduleClickAt = now;

      const agendamento = this.getAgendamento(horario, profissionalId);
      if (agendamento) {
        // Para este teste, clicar em slot ocupado apenas seleciona.
        try {
          this.setSelectedAgendamento(agendamento);
        } catch {}
        try {
          const nome = agendamento?.cliente || agendamento?.Cliente || 'Agendamento';
          this.snackBar.open(`Selecionado: ${nome}`, 'Fechar', { duration: 1200 });
        } catch {}
        return;
      }

      // Abrir diálogo com autocomplete
      const [h, m] = (horario || '').split(':');
      const dataSel = new Date(this.selectedDate);
      dataSel.setHours(Number(h), Number(m), 0, 0);
      const dataISO = dataSel.toISOString(); // usado apenas para exibir no diálogo

      const openAndHandle = () => {
        let ref;
        try {
          ref = this.dialog.open<AgendamentoDialogComponent, any, AgendamentoDialogResult>(AgendamentoDialogComponent, {
            data: { horario, dataISO, profissionalId, clientes: this.clientes, servicos: this.servicos }
          });
        } catch (e) {
          console.error('Falha ao abrir diálogo de agendamento:', e);
          this.mostrarErro('Não foi possível abrir o diálogo de agendamento. Verifique o console.');
          return;
        }

        ref.afterClosed().subscribe((result: AgendamentoDialogResult | undefined) => {
          if (!result) return; // cancelado
          const dataHoraLocal = this.formatarDataHoraLocal(dataSel);

        // Pré-validações para evitar 500 no backend por FK/dados inválidos
        const profValido = this.profissionais.some(p => p.id === Number(profissionalId));
        const clienteValido = this.clientes.some(c => c.ClienteId === Number(result.clienteId));
        const servicoValido = this.servicos.some((s: any) => (s.servicoId ?? s.ServicoId) === Number(result.servicoId));
        console.log('Validações - profissional:', profValido, 'cliente:', clienteValido, 'servico:', servicoValido);
        if (!profValido) {
          this.mostrarErro('Profissional inválido. Atualize a página e tente novamente.');
          return;
        }
        if (!clienteValido) {
          this.mostrarErro('Cliente inválido ou não encontrado. Atualize a lista de clientes e tente novamente.');
          return;
        }
        if (!servicoValido) {
          this.mostrarErro('Serviço inválido ou não encontrado. Atualize a lista de serviços e tente novamente.');
          return;
        }

        const servicoSelecionado = this.servicos.find((s: any) =>
          Number(s?.servicoId ?? s?.ServicoId) === Number(result.servicoId)
        ) as any;
        const duracaoDialog = Number(result.duracaoMinutos);
        const duracaoServico = Number(
          servicoSelecionado?.DuracaoMinutos ??
          servicoSelecionado?.duracaoMinutos ??
          servicoSelecionado?.Duracao ??
          servicoSelecionado?.duracao
        );
        const duracaoMinutosFinal = (Number.isFinite(duracaoDialog) && duracaoDialog > 0)
          ? duracaoDialog
          : (Number.isFinite(duracaoServico) && duracaoServico > 0)
            ? duracaoServico
            : 30;

        const basePayload: any = {
          ProfissionalId: Number(profissionalId),
          ClienteId: Number(result.clienteId),
          ServicoId: Number(result.servicoId),
          DataHora: dataHoraLocal,
          Status: 'Pendente',
          Observacoes: result.observacoes ?? 'Agendado via calendário'
        };

        // IMPORTANTÍSSIMO:
        // Não enviar Cliente/Servico/Profissional (objetos de navegação) no POST.
        // Caso contrário o EF Core pode tentar inserir essas entidades novamente e
        // gerar erro de chave duplicada (ex.: Duplicate entry '5' for key 'clientes.PRIMARY').
        const payload = { ...basePayload };

        // Logar payload para diagnóstico (valores e formato de DataHora)
        console.log('POST /Agendamentos payload (fk-only) =>', payload);

        const postAgendamento = (payloadToSend: any, allowRetry: boolean, usedWrapper: boolean) => {
          this.http.post(`${this.baseUrl}/Agendamentos`, payloadToSend, {
            headers: this.apiHeaders,
            observe: 'response',
            responseType: 'text'
          }).subscribe({
          next: (resp) => {
            this.snackBar.open('Agendamento criado com sucesso!', 'Fechar', { duration: 3000 });

            // Atualização otimista: ocupa o slot imediatamente na grade.
            // Isso evita sensação de "não criou" quando o refresh da busca atrasa/falha.
            try {
              const clienteNome = result?.clienteNome
                || this.clientes.find(c => Number(c?.ClienteId) === Number(result?.clienteId))?.Nome
                || `Cliente #${Number(result?.clienteId) || '?'}`;
              const servicoNome = result?.servicoNome
                || this.servicos.find((s: any) => Number(s?.servicoId ?? s?.ServicoId) === Number(result?.servicoId))?.NomeServico
                || '';

              let body: any = resp?.body;
              if (typeof body === 'string') {
                const trimmed = body.trim();
                if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
                  try { body = JSON.parse(trimmed); } catch {}
                }
              }

              const createdId = body?.AgendamentoId ?? body?.id ?? body?.agendamentoId ?? null;
              const existenteNoSlot = this.getAgendamento(horario, Number(profissionalId));
              if (!existenteNoSlot) {
                this.agendamentos = [
                  ...(this.agendamentos || []),
                  {
                    id: createdId ?? `tmp-${Date.now()}`,
                    horario,
                    ProfissionalId: Number(profissionalId),
                    ClienteId: Number(result?.clienteId),
                    ServicoId: Number(result?.servicoId),
                    servicoId: Number(result?.servicoId),
                    cliente: clienteNome,
                    servico: servicoNome,
                    status: 'Pendente'
                  }
                ];
                this.agruparPorProfissional(this.agendamentos);
              }
            } catch {}

            // Se o diálogo pediu reminder, tentar agendar
            try {
              const reminderRequested = result?.reminderEnabled;
              if (reminderRequested) {
                // tentar extrair id retornado (body pode vir como JSON string)
                let body: any = resp?.body;
                if (typeof body === 'string') {
                  const trimmed = body.trim();
                  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
                    try { body = JSON.parse(trimmed); } catch {}
                  }
                }
                const createdId = body?.AgendamentoId ?? body?.id ?? body?.agendamentoId;
                const agendamentoId = createdId || null;
                const minutesBefore = result?.reminderMinutesBefore ?? 60;
                const channels = result?.reminderChannels ?? ['email'];
                const clienteId = Number(result?.clienteId);
                // payload para ReminderService
                const reminderPayload = {
                  agendamentoId: agendamentoId,
                  clienteId: clienteId,
                  channels: channels,
                  minutesBefore: minutesBefore,
                  enabled: true
                };
                // Se ReminderService está disponível, chamar schedule. Caso seja um stub, pode não existir ainda.
                if (this.reminderService && typeof this.reminderService.schedule === 'function') {
                  this.reminderService.schedule(reminderPayload).subscribe({
                    next: () => console.debug('Lembrete agendado com sucesso', reminderPayload),
                    error: (e: any) => console.warn('Falha ao agendar lembrete', e)
                  });
                } else {
                  console.debug('ReminderService não disponível (stub). Payload:', reminderPayload);
                }
              }
            } catch (err) {
              console.error('Erro ao iniciar agendamento de lembrete:', err);
            }

            this.pesquisarPorData();
          },
          error: (err) => {
            console.error('POST /Agendamentos error =>', err);
            try { console.error('Backend data =>', err?.error?.data || err?.error?.Data); } catch {}
            const detalhe = this.extrairMensagemErro(err);

            // Para 500, tentar imprimir o máximo possível do corpo
            try {
              if (typeof err?.error === 'string') {
                console.error('Backend raw (text) =>', err.error);
              } else if (err?.error) {
                console.error('Backend raw (json) =>', err.error);
              }
            } catch {}

            // Retry para compatibilidade: alguns backends esperam { agendamento: { ... } }
            // Se vier "The agendamento field is required", provavelmente o binder não está
            // mapeando o body direto para o parâmetro.
            if (allowRetry && err?.status === 400 && !usedWrapper) {
              const detalheLower = String(detalhe || '').toLowerCase();
              const raw = (() => {
                try {
                  const d = err?.error?.data ?? err?.error?.Data ?? err?.error;
                  return typeof d === 'string' ? d : JSON.stringify(d ?? '');
                } catch {
                  return '';
                }
              })().toLowerCase();

              const hints = detalheLower + ' ' + raw;
              const needsWrapper = /\bagendamento\b.*field\s+is\s+required/.test(hints) || /"agendamento"\s*:\s*\[.*required/.test(hints);
              if (needsWrapper) {
                const wrapped = { agendamento: payloadToSend };
                console.warn('[Agendamentos] Retry 400: tentando wrapper { agendamento: ... }.');
                console.log('POST /Agendamentos payload (retry: wrapped) =>', wrapped);
                postAgendamento(wrapped, false, true);
                return;
              }
            }

            this.mostrarErro(`Erro ao criar agendamento (${err?.status ?? 'erro'}): ${detalhe}`);
            // Se deu conflito/ocupado, atualizar grade para refletir o estado real
            const raw2 = (() => {
              try {
                if (!err?.error) return '';
                if (typeof err.error === 'string') return err.error;
                if (err.error?.data) return typeof err.error.data === 'string' ? err.error.data : JSON.stringify(err.error.data);
                if (err.error?.Data) return typeof err.error.Data === 'string' ? err.error.Data : JSON.stringify(err.error.Data);
                return JSON.stringify(err.error);
              } catch {
                return '';
              }
            })();
            const hasUniqueHint = /unique|duplicate|violates unique|conflict|ocupad/i.test(String(detalhe) + ' ' + raw2);
            if (err?.status === 409 || hasUniqueHint) {
              this.pesquisarPorData();
              // Se o backend forneceu sugestões de horários, tentar automaticamente o primeiro disponível
              const sugest = err?.error?.data?.HorariosDisponiveis || err?.error?.Data?.HorariosDisponiveis;
              if (Array.isArray(sugest) && sugest.length) {
                try {
                  const primeiro = sugest[0];
                  const dataHoraSug = primeiro?.dataHora || primeiro?.DataHora || null;
                  if (dataHoraSug) {
                    const d = new Date(dataHoraSug);
                    const pad = (n: number) => String(n).padStart(2, '0');
                    const ano = d.getFullYear();
                    const mes = pad(d.getMonth() + 1);
                    const dia = pad(d.getDate());
                    const hora = pad(d.getHours());
                    const min = pad(d.getMinutes());
                    const seg = pad(d.getSeconds());
                    const dataHoraLocalSug = `${ano}-${mes}-${dia}T${hora}:${min}:${seg}`;
                    const payloadRetry = payloadToSend?.agendamento
                      ? { ...payloadToSend, agendamento: { ...(payloadToSend.agendamento as any), DataHora: dataHoraLocalSug } }
                      : { ...payloadToSend, DataHora: dataHoraLocalSug };
                    const dh = payloadToSend?.agendamento ? payloadRetry.agendamento?.DataHora : payloadRetry.DataHora;
                    console.debug('Tentando horário sugerido =>', dh);
                    this.http.post(`${this.baseUrl}/Agendamentos`, payloadRetry, {
                      headers: this.apiHeaders,
                      observe: 'response',
                      responseType: 'text'
                    }).subscribe({
                      next: () => {
                        this.snackBar.open('Criado no horário sugerido.', 'Fechar', { duration: 3000 });
                        this.pesquisarPorData();
                      },
                      error: () => {
                        this.snackBar.open('Falha no horário sugerido. Escolha outro.', 'Fechar', { duration: 4000 });
                      }
                    });
                  }
                } catch {}
              }
            } else {
              // Em alguns ambientes o backend retorna 500 genérico para conflito; ainda assim vamos atualizar a grade
              this.pesquisarPorData();
            }
          }
        });
        };

        postAgendamento(payload, true, false);
        });
      };

      // Garante que serviços foram carregados antes de abrir
      if (!this.servicos || this.servicos.length === 0) {
        this.http.get<any[]>(`${this.baseUrl}/Servicos`, { headers: this.apiHeaders }).subscribe({
          next: (data) => {
            this.servicos = (data || []).map(s => ({
              ...s,
              NomeServico: s.NomeServico ?? s.nomeServico ?? s.Nome ?? s.nome,
              servicoId: s.servicoId ?? s.ServicoId ?? s.id ?? s.Id ?? s.ServicoID ?? s.servicoID
            }));
            openAndHandle();
          },
          error: () => openAndHandle()
        });
      } else {
        openAndHandle();
      }
    } catch (e) {
      console.error('Erro no clique do slot de agendamento:', { horario, profissionalId, e });
      this.mostrarErro('Erro ao iniciar agendamento. Verifique o console para detalhes.');
    }
  }

  onAgendamentoCardClick(event: Event, agendamento: any): void {
    // Em touch: long press dispara a ação diretamente; click sintético deve ser bloqueado
    if (Date.now() - this._lastTouchStartAt < 3000) return;
    // Bloqueia o click sintético gerado pelo browser após um touchend
    if (event instanceof MouseEvent && Date.now() - this._lastTouchEndAt < 600) {
      return;
    }
    try {
      const el = (event?.target as HTMLElement | null);
      // Se o clique veio do botão "Finalizar" (ou de um filho), não abrir detalhes/diálogo
      if (el && (
        el.closest('.finalizar-btn') || el.closest('[data-action="finalizar"]') ||
        el.closest('.cancelar-btn') || el.closest('[data-action="cancelar"]')
      )) {
        return;
      }
    } catch {}

    // Seleciona o agendamento para ações fora da grade
    // Seleciona e abre painel lateral de detalhes
    this.openAgendamentoDetails(agendamento, event);
  }

  // Finalizar agendamento: cria venda via endpoint dedicado ou fallback
  onFinalizarAgendamento(ag: any) {
    const id = ag?.id ?? ag?.AgendamentoId ?? ag?.agendamentoId ?? ag?.Id;
    const idKey = this.getAgendamentoIdKey(ag);
    if (!idKey) {
      this.snackBar.open('Agendamento inválido. Recarregue a página.', 'Fechar', { duration: 3000 });
      return;
    }

    // Evita double-trigger (pointerdown + click)
    if (this.processingAgendamentos.has(idKey)) {
      return;
    }

    // Feedback imediato
    this.processingAgendamentos.add(idKey);
    this.snackBar.open('Finalizando agendamento...', 'Fechar', { duration: 1500 });
    console.log('Finalizar acionado para AgendamentoId =', id);
    const prevStatus = ag?.status;
    // Atualização otimista de UI
    try { ag.status = 'Finalizado'; } catch {}

    // Importante: este backend responde 404 para /Agendamentos/{id}/finalizar.
    // Então finalizamos via PUT direto (payload enxuto) e depois tentamos criar venda.
    const horaStr = this.normalizarHoraHHmm(ag?.horario ?? ag?.DataHora ?? '');
    const [hStr, mStr] = (horaStr || '00:00').split(':');
    const baseDate = this.selectedDate ? new Date(this.selectedDate) : new Date();
    baseDate.setHours(Number(hStr) || 0, Number(mStr) || 0, 0, 0);
    const dataHoraLocal = this.formatarDataHoraLocal(baseDate);

    const fetchFullAgendamento$ = this.http.get<any>(
      `${this.baseUrl}/Agendamentos/${encodeURIComponent(String(id))}`,
      { headers: this.apiHeaders, responseType: 'json' }
    ).pipe(
      map((resp: any) => resp?.data ?? resp?.Data ?? resp ?? {}),
      catchError((e) => {
        console.warn('[Finalizar] Falha ao buscar agendamento completo; usando dados da grade.', e);
        return of(ag ?? {});
      })
    );

    this.http.put(
      `${this.baseUrl}/Agendamentos/${encodeURIComponent(String(id))}`,
      {
        Id: id,
        AgendamentoId: id,
        DataHora: dataHoraLocal,
        ProfissionalId: ag?.ProfissionalId ?? ag?.profissionalId,
        ClienteId: ag?.ClienteId ?? ag?.clienteId,
        ServicoId: ag?.ServicoId ?? ag?.servicoId,
        Status: 'Finalizado'
      },
      { headers: this.apiHeaders }
    ).pipe(
      switchMap(() => fetchFullAgendamento$),
      switchMap((full: any) => {
        const clienteId = Number(full?.ClienteId ?? full?.clienteId ?? ag?.ClienteId ?? ag?.clienteId);
        const servicoId = Number(full?.ServicoId ?? full?.servicoId ?? ag?.ServicoId ?? ag?.servicoId);
        const profissionalId = Number(full?.ProfissionalId ?? full?.profissionalId ?? ag?.ProfissionalId ?? ag?.profissionalId);

        if (!clienteId || !servicoId || !profissionalId) {
          console.error('[Finalizar] IDs ausentes para criar venda', { clienteId, servicoId, profissionalId, full, ag });
          // Não quebra a finalização do agendamento, mas evita 500 no endpoint de Venda.
          return of({ parcial: true });
        }

        const clienteCache = (this.clientes || []).find(c => Number(c?.ClienteId) === clienteId) ?? null;
        const cliente$ = clienteCache
          ? of(clienteCache)
          : this.clientesService.getClienteById(clienteId).pipe(catchError(() => of(null)));

        const servicoCache = (this.servicos || []).find(s => Number((s as any)?.servicoId ?? (s as any)?.ServicoId) === servicoId) as any;
        const servicoNome = String(servicoCache?.NomeServico ?? servicoCache?.nomeServico ?? servicoCache?.Nome ?? servicoCache?.nome ?? '').trim();
        const servicoCategoria = String(servicoCache?.Categoria ?? servicoCache?.categoria ?? '').trim();
        const servicoDescricao = String(servicoCache?.Descricao ?? servicoCache?.descricao ?? '').trim();
        const precisaServicoFetch = !servicoCache || !servicoNome || !servicoCategoria || !servicoDescricao;
        const servico$ = !precisaServicoFetch
          ? of(servicoCache)
          : this.http.get<any>(`${this.baseUrl}/Servicos/${encodeURIComponent(String(servicoId))}`, { headers: this.apiHeaders, responseType: 'json' }).pipe(
              map((resp: any) => resp?.data ?? resp?.Data ?? resp ?? null),
              catchError(() => of(servicoCache ?? null))
            );

        return forkJoin({ cliente: cliente$, servico: servico$ }).pipe(
          switchMap(({ cliente, servico }) => {
            const servicoObj = servico as any;
            const precoLocal = Number(
              servicoObj?.Preco ??
              servicoObj?.preco ??
              servicoCache?.Preco ??
              servicoCache?.preco ??
              full?.ValorTotal ??
              full?.Total ??
              ag?.valor ??
              ag?.Preco ??
              0
            ) || 0;

            const dataVendaIso = new Date(baseDate).toISOString();

            // Backend atual valida campos aninhados como required (Cliente.Nome/Email/... e Servico.Categoria/Descricao/NomeServico)
            const clientePayload = cliente
              ? {
                  ClienteId: (cliente as any).ClienteId ?? clienteId,
                  Nome: (cliente as any).Nome ?? '',
                  Email: (cliente as any).Email ?? '',
                  Alergias: (cliente as any).Alergias ?? '',
                  Endereco: (cliente as any).Endereco ?? '',
                  Telefone: (cliente as any).Telefone ?? '',
                  Observacoes: (cliente as any).Observacoes ?? '',
                  DataNascimento: (cliente as any).DataNascimento ?? (cliente as any).dataNascimento ?? null
                }
              : null;

            const servicoPayload = servicoObj
              ? {
                  ServicoId: servicoObj?.ServicoId ?? servicoObj?.servicoId ?? servicoId,
                  NomeServico: servicoObj?.NomeServico ?? servicoObj?.nomeServico ?? servicoObj?.Nome ?? servicoObj?.nome ?? '',
                  Categoria: servicoObj?.Categoria ?? servicoObj?.categoria ?? '',
                  Descricao: servicoObj?.Descricao ?? servicoObj?.descricao ?? '',
                  Preco: servicoObj?.Preco ?? servicoObj?.preco ?? precoLocal,
                  DuracaoMinutos: servicoObj?.DuracaoMinutos ?? servicoObj?.duracaoMinutos ?? servicoObj?.Duracao ?? servicoObj?.duracao ?? null
                }
              : null;

            const vendaDto: any = {
              ClienteId: clienteId,
              ServicoId: servicoId,
              ProfissionalId: profissionalId,
              AgendamentoId: id,
              DataVenda: dataVendaIso,
              DataPagamento: dataVendaIso,
              DataHora: dataVendaIso,
              FormaPagamento: 'Dinheiro',
              Pago: true,
              Status: 'Pago',
              TotalVenda: precoLocal,
              ValorVenda: precoLocal,
              ValorTotal: precoLocal,
              Total: precoLocal,
              Cliente: clientePayload,
              Servico: servicoPayload
            };

            console.log('[Finalizar] POST /Venda payload =>', vendaDto);
            return this.http.post(`${this.baseUrl}/Venda`, vendaDto, { headers: this.apiHeaders }).pipe(
              catchError(vErr => {
                const detalheVenda = this.extrairMensagemErro(vErr);
                console.error('POST /Venda error =>', vErr);
                try { console.error('Backend data =>', vErr?.error?.data || vErr?.error?.Data || vErr?.error); } catch {}
                console.warn('Falha ao criar venda após finalizar:', detalheVenda);
                return of({ parcial: true });
              })
            );
          })
        );
      })
    )
      .subscribe({
        next: (resp: any) => {
          this.processingAgendamentos.delete(idKey);
          if (resp?.parcial) {
            this.snackBar.open(
              'Agendamento finalizado. Venda não criada. Abra o console/Network para ver o motivo.',
              'Fechar',
              { duration: 6000 }
            );
          } else {
            this.snackBar.open('Finalizado e venda criada!', 'Fechar', { duration: 3000 });
          }
          console.debug('Finalizar sucesso para AgendamentoId =', id, 'resp=', resp);
          this.pesquisarPorData();
        },
        error: (e) => {
          this.processingAgendamentos.delete(idKey);
          console.error('Erro ao finalizar agendamento:', e);
          const detalhe = this.extrairMensagemErro(e);
          this.snackBar.open('Falha ao finalizar: ' + detalhe, 'Fechar', { duration: 5000 });
          // Reverter otimista
          try { ag.status = prevStatus; } catch {}
        }
      });
  }

  onCancelarAgendamento(ag: any, event?: Event): void {
    try {
      event?.stopPropagation?.();
      (event as any)?.preventDefault?.();
    } catch {}

    const id = ag?.id ?? ag?.AgendamentoId ?? ag?.agendamentoId ?? ag?.Id;
    const idKey = this.getAgendamentoIdKey(ag);
    if (!idKey) {
      this.snackBar.open('Agendamento inválido. Recarregue a página.', 'Fechar', { duration: 3000 });
      return;
    }

    const st = String(ag?.status ?? ag?.Status ?? '').toLowerCase();
    if (st === 'cancelado') {
      this.snackBar.open('Este agendamento já está cancelado.', 'Fechar', { duration: 2000 });
      return;
    }
    if (st === 'finalizado') {
      this.snackBar.open('Agendamento finalizado não pode ser cancelado.', 'Fechar', { duration: 2500 });
      return;
    }

    if (this.cancelandoAgendamentos.has(idKey)) return;

    const ok = window.confirm('Cancelar este agendamento?');
    if (!ok) return;

    const prevStatus = ag?.status;
    try { ag.status = 'Cancelado'; } catch {}

    this.cancelandoAgendamentos.add(idKey);
    this.snackBar.open('Cancelando agendamento...', 'Fechar', { duration: 1200 });

    // Busca o agendamento completo antes de dar PUT, para não sobrescrever campos não exibidos na UI.
    this.http.get<any>(`${this.baseUrl}/Agendamentos/${encodeURIComponent(String(id))}`, { headers: this.apiHeaders, responseType: 'json' })
      .pipe(
        switchMap((resp: any) => {
          const full = resp?.data ?? resp?.Data ?? resp;
          const fullId = full?.AgendamentoId ?? full?.agendamentoId ?? full?.Id ?? full?.id ?? id;

          // Mantém o payload no MESMO formato mínimo que o fluxo de "Finalizar" já usa
          // (evita falhas por campos extras/obrigatórios divergentes no backend).
          const payloadUpdate: any = {
            Id: fullId,
            AgendamentoId: fullId,
            DataHora: full?.DataHora ?? full?.dataHora ?? ag?.DataHora ?? ag?.dataHora,
            ProfissionalId: full?.ProfissionalId ?? full?.profissionalId ?? ag?.ProfissionalId ?? ag?.profissionalId,
            ClienteId: full?.ClienteId ?? full?.clienteId ?? ag?.ClienteId ?? ag?.clienteId,
            ServicoId: full?.ServicoId ?? full?.servicoId ?? ag?.ServicoId ?? ag?.servicoId,
            Status: 'Cancelado',
            Observacoes: full?.Observacoes ?? full?.observacoes ?? ag?.Observacoes ?? ag?.observacoes ?? null,
          };

          return this.http.put(`${this.baseUrl}/Agendamentos/${encodeURIComponent(String(fullId))}`, payloadUpdate, { headers: this.apiHeaders, responseType: 'json' });
        }),
        catchError((e) => {
          return throwError(() => e);
        })
      )
      .subscribe({
        next: () => {
          this.cancelandoAgendamentos.delete(idKey);
          this.snackBar.open('Agendamento cancelado.', 'Fechar', { duration: 2500 });
          try { this.reminderService.cancel(Number(id) || 0).subscribe({ error: () => {} }); } catch {}
          this.pesquisarPorData();
        },
        error: (e) => {
          this.cancelandoAgendamentos.delete(idKey);
          const detalhe = this.extrairMensagemErro(e);
          this.snackBar.open('Falha ao cancelar: ' + detalhe, 'Fechar', { duration: 5000 });
          try { ag.status = prevStatus; } catch {}
        }
      });
  }

  onFinalizarAgendamentoClick(ag: any, event: Event): void {
    try {
      event?.stopPropagation();
      // Em alguns browsers (scroll/touch), evitar comportamento padrão ajuda a garantir o handler
      (event as any)?.preventDefault?.();
    } catch {}
    // Depuração explícita do clique
    const idDbg = this.getAgendamentoIdKey(ag);
    console.log('Clique Finalizar recebido. AgendamentoId =', idDbg, 'obj:', ag);
    // Feedback imediato para garantir visibilidade
    this.snackBar.open('Finalizando agendamento...', 'Fechar', { duration: 1200 });
    this.onFinalizarAgendamento(ag);
  }

  // Método auxiliar de debug: registra eventos e delega para o handler normal
  debugFinalize(ag: any, event: Event): void {
    try {
      const idDbg = this.getAgendamentoIdKey(ag);
      this.debugFinalizeCount++;
      this.debugFinalizeLast = `template:${String((event as any)?.type || 'event')} id=${idDbg || '?'} @${new Date().toLocaleTimeString()}`;
    } catch {}
    try {
      console.log('DEBUG FINALIZE CLICK!');
      console.log('debugFinalize: event:', event, 'ag:', ag);
      if (!ag) {
        console.warn('Agendamento não definido no clique de finalizar!');
      }
      if (!event) {
        console.warn('Evento MouseEvent não recebido!');
      }
    } catch (e) {
      console.error('Erro no debugFinalize:', e);
    }
    this.onFinalizarAgendamentoClick(ag, event);
  }

  isFinalizando(ag: any): boolean {
    const key = this.getAgendamentoIdKey(ag);
    if (!key) return false;
    return this.processingAgendamentos.has(key);
  }

  private montarDataHoraAtualComoLocal(): string {
    const now = new Date();
    return this.formatarDataHoraLocal(now);
  }

  // Drag & drop: reagendamento
  onDrop(event: CdkDragDrop<any>, horarioDestino: string, profissionalDestinoId: number): void {
    try {
      const dragged = event.item?.data as any;
      if (!dragged || !dragged.id) {
        return;
      }

      // Se alvo já estiver ocupado, impedir
      const ocupado = this.getAgendamento(horarioDestino, profissionalDestinoId);
      if (ocupado && ocupado.id !== dragged.id) {
        this.mostrarErro('Horário já ocupado para este profissional.');
        return;
      }

      // Se não houver data selecionada, impedir
      if (!this.selectedDate) {
        this.mostrarErro('Selecione uma data antes de reagendar.');
        return;
      }

  // Montar nova data/hora no mesmo formato local usado no POST
      const [h, m] = horarioDestino.split(':');
      const novaData = new Date(this.selectedDate);
      novaData.setHours(Number(h), Number(m), 0, 0);
  const novaLocal = this.formatarDataHoraLocal(novaData);

      // Se nada mudou, ignore
      if (dragged.ProfissionalId === profissionalDestinoId && this.horarioIgual(dragged.horario, horarioDestino)) {
        return;
      }

      // Alguns backends exigem que o corpo contenha o mesmo ID da rota (consistência)
      const servicoId = dragged.ServicoId ?? dragged.servicoId ?? null;
      const payload: any = {
        Id: dragged.id,
        AgendamentoId: dragged.id,
        DataHora: novaLocal,
        ProfissionalId: profissionalDestinoId,
        // Enviar também campos auxiliares quando disponíveis (não obrigatório em todos backends)
        ClienteId: dragged.ClienteId ?? dragged.clienteId,
        ServicoId: servicoId ?? (this.servicos?.[0]?.servicoId ?? this.servicos?.[0]?.ServicoId ?? null),
        Status: dragged.status ?? 'Pendente'
      };
      console.log('PUT /Agendamentos payload =>', payload);

  this.http.put<any>(`${this.baseUrl}/Agendamentos/${dragged.id}`, payload, {
        headers: this.apiHeaders,
        responseType: 'json'
      }).subscribe({
        next: (resp) => {
          if (this.isHtmlResponse(resp)) {
            this.handleApiError(new HttpErrorResponse({ error: resp, status: 200, statusText: 'OK' }), 'Falha ao reagendar');
            return;
          }
          this.snackBar.open('Reagendado!', 'Fechar', { duration: 3000 });
          this.pesquisarPorData();
        },
        error: (err) => {
          // Tornar mensagem mais amigável para "ID inconsistente"
          const detalhe = this.extrairMensagemErro(err);
          if (/id inconsistente/i.test(detalhe) || /inconsistente/i.test(detalhe)) {
            this.mostrarErro('Falha ao reagendar: ID inconsistente. Atualize a página e tente novamente.');
          } else {
            this.handleApiError(err, 'Erro ao reagendar');
          }
          // Atualiza grade para refletir estado real
          this.pesquisarPorData();
        }
      });
    } catch (e: any) {
      this.mostrarErro('Erro ao processar o arraste-solte.');
    }
  }

  private horarioIgual(orig: string, destino: string): boolean {
    // orig pode ser HH:mm ou uma string de data
    try {
      if (orig && orig.length > 5) {
        const d = new Date(orig);
        const pad = (n: number) => n.toString().padStart(2, '0');
        const hhmm = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
        return hhmm === destino;
      }
      return orig === destino;
    } catch {
      return false;
    }
  }

  trackEvent(): void {
    this.http.get<any>(`${this.baseUrl}/agendamentos/proxy`, {
      headers: this.apiHeaders,
      responseType: 'json'
    }).subscribe({
      next: (response) => {
        if (this.isHtmlResponse(response)) {
          console.error('Configuração incorreta do servidor - recebido HTML em vez de JSON');
          return;
        }
        if (response?.success) {
          console.log('Tracking realizado com sucesso');
        } else {
          console.warn('Tracking com aviso:', response?.message);
        }
      },
      error: (err) => console.error('Erro no tracking:', err)
    });
  }

  private formatarDataParaAPI(date: Date): string {
    // Usar data local (não UTC) para evitar virar dia anterior/posterior
    const pad = (n: number) => String(n).padStart(2, '0');
    const ano = date.getFullYear();
    const mes = pad(date.getMonth() + 1);
    const dia = pad(date.getDate());
    return `${ano}-${mes}-${dia}`;
  }

  private formatarHoraParaExibicao(dataHora: string): string {
    try {
      const date = new Date(dataHora);
      return date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    } catch (e) {
      console.error('Erro ao formatar hora:', e);
      return dataHora;
    }
  }

  // Segurança: alguns backends ignoram `?data=YYYY-MM-DD` e retornam tudo.
  // Aqui garantimos que a UI mostre apenas os agendamentos do dia selecionado.
  private isAgendamentoDoDia(ag: any, dataYYYYMMDD: string): boolean {
    try {
      const raw = ag?.DataHora ?? ag?.dataHora ?? ag?.Horario ?? ag?.horario ?? ag?.data_hora ?? null;
      if (!raw) return false;

      if (raw instanceof Date) {
        return this.formatarDataParaAPI(raw) === dataYYYYMMDD;
      }

      const s = String(raw).trim();

      // ISO/Local string frequentemente começa com YYYY-MM-DD
      if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
        return s.slice(0, 10) === dataYYYYMMDD;
      }

      // Fallback: tentar parsear
      const d = new Date(s);
      if (!Number.isFinite(d.getTime())) return false;
      return this.formatarDataParaAPI(d) === dataYYYYMMDD;
    } catch {
      return false;
    }
  }

  // Normaliza string de data/hora ou HH:mm para HH:mm sem depender de timezone
  private normalizarHoraHHmm(dataHoraOuHora: string): string {
    if (!dataHoraOuHora) return '';
    // Já vem em HH:mm
    if (/^\d{2}:\d{2}$/.test(dataHoraOuHora)) return dataHoraOuHora;

    // Prioriza horário literal quando vier em formato de data/hora (evita deslocamento por timezone).
    // Exemplos: "2026-04-12T08:00:00", "2026-04-12 08:00:00", "2026-04-12T08:00:00Z"
    const literalMatch = String(dataHoraOuHora).match(/[T\s](\d{2}:\d{2})(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})?$/);
    if (literalMatch?.[1]) return literalMatch[1];

    // Preferir Date para converter ISO (com ou sem timezone) para hora local
    try {
      const d = new Date(dataHoraOuHora);
      if (!Number.isFinite(d.getTime())) {
        const m = dataHoraOuHora.match(/(\d{2}:\d{2})/);
        return m?.[1] || dataHoraOuHora;
      }
      const pad = (n: number) => String(n).padStart(2, '0');
      return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
    } catch {
      // Último recurso: tentar extrair HH:mm bruto
      const m = dataHoraOuHora.match(/(\d{2}:\d{2})/);
      return m?.[1] || dataHoraOuHora;
    }
  }

  private isHtmlResponse(response: any): boolean {
    return typeof response === 'string' && response.startsWith('<!DOCTYPE html>');
  }

  private handleApiError(error: HttpErrorResponse, defaultMessage: string): void {
    console.error('API Error:', error);
    let errorMessage = defaultMessage;
    if (error.status === 0) {
      errorMessage = 'Erro de conexão com o servidor';
    } else if (error.status === 200 && error.error instanceof ProgressEvent) {
      errorMessage = 'O servidor retornou uma resposta inválida';
    } else if (error.status === 200 && this.isHtmlResponse(error.error)) {
      errorMessage = 'Configuração incorreta do servidor - contate o administrador';
    } else if (error.status === 409) {
      errorMessage = 'Horário indisponível para este profissional';
    } else if (typeof error.error === 'string' && error.error.trim()) {
      // Algumas APIs retornam string/HTML em erro 500.
      const body = error.error.trim();
      if (this.isHtmlResponse(body)) {
        errorMessage = 'Erro no servidor (HTML retornado). Verifique logs da API.';
      } else {
        errorMessage = body.length > 300 ? body.slice(0, 300) + '…' : body;
      }
    } else if (error.error?.message || error.error?.Message) {
      errorMessage = (error.error.message ?? error.error.Message) as string;
    } else if (error.error?.title || error.error?.detail) {
      // ProblemDetails
      errorMessage = `${error.error.title ?? 'Erro'}${error.error.detail ? ': ' + error.error.detail : ''}`;
    } else if (error.error?.errors && typeof error.error.errors === 'object') {
      // ModelState errors
      try {
        const firstKey = Object.keys(error.error.errors)[0];
        const firstMsg = Array.isArray(error.error.errors[firstKey])
          ? error.error.errors[firstKey][0]
          : String(error.error.errors[firstKey]);
        if (firstMsg) errorMessage = firstMsg;
      } catch {}
    } else if (error.status === 404) {
      errorMessage = 'Endpoint não encontrado';
    } else if (error.status === 500) {
      errorMessage = 'Erro interno do servidor';
    }
    this.mostrarErro(errorMessage);
  }

  // Converte Date para string local no formato "YYYY-MM-DDTHH:mm:ss" (sem timezone)
  private formatarDataHoraLocal(d: Date): string {
    const pad = (n: number) => String(n).padStart(2, '0');
    const ano = d.getFullYear();
    const mes = pad(d.getMonth() + 1);
    const dia = pad(d.getDate());
    const hora = pad(d.getHours());
    const min = pad(d.getMinutes());
    const seg = pad(d.getSeconds());
    return `${ano}-${mes}-${dia}T${hora}:${min}:${seg}`;
  }

  // Extrai mensagem útil de erro 400 do backend
  private extrairMensagemErro(err: any): string {
    try {
      if (err?.error) {
        // ProblemDetails (ASP.NET) or plain string
        if (typeof err.error === 'string') return err.error;
        if (err.error.message) return err.error.message;
        if (err.error.Message) return err.error.Message;
        // Buscar detalhes aninhados retornados pelo backend
        const detalhesMin = err.error?.data?.Detalhes || err.error?.data?.detalhes;
        const detalhesMai = err.error?.Data?.Detalhes || err.error?.Data?.detalhes;
        const detalhes = (detalhesMin || detalhesMai || '') as string;
        if (detalhes) {
          // Mapear mensagens comuns do SQL/EF para algo amigável
          const detLower = detalhes.toLowerCase();
          if (/foreign key|constraint|referential/i.test(detalhes)) {
            return 'Referência inválida (cliente, serviço ou profissional não existe).';
          }
          if (/unique|ix_|uq_|duplicate|violates unique/i.test(detLower)) {
            return 'Horário já ocupado para este profissional.';
          }
          if (/cannot insert null|not null|required/i.test(detLower)) {
            return 'Campo obrigatório ausente. Verifique data/hora, profissional, cliente e serviço.';
          }
          const baseMsg = err.error.Message || err.error.message || 'Falha na operação';
          return `${baseMsg} — Detalhes: ${detalhes}`;
        }
        if (err.error.errors) {
          const e = err.error.errors as Record<string, any>;
          if (e && typeof e === 'object') {
            const parts: string[] = [];
            Object.keys(e).slice(0, 5).forEach(k => {
              const msgs = e[k];
              if (Array.isArray(msgs) && msgs.length) {
                parts.push(`${k}: ${msgs[0]}`);
              }
            });
            if (parts.length) return parts.join(' | ');
          }
        }
        // Alguns backends retornam { success, Message }
        if (err.error.success === false && (err.error.Message || err.error.message)) {
          return err.error.Message || err.error.message;
        }
        // Último recurso: inspecionar data bruto
        if (err.error.data) {
          try {
            const raw = typeof err.error.data === 'string' ? err.error.data : JSON.stringify(err.error.data);
            if (raw) return raw;
          } catch {}
        }
      }
      return err?.message || 'Requisição inválida (400)';
    } catch {
      return 'Requisição inválida (400)';
    }
  }

  private agruparPorProfissional(agendamentos: any[]): void {
    const map = new Map<number, any[]>();
    agendamentos.forEach(ag => {
      if (!map.has(ag.ProfissionalId)) {
        map.set(ag.ProfissionalId, []);
      }
      map.get(ag.ProfissionalId)?.push(ag);
    });
    this.agendamentosAgrupados = Array.from(map.entries()).map(([profId, ags]) => {
      const profissional = this.profissionais.find(p => p.id === profId);
      if (!profissional) {
        console.warn(`⚠️ Profissional ID ${profId} não encontrado.`);
      }
      return { profissional: profissional!, agendamentos: ags };
    });
  }

  private mostrarErro(mensagem: string): void {
    this.snackBar.open(mensagem, 'Fechar', {
      duration: 5000,
      panelClass: ['error-snackbar']
    });
  }
}
