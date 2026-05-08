import { Component, OnInit, ViewChild, TemplateRef, AfterViewInit, Inject, Optional, PLATFORM_ID, DOCUMENT } from '@angular/core';
import { MatTableDataSource } from '@angular/material/table';
import { MatButtonModule } from '@angular/material/button';
import { MatTabsModule } from '@angular/material/tabs';
import { MatInputModule } from '@angular/material/input';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { MatTableModule } from '@angular/material/table';
import { FormsModule } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatListModule } from '@angular/material/list';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatToolbarModule } from '@angular/material/toolbar';
import { HttpClient } from '@angular/common/http';
import { PagamentosService } from 'app/services/pagamentos.service';
import { ProfissionaisService, Profissional } from 'app/services/profissionais.service';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatSelectModule } from '@angular/material/select';
import { MatOptionModule, MatNativeDateModule } from '@angular/material/core';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatPaginator, MatPaginatorModule } from '@angular/material/paginator';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatSort, MatSortModule } from '@angular/material/sort';
import { AuthService } from 'app/services/auth.service';

interface SalarioDto {
  salarioId: number;
  profissionalId: number;
  salarioFixo: number;
  dataInicio: string;
  dataFim?: string | null;
  profissional?: {
    profissionalId: number;
    nome?: string;
    especializacao?: string;
    especialidade?: string;
  };
}

// Interface para Pagamento
interface Pagamento {
  id?: number;
  PagamentoId?: number;
  nome?: string;
  Nome?: string;
  cargo?: string;
  Cargo?: string;
  salario?: number;
  Salario?: number;
  comissao?: number;
  Comissao?: number;
  total?: number;
  Total?: number;
  dataPagamento?: string;
  DataPagamento?: string;
  pago?: boolean;
  Pago?: boolean;
}

@Component({
  selector: 'app-business-pagamentos',
  standalone: true,
  imports: [
    MatButtonModule,
    MatTabsModule,
    MatInputModule,
    MatTableModule,
    MatFormFieldModule,
    MatCheckboxModule,
    CommonModule,
    FormsModule,
    MatCardModule,
    MatIconModule,
    MatListModule,
    MatTooltipModule,
    MatToolbarModule,
    MatDialogModule,
    MatSelectModule,
    MatOptionModule,
    MatNativeDateModule,
    MatDatepickerModule,
    MatPaginatorModule,
    MatSnackBarModule,
    MatSortModule
  ],
  templateUrl: './business-pagamentos.component.html',
  styleUrls: ['./business-pagamentos.component.css']
})
export class BusinessPagamentos implements OnInit, AfterViewInit {
  // Exibiremos por funcionário com colunas de salário fixo, total e status (comissão nos relatórios)
  displayedColumns: string[] = ['funcionario', 'mes', 'salario', 'total', 'status', 'acoes'];
  dataSourcePagamentos = new MatTableDataSource<any>();
  dataSource = { data: [] };

  // Estado de seleção de período
  selectedMonth: number = new Date().getMonth() + 1; // 1-12
  selectedYear: number = new Date().getFullYear();

  // Filtros
  statusFilter: 'all' | 'paid' | 'pending' = 'all';
  readonly monthOptions: Array<{ value: number; label: string }> = Array.from({ length: 12 }, (_, i) => {
    const value = i + 1;
    const d = new Date(2020, i, 1);
    const label = d.toLocaleString('pt-BR', { month: 'short' }).replace('.', '');
    return { value, label };
  });

  profissionais: Profissional[] = [];

  // Controle do modal e formulário do pagamento
  pagamentoForm: any = {
    id: 0,
    profissionalId: null,
    nome: '',
    cargo: '',
    salario: 0,
    comissao: 0,
    total: 0,
    dataPagamento: '',
    pago: false
  };
  pagamentoEditando: boolean = false;
  dialogRef: any;
  filtroNome: string = '';

  // Painel do gerente (pendências do mês)
  showAllPendentes: boolean = false;

  @ViewChild(MatPaginator) paginator!: MatPaginator;
  @ViewChild(MatSort) sort!: MatSort;
  @ViewChild('modalPagamento') modalPagamentoTemplate!: TemplateRef<any>;

  constructor(
    private pagamentosService: PagamentosService,
    public dialog: MatDialog,
    private profissionaisService: ProfissionaisService,
    private http: HttpClient,
    private snackBar: MatSnackBar,
    public auth: AuthService,
    @Inject(PLATFORM_ID) private platformId: Object,
    @Optional() @Inject(DOCUMENT) private document: Document | null
  ) {}

  get isGerente(): boolean {
    // Hoje a app usa isAdmin() como equivalente de gerente (admin/gerente)
    return this.auth?.isAdmin?.() ?? false;
  }

  /** Pendências calculadas com base no mês/ano selecionados (dados sem filtro de busca/status). */
  get pendentesDoMes(): any[] {
    const rows = (this.dataSourcePagamentos.data || []) as any[];
    return rows.filter(r => !r?.pago);
  }

  get pagosDoMes(): any[] {
    const rows = (this.dataSourcePagamentos.data || []) as any[];
    return rows.filter(r => !!r?.pago);
  }

  get pendentesVisiveis(): any[] {
    const list = this.pendentesDoMes;
    if (this.showAllPendentes) return list;
    return list.slice(0, 6);
  }

  filtrarSomentePendentes(): void {
    this.statusFilter = 'pending';
    this.applyAllFilters();
  }

  limparFiltroStatus(): void {
    this.statusFilter = 'all';
    this.applyAllFilters();
  }

  private showError(message: string, detail?: string): void {
    const msg = detail ? `${message} (${detail})` : message;
    this.snackBar.open(msg, 'OK', { duration: 6000 });
  }

  ngOnInit(): void {
    this.setupFilters();
    this.loadProfissionaisAndPagamentos();
  }

  ngAfterViewInit(): void {
    this.dataSourcePagamentos.paginator = this.paginator;
    this.dataSourcePagamentos.sort = this.sort;
    this.dataSourcePagamentos.sortingDataAccessor = (row: any, property: string): string | number => {
      switch (property) {
        case 'funcionario':
          return String(row?.nome ?? '').toLowerCase();
        case 'mes':
          // Ordena pelo mês/ano efetivo exibido
          return this.getMesSortValue(row);
        case 'salario':
          return Number(row?.salario ?? 0);
        case 'total':
          return Number(row?.total ?? 0);
        case 'status':
          // Pago primeiro quando ordenar asc
          return row?.pago ? 0 : 1;
        default:
          return String(row?.[property] ?? '').toLowerCase();
      }
    };
    console.log('📋 Paginator configurado:', this.paginator);
    console.log('🎭 Modal template disponível:', !!this.modalPagamentoTemplate);
  }

  getCompetenciaLabel(): string {
    return this.formatMonthYear(this.selectedMonth, this.selectedYear);
  }

  get showingCount(): number {
    return (this.dataSourcePagamentos.filteredData || []).length;
  }

  get totalCount(): number {
    return (this.dataSourcePagamentos.data || []).length;
  }

  get pagosCount(): number {
    const rows = (this.dataSourcePagamentos.filteredData ?? this.dataSourcePagamentos.data) || [];
    return rows.filter(r => !!r?.pago).length;
  }

  get pendentesCount(): number {
    const rows = (this.dataSourcePagamentos.filteredData ?? this.dataSourcePagamentos.data) || [];
    return rows.filter(r => !r?.pago).length;
  }

  getMesLabel(row: any): string {
    // Se tiver data real de pagamento, mostramos o mês em que foi pago.
    // Caso contrário, mostramos a competência selecionada (mês/ano da folha).
    const pagoEm = row?.pagoEm ?? row?.PagoEm ?? null;
    if (row?.pago && pagoEm) {
      const label = this.formatMonthYearFromDate(pagoEm);
      return label || this.getCompetenciaLabel();
    }
    return this.getCompetenciaLabel();
  }

  getPagoEmTooltip(row: any): string {
    const pagoEm = row?.pagoEm ?? row?.PagoEm ?? null;
    if (!row?.pago || !pagoEm) return '';
    const d = this.parseDate(pagoEm);
    return d ? d.toLocaleDateString('pt-BR') : '';
  }

  getPagoEmSmallText(row: any): string {
    const pagoEm = row?.pagoEm ?? row?.PagoEm ?? null;
    if (!row?.pago || !pagoEm) return '';
    const d = this.parseDate(pagoEm);
    return d ? `Pago em ${d.toLocaleDateString('pt-BR')}` : '';
  }

  private formatMonthYear(month: number, year: number): string {
    const safeMonth = Number(month);
    const safeYear = Number(year);
    if (!safeMonth || !safeYear) return '';
    const d = new Date(safeYear, safeMonth - 1, 1);
    const monthLabel = this.titleCase(d.toLocaleString('pt-BR', { month: 'long' }));
    // Ex: "Dezembro/2025"
    return `${monthLabel}/${safeYear}`;
  }

  private formatMonthYearFromDate(value: any): string {
    const d = this.parseDate(value);
    if (!d) return '';
    const monthLabel = this.titleCase(d.toLocaleString('pt-BR', { month: 'long' }));
    return `${monthLabel}/${d.getFullYear()}`;
  }

  private titleCase(value: string): string {
    if (!value) return '';
    return value.charAt(0).toUpperCase() + value.slice(1);
  }

  private getMesSortValue(row: any): number {
    // Usa timestamp do 1º dia do mês exibido para ordenar cronologicamente.
    const pagoEm = row?.pagoEm ?? row?.PagoEm ?? null;
    const d = row?.pago && pagoEm ? this.parseDate(pagoEm) : new Date(Number(this.selectedYear), Number(this.selectedMonth) - 1, 1);
    const safe = d ?? new Date(0);
    return new Date(safe.getFullYear(), safe.getMonth(), 1).getTime();
  }

  private parseDate(value: any): Date | null {
    if (!value) return null;
    const d = value instanceof Date ? value : new Date(value);
    return isNaN(d.getTime()) ? null : d;
  }

  loadProfissionaisAndPagamentos(): void {
    // Carregar profissionais e pagamentos em paralelo
    this.profissionaisService.getProfissionais().subscribe({
      next: (profs) => {
        this.profissionais = profs;
        this.refreshPagamentosView();
      },
      error: (err) => {
        console.error('Erro ao carregar profissionais:', err);
        this.refreshPagamentosView();
      }
    });
  }

  onProfSelected(profissionalId: number | null): void {
    if (!profissionalId) {
      this.pagamentoForm.nome = '';
      this.pagamentoForm.cargo = '';
      this.pagamentoForm.salario = 0;
      this.pagamentoForm.comissao = 0;
      this.calcularTotal();
      return;
    }

    const prof = this.profissionais.find(p => p.id === Number(profissionalId));
    if (prof) {
      this.pagamentoForm.profissionalId = prof.id;
      this.pagamentoForm.nome = prof.nome;
      this.pagamentoForm.cargo = prof.especialidade || prof.especializacao || '';
      this.pagamentoForm.salario = Number(prof.salario ?? 0);
      // Não buscamos mais comissão na tela de pagamentos (fica disponível nos relatórios)
      this.pagamentoForm.comissao = 0;
      this.calcularTotal();
    }
  }

  // computeCommissionFor removed: commissions are shown in reports, not on payments screen

  refreshPagamentosView(): void {
    const month = Number(this.selectedMonth);
    const year = Number(this.selectedYear);

    // Observação importante: no Swagger atual não existe /api/Pagamentos/for-month.
    // O controller de Pagamentos aceita apenas rotas REST padrão (/api/Pagamentos e /api/Pagamentos/{id}).
    // Para a visão mensal por profissional, montamos a lista usando /api/Salarios (salário vigente por competência)
    // e informações de profissionais já carregadas.

    const competencia = new Date(year, month - 1, 1);

    this.http.get<any>('/api/Salarios').subscribe({
      next: (resp) => {
        const list: SalarioDto[] = Array.isArray(resp)
          ? resp
          : Array.isArray(resp?.value)
            ? resp.value
            : Array.isArray(resp?.Value)
              ? resp.Value
              : [];

        const salariosVigentes = this.pickSalariosVigentes(list, competencia);

        const profIds = new Set<number>();
        for (const p of this.profissionais || []) {
          if (p?.id) profIds.add(Number(p.id));
        }
        for (const s of salariosVigentes.values()) {
          if (s?.profissionalId) profIds.add(Number(s.profissionalId));
        }

        const rows = Array.from(profIds).map((profissionalId) => {
          const prof = (this.profissionais || []).find(p => Number(p.id) === Number(profissionalId));
          const sal = salariosVigentes.get(Number(profissionalId));

          const nome =
            String(
              prof?.nome ??
              sal?.profissional?.nome ??
              ''
            ).trim();

          const cargo = String(
            prof?.especialidade ??
            prof?.especializacao ??
            sal?.profissional?.especializacao ??
            sal?.profissional?.especialidade ??
            ''
          ).trim();

          const salario = Number(
            sal?.salarioFixo ??
            prof?.salario ??
            0
          );

          return {
            profissionalId: Number(profissionalId),
            nome: nome || `Profissional ${profissionalId}`,
            cargo,
            salario,
            comissaoMes: 0,
            total: salario,
            pago: false,
            pagoEm: null
          };
        });

        this.dataSourcePagamentos.data = rows;
        if (this.paginator) this.dataSourcePagamentos.paginator = this.paginator;

        this.applyAllFilters();
      },
      error: (err) => {
        console.error('Erro ao carregar salários:', err);
        const detail =
          err?.error?.Detail ||
          err?.error?.detail ||
          err?.error?.title ||
          err?.message;
        this.showError('Erro ao carregar pagamentos. Verifique a API e tente novamente.', detail);
      }
    });
  }

  private pickSalariosVigentes(list: SalarioDto[], competencia: Date): Map<number, SalarioDto> {
    const map = new Map<number, SalarioDto>();

    const comp = new Date(competencia.getFullYear(), competencia.getMonth(), 1);
    const compTime = comp.getTime();

    const isVigente = (s: SalarioDto): boolean => {
      const ini = this.parseDate(s?.dataInicio);
      if (!ini) return false;
      const iniTime = new Date(ini.getFullYear(), ini.getMonth(), ini.getDate()).getTime();
      if (iniTime > compTime) return false;

      const fim = this.parseDate((s as any)?.dataFim);
      if (!fim) return true;
      const fimTime = new Date(fim.getFullYear(), fim.getMonth(), fim.getDate()).getTime();
      return fimTime >= compTime;
    };

    const getIniTime = (s: SalarioDto): number => {
      const ini = this.parseDate(s?.dataInicio);
      if (!ini) return -Infinity;
      return new Date(ini.getFullYear(), ini.getMonth(), ini.getDate()).getTime();
    };

    for (const s of list || []) {
      const profissionalId = Number((s as any)?.profissionalId ?? (s as any)?.ProfissionalId ?? 0);
      if (!profissionalId) continue;
      const normalized: SalarioDto = {
        ...s,
        profissionalId,
        salarioFixo: Number((s as any)?.salarioFixo ?? (s as any)?.SalarioFixo ?? 0),
        dataInicio: (s as any)?.dataInicio ?? (s as any)?.DataInicio,
        dataFim: (s as any)?.dataFim ?? (s as any)?.DataFim ?? null
      };

      if (!isVigente(normalized)) continue;

      const existing = map.get(profissionalId);
      if (!existing) {
        map.set(profissionalId, normalized);
        continue;
      }

      // Mantém o mais recente (maior dataInicio) para a competência.
      if (getIniTime(normalized) >= getIniTime(existing)) {
        map.set(profissionalId, normalized);
      }
    }

    return map;
  }

  exportCsv(): void {
    if (!isPlatformBrowser(this.platformId) || !this.document) return;

    const month = this.selectedMonth;
    const year = this.selectedYear;
    const rows = (this.dataSourcePagamentos.filteredData ?? this.dataSourcePagamentos.data ?? []) as any[];

    const header = ['profissionalId', 'nome', 'cargo', 'competencia', 'salario', 'total', 'pago', 'pagoEm'];
    const competencia = `${String(month).padStart(2, '0')}/${year}`;

    const escape = (v: any) => {
      const s = String(v ?? '');
      if (/[\n\r",;]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
      return s;
    };

    const lines = [header.join(';')];
    for (const r of rows) {
      lines.push([
        escape(r?.profissionalId),
        escape(r?.nome),
        escape(r?.cargo),
        escape(competencia),
        escape(Number(r?.salario ?? 0)),
        escape(Number(r?.total ?? 0)),
        escape(Boolean(r?.pago ?? false)),
        escape(r?.pagoEm ?? '')
      ].join(';'));
    }

    const csv = lines.join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = this.document!.createElement('a');
    const urlBlob = URL.createObjectURL(blob);
    link.setAttribute('href', urlBlob);
    link.setAttribute('download', `pagamentos_${year}_${String(month).padStart(2, '0')}.csv`);
    this.document!.body.appendChild(link);
    link.click();
    this.document!.body.removeChild(link);
    URL.revokeObjectURL(urlBlob);
  }

  abrirModalPagamento(pagamento?: any): void {
    console.log('🔧 Tentando abrir modal pagamento...', { pagamento, template: this.modalPagamentoTemplate });

    if (pagamento) {
      this.pagamentoForm = { ...pagamento };
      this.pagamentoEditando = true;
    } else {
      this.pagamentoForm = {
        id: 0,
        nome: '',
        cargo: '',
        salario: 0,
        comissao: 0,
        total: 0,
        dataPagamento: '',
        pago: false
      };
      this.pagamentoEditando = false;
    }

    // Calcular total automaticamente
    this.calcularTotal();

    try {
      this.dialogRef = this.dialog.open(this.modalPagamentoTemplate, {
        width: '500px',
        disableClose: true,
        panelClass: 'custom-dialog-container'
      });
      console.log('✅ Modal aberto com sucesso!', this.dialogRef);
    } catch (error) {
      console.error('❌ Erro ao abrir modal:', error);
    }
  }

  fecharModalPagamento(): void {
    if (this.dialogRef) {
      this.dialogRef.close();
    }
  }

  calcularTotal(): void {
    this.pagamentoForm.total = (this.pagamentoForm.salario || 0) + (this.pagamentoForm.comissao || 0);
  }

  salvarPagamento(): void {
    this.calcularTotal();

    if (this.pagamentoEditando) {
      // Atualizar pagamento existente
      console.log('📝 Atualizando pagamento:', this.pagamentoForm);
      // Aqui você implementaria a chamada da API para atualizar
      this.refreshPagamentosView();
      this.fecharModalPagamento();
    } else {
      // Adicionar novo pagamento
      console.log('➕ Adicionando novo pagamento:', this.pagamentoForm);
      // Aqui você implementaria a chamada da API para criar
      this.refreshPagamentosView();
      this.fecharModalPagamento();
    }
  }

  marcarComoPago(pagamento: any): void {
    if (confirm('Confirma que o pagamento foi realizado?')) {
      // No Swagger atual não existe /api/Pagamentos/mark-paid.
      // Para evitar quebrar a UI, marcamos localmente.
      pagamento.pago = true;
      pagamento.pagoEm = pagamento.pagoEm ?? new Date().toISOString();
      this.applyAllFilters();
      this.snackBar.open('Pagamento marcado como pago (local).', 'OK', { duration: 4000 });
    }
  }

  excluirPagamento(pagamento: any): void {
    if (confirm('Tem certeza que deseja excluir este pagamento?')) {
      console.log('🗑️ Excluindo pagamento:', pagamento);
      // Aqui você implementaria a chamada da API para excluir
      this.refreshPagamentosView();
    }
  }

  aplicarFiltroNome(): void {
    this.applyAllFilters();
  }

  aplicarFiltroStatus(): void {
    this.applyAllFilters();
  }

  private setupFilters(): void {
    this.dataSourcePagamentos.filterPredicate = (data: any, filter: string): boolean => {
      let parsed: { term?: string; status?: 'all' | 'paid' | 'pending' } = {};
      try {
        parsed = JSON.parse(filter);
      } catch {
        parsed = { term: filter, status: 'all' };
      }

      const term = (parsed.term || '').toLowerCase();
      const status = parsed.status || 'all';

      const nome = String(data?.nome ?? data?.Nome ?? '').toLowerCase();
      const cargo = String(data?.cargo ?? data?.Cargo ?? '').toLowerCase();
      const matchesTerm = !term || nome.includes(term) || cargo.includes(term);

      const isPaid = Boolean(data?.pago ?? data?.Pago ?? false);
      const matchesStatus =
        status === 'all' ||
        (status === 'paid' && isPaid) ||
        (status === 'pending' && !isPaid);

      return matchesTerm && matchesStatus;
    };
  }

  private applyAllFilters(): void {
    const term = this.filtroNome.trim().toLowerCase();
    this.dataSourcePagamentos.filter = JSON.stringify({ term, status: this.statusFilter });
    if (this.paginator) this.paginator.firstPage();
  }

  getCurrentDate(): string {
    return new Date().toLocaleDateString('pt-BR', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    });
  }
}
