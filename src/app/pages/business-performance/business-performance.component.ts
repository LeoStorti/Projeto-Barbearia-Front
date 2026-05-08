import { Component, OnInit, ViewChild } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { MatTableDataSource } from '@angular/material/table';
import { MatButtonModule } from '@angular/material/button';
import { MatTabsModule } from '@angular/material/tabs';
import { MatInputModule } from '@angular/material/input';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { CommonModule } from '@angular/common';
import { MatTableModule } from '@angular/material/table';
import { FormsModule } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatListModule } from '@angular/material/list';
import { BaseChartDirective } from 'ng2-charts';
import { ChartData, ChartOptions, ChartType, registerables, Chart } from 'chart.js';
import { ThemeService } from '../../services/theme.service';
import { getThemePalette, chartPalette, buildLineDataset, barColor } from '../../theme/color-tokens';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatSelectModule } from '@angular/material/select';
import { MatOptionModule, MatNativeDateModule } from '@angular/material/core';
import { MatGridListModule } from '@angular/material/grid-list';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { Observable, forkJoin, of, throwError } from 'rxjs';
import { catchError, timeout } from 'rxjs/operators';
import { ReportService } from '../../services/report.service';
import { MatSnackBarModule } from '@angular/material/snack-bar';
import { KpiCardComponent } from '../../components/kpi-card/kpi-card.component';
import { isDevMode } from '@angular/core';

interface DashboardKPI {
  title: string;
  value: number | string;
  percentage: number;
  icon: string;
  color: 'primary' | 'success' | 'warning' | 'danger';
  format: 'number' | 'currency' | 'percentage';
}

interface AgendamentoDetalhado {
  agendamentoId: number;
  clienteNome: string;
  servicoNome: string;
  profissionalNome: string;
  dataHora: string;
  status: string;
  valor: number;
}

interface ProfissionalPerformance {
  nome: string;
  servicosRealizados: number;
  faturamento: number;
  avaliacaoMedia: number;
  clientesAtendidos: number;
}

interface ServicoPopular {
  nome: string;
  quantidade: number;
  faturamento: number;
  percentual: number;
}


@Component({
  selector: 'app-business-performance',
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
    BaseChartDirective,
    MatToolbarModule,
    MatSelectModule,
    MatOptionModule,
    MatGridListModule,
    MatProgressBarModule,
    MatDatepickerModule,
    MatNativeDateModule,
    MatSnackBarModule,
    KpiCardComponent
  ],
  templateUrl: './business-performance.component.html',
  styleUrls: ['./business-performance.component.css']
})
export class BusinessPerformance implements OnInit {
  private readonly enableMockFallback = isDevMode();

  // KPIs principais
  kpis: DashboardKPI[] = [
    { title: 'Clientes com Vendas', value: 0, percentage: 0, icon: 'people', color: 'primary', format: 'number' },
    { title: 'Vendas Realizadas', value: 0, percentage: 0, icon: 'shopping_cart', color: 'success', format: 'number' },
    { title: 'Faturamento Total', value: 0, percentage: 0, icon: 'payments', color: 'success', format: 'currency' },
    { title: 'Vendas Hoje', value: 0, percentage: 0, icon: 'today', color: 'warning', format: 'number' },
    { title: 'Ticket Médio', value: 0, percentage: 0, icon: 'receipt', color: 'success', format: 'currency' }
  ];

  // Dados para gráficos
  faturamentoMensalData: ChartData<'line'> = { labels: [], datasets: [buildLineDataset('Faturamento', [])] };

  servicosPopularesData: ChartData<'doughnut'> = { labels: [], datasets: [{ data: [], backgroundColor: chartPalette() }] };

  profissionaisPerformanceData: ChartData<'bar'> = { labels: [], datasets: [{ label: 'Faturamento', data: [], backgroundColor: barColor() }] };

  // Configurações dos gráficos (moeda)
  chartOptions: ChartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: true,
        position: 'top'
      },
      tooltip: {
        callbacks: {
          label: (ctx: any) => {
            const raw = (ctx?.parsed?.y ?? ctx?.parsed ?? ctx?.raw ?? 0) as any;
            const value = typeof raw === 'number' ? raw : Number(raw);
            const formatted = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(
              isFinite(value) ? value : 0
            );
            const label = ctx?.dataset?.label ? `${ctx.dataset.label}: ` : '';
            return `${label}${formatted}`;
          }
        }
      }
    },
    scales: {
      y: {
        beginAtZero: true,
        ticks: {
          callback: (value: any) => {
            const n = typeof value === 'number' ? value : Number(value);
            return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(
              isFinite(n) ? n : 0
            );
          }
        }
      }
    }
  };

  doughnutOptions: ChartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'right'
      }
    }
  };

  // Dados das tabelas
  agendamentosRecentes: AgendamentoDetalhado[] = [];
  profissionaisPerformance: ProfissionalPerformance[] = [];
  servicosPopulares: ServicoPopular[] = [];

  // Filtros
  periodoSelecionado: string = '30'; // dias
  customInicio: Date | null = null;
  customFim: Date | null = null;
  profissionalSelecionado: string = 'todos';
  profissionaisList: { profissionalId: number, nome: string }[] = [];

  // Loading states
  isLoadingKPIs = false;
  isLoadingCharts = false;
  isLoadingTables = false;

  // Removed unused imports
  // Removed MatDialogContent, MatDialogActions, MatDialogTitle, UnifiedTableHeaderDirective

  // Added missing properties
  dataSource = new MatTableDataSource<any>();
  clienteCount = 0;
  servicosFinalizadosCount = 0;
  faturamentoTotal = 0;
  servicosAgendadosCount = 0;
agendamentos: any[] = [];
servicos: { nomeServico: string; preco: number }[] = [];
chartData: any = {
  labels: [],
  datasets: []
};
chartType: ChartType = 'line';

  constructor(
    private http: HttpClient,
    private reportService: ReportService,
    private themeService: ThemeService
  ) {
    Chart.register(...registerables);
    // Reagir à mudança de tema para atualizar cores de gráficos
    this.themeService.theme$.subscribe(() => {
      this.aplicarTemaNosGraficos();
    });
  }

  onRecentesOverflow(hasOverflow: boolean) {
    console.debug('[Performance/Recentes] Overflow vertical:', hasOverflow);
  }


  ngOnInit(): void {
    // Iniciar com loading ativo e buscar dados reais da API (com fallback para mock)
    this.isLoadingKPIs = true;
    this.isLoadingCharts = true;
    this.isLoadingTables = true;
    this.carregarDashboard();
  }

  carregarDashboard(): void {
    this.isLoadingKPIs = true;
    this.isLoadingCharts = true;
    this.isLoadingTables = true;
    // Carregar dados em paralelo com fallback para dados mock
    forkJoin({
      clientes: this.http.get<any[]>('/api/Clientes').pipe(
        timeout(4000),
        catchError((error) => {
          if (!this.enableMockFallback) {
            return throwError(() => error);
          }
          console.warn('Erro ao carregar clientes, usando dados mock:', error);
          return of(this.getDadosMockClientes());
        })
      ),
      agendamentos: this.http.get<any[]>('/api/Agendamentos').pipe(
        timeout(4000),
        catchError((error) => {
          if (!this.enableMockFallback) {
            return throwError(() => error);
          }
          console.warn('Erro ao carregar agendamentos, usando dados mock:', error);
          return of(this.getDadosMockAgendamentos());
        })
      ),
      vendas: this.http.get<any[]>('/api/Venda').pipe(
        timeout(5000),
        catchError((error) => {
          if (!this.enableMockFallback) {
            return throwError(() => error);
          }
          console.warn('Erro ao carregar vendas (/api/Venda), usando dados mock:', error);
          return of(this.getDadosMockVendas());
        })
      ),
      servicos: this.http.get<any[]>('/api/Servicos').pipe(
        timeout(4000),
        catchError((error) => {
          if (!this.enableMockFallback) {
            return throwError(() => error);
          }
          console.warn('Erro ao carregar serviços, usando dados mock:', error);
          return of(this.getDadosMockServicos());
        })
      ),
      profissionais: this.http.get<any[]>('/api/Profissionais').pipe(
        timeout(4000),
        catchError((error) => {
          if (!this.enableMockFallback) {
            return throwError(() => error);
          }
          console.warn('Erro ao carregar profissionais, usando dados mock:', error);
          return of(this.getDadosMockProfissionais());
        })
      )
    }).subscribe({
      next: (raw) => {
        // Normalizar estruturas (case/nomes) para consumo consistente
        const vendasArray = Array.isArray(raw.vendas)
          ? raw.vendas
          : this.unwrapArray(raw.vendas);
        const servicosArray = Array.isArray(raw.servicos)
          ? raw.servicos
          : this.unwrapArray(raw.servicos);
        const profissionaisArray = Array.isArray(raw.profissionais)
          ? raw.profissionais
          : this.unwrapArray(raw.profissionais);

        const data = {
          clientes: this.normalizarClientes(this.unwrapArray(raw.clientes)),
          agendamentos: this.normalizarAgendamentos(this.unwrapArray(raw.agendamentos)),
          vendas: this.normalizarVendas(vendasArray),
          servicos: this.normalizarServicos(servicosArray),
          profissionais: this.normalizarProfissionais(profissionaisArray)
        } as any;

        this.processarDados(data);
        // Reaplicar tema nos gráficos após (re)popular dados
        this.aplicarTemaNosGraficos();
        this.profissionaisList = (data.profissionais || []).map((p: any) => ({ profissionalId: p.profissionalId, nome: p.nome }));
        this.isLoadingKPIs = false;
        this.isLoadingCharts = false;
        this.isLoadingTables = false;
      },
      error: (error) => {
        console.error('Erro geral ao carregar dashboard:', error);
        if (this.enableMockFallback) {
          // Mantem comportamento de desenvolvimento sem mascarar erro em producao
          this.carregarDadosMock();
        }
        this.isLoadingKPIs = false;
        this.isLoadingCharts = false;
        this.isLoadingTables = false;
      }
    });
  }

  // Desembrulhar respostas comuns de API quando não retornam arrays diretamente
  private unwrapArray(resp: any): any[] {
    if (Array.isArray(resp)) return resp;
    if (resp && Array.isArray(resp.data)) return resp.data;
    if (resp && Array.isArray(resp.Data)) return resp.Data;
    if (resp && typeof resp === 'object') {
      // Common wrappers
      for (const key of ['result', 'Result', 'items', 'Items', 'value', 'Value', 'vendas', 'Vendas', 'clientes', 'Clientes', 'agendamentos', 'Agendamentos', 'servicos', 'Servicos', 'profissionais', 'Profissionais']) {
        if (Array.isArray((resp as any)[key])) return (resp as any)[key];
      }
      // Fallback: return first array property found
      for (const k of Object.keys(resp)) {
        const val = (resp as any)[k];
        if (Array.isArray(val)) return val;
      }
    }
    return [];
  }

  private processarDados(data: any): void {
    // Validar e garantir que todos os dados sejam arrays
    const clientes = Array.isArray(data.clientes) ? data.clientes : [];
    const agendamentos = Array.isArray(data.agendamentos) ? data.agendamentos : [];
    const vendas = Array.isArray(data.vendas) ? data.vendas : [];
    const servicos = Array.isArray(data.servicos) ? data.servicos : [];
    const profissionais = Array.isArray(data.profissionais) ? data.profissionais : [];

    console.log('Dados processados:', {
      clientes: clientes.length,
      agendamentos: agendamentos.length,
      vendas: vendas.length,
      servicos: servicos.length,
      profissionais: profissionais.length
    });

    // Determinar período selecionado (em dias) e intervalo de datas
    const { inicio, fim } = this.getPeriodoRange(this.periodoSelecionado);
    const { inicio: inicioAnterior, fim: fimAnterior } = this.getPeriodoAnteriorRange(inicio, fim);

    // Filtrar por período
    let vendasFiltradas = vendas.filter((v: any) => this.isWithinRange(v?.dataVenda, inicio, fim));
    let vendasAnterior = vendas.filter((v: any) => this.isWithinRange(v?.dataVenda, inicioAnterior, fimAnterior));

    let agendamentosFiltrados = agendamentos.filter((a: any) => this.isWithinRange(a?.dataHora, inicio, fim));

    // Filtrar por profissional quando aplicável
    if (this.profissionalSelecionado && this.profissionalSelecionado !== 'todos') {
      const profId = Number(this.profissionalSelecionado);
      if (!isNaN(profId)) {
        vendasFiltradas = vendasFiltradas.filter((v: any) => v?.profissionalId == profId);
        vendasAnterior = vendasAnterior.filter((v: any) => v?.profissionalId == profId);
        agendamentosFiltrados = agendamentosFiltrados.filter((a: any) => a?.profissionalId == profId);
      }
    }

    // Calcular KPIs (baseado no filtro + comparação com período anterior)
    this.calcularKPIs(clientes, agendamentosFiltrados, vendasFiltradas, vendasAnterior);

    // Preparar dados dos gráficos
    // Faturamento: respeita o período selecionado (7/30/90 dias)
    // e respeita filtro de profissional quando aplicado.
    this.prepararGraficoFaturamento(vendas, inicio, fim, this.profissionalSelecionado);
    this.prepararGraficoServicos(agendamentosFiltrados, servicos);
    this.prepararGraficoProfissionais(agendamentosFiltrados, profissionais, vendasFiltradas);

    // Preparar dados das tabelas (baseado no filtro)
    this.prepararAgendamentosRecentes(agendamentosFiltrados, clientes, servicos, profissionais);
    this.prepararPerformanceProfissionais(agendamentosFiltrados, profissionais, vendasFiltradas);
    this.prepararServicosPopulares(agendamentosFiltrados, servicos, vendasFiltradas);
  }

  private calcularKPIs(clientes: any[], agendamentos: any[], vendas: any[], vendasAnterior: any[]): void {
    if (!Array.isArray(clientes)) clientes = [];
    if (!Array.isArray(agendamentos)) agendamentos = [];
    if (!Array.isArray(vendas)) vendas = [];
    if (!Array.isArray(vendasAnterior)) vendasAnterior = [];

    try {
      const totalAtual = vendas.reduce((sum, v) => sum + this.toNumberSafe(v?.totalVenda), 0);
      const totalAnterior = vendasAnterior.reduce((sum, v) => sum + this.toNumberSafe(v?.totalVenda), 0);

      const clientesComVendasAtual = new Set(vendas.map(v => v?.clienteId).filter((id: any) => id != null)).size;
      const clientesComVendasAnterior = new Set(vendasAnterior.map(v => v?.clienteId).filter((id: any) => id != null)).size;

      const vendasAtual = vendas.length;
      const vendasAnteriorCount = vendasAnterior.length;

      const ticketAtual = vendasAtual > 0 ? totalAtual / vendasAtual : 0;
      const ticketAnterior = vendasAnteriorCount > 0 ? totalAnterior / vendasAnteriorCount : 0;

      // Vendas hoje vs ontem (respeita filtro de profissional pois vendas já chegam filtradas)
      const hoje = new Date();
      const ontem = new Date(hoje);
      ontem.setDate(hoje.getDate() - 1);

      const isSameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString();
      const vendasHoje = vendas.filter(v => {
        const dt = v?.dataVenda ? new Date(v.dataVenda) : null;
        return dt && !isNaN(dt.getTime()) && isSameDay(dt, hoje);
      }).length;
      const vendasOntem = vendas.filter(v => {
        const dt = v?.dataVenda ? new Date(v.dataVenda) : null;
        return dt && !isNaN(dt.getTime()) && isSameDay(dt, ontem);
      }).length;

      // Agendamentos pendentes (mantido para outros usos, caso queira exibir depois)
      const statusTexto = (s: any) => String(s || '').trim().toLowerCase();
      const isPendente = (a: any) => {
        const st = statusTexto(a?.status);
        if (!st) return true;
        const pendentes = ['agendado', 'pendente', 'confirmado', 'em andamento', 'atrasado'];
        const naoPendentes = ['finalizado', 'cancelado', 'concluido', 'concluído'];
        if (naoPendentes.includes(st)) return false;
        if (pendentes.includes(st)) return true;
        return true;
      };
      this.servicosAgendadosCount = agendamentos.filter(isPendente).length;

      // KPI 1: Clientes com vendas
      this.kpis[0].value = clientesComVendasAtual;
      this.kpis[0].percentage = this.percentChange(clientesComVendasAtual, clientesComVendasAnterior);

      // KPI 2: Vendas realizadas
      this.kpis[1].value = vendasAtual;
      this.kpis[1].percentage = this.percentChange(vendasAtual, vendasAnteriorCount);

      // KPI 3: Faturamento total
      this.kpis[2].value = totalAtual;
      this.kpis[2].percentage = this.percentChange(totalAtual, totalAnterior);
      this.faturamentoTotal = totalAtual;

      // KPI 4: Vendas hoje
      this.kpis[3].value = vendasHoje;
      this.kpis[3].percentage = this.percentChange(vendasHoje, vendasOntem);

      // KPI 5: Ticket médio
      this.kpis[4].value = ticketAtual;
      this.kpis[4].percentage = this.percentChange(ticketAtual, ticketAnterior);

      // Compatibilidade com campos antigos (caso ainda sejam usados em algum lugar)
      this.servicosFinalizadosCount = vendasAtual;
      this.clienteCount = clientesComVendasAtual;
    } catch (error) {
      console.error('Erro ao calcular KPIs:', error);
      this.kpis.forEach(kpi => {
        kpi.value = 0;
        kpi.percentage = 0;
      });
      this.faturamentoTotal = 0;
      this.servicosFinalizadosCount = 0;
      this.clienteCount = 0;
    }
  }

  private percentChange(current: number, previous: number): number {
    if (!isFinite(current)) current = 0;
    if (!isFinite(previous)) previous = 0;
    if (previous === 0) return 0;
    return Math.round(((current - previous) / previous) * 100);
  }

  private prepararGraficoFaturamento(vendas: any[], inicio: Date, fim: Date, profissionalSelecionado?: string): void {
    if (!Array.isArray(vendas)) vendas = [];

    let vendasPeriodo = vendas.filter(v => this.isWithinRange(v?.dataVenda, inicio, fim));

    // Opcional: respeitar filtro de profissional
    if (profissionalSelecionado && profissionalSelecionado !== 'todos') {
      const profId = Number(profissionalSelecionado);
      if (!isNaN(profId)) {
        vendasPeriodo = vendasPeriodo.filter(v => v?.profissionalId == profId);
      }
    }

    // Sem vendas no período -> manter vazio para mostrar empty-state
    if (vendasPeriodo.length === 0) {
      this.faturamentoMensalData = {
        labels: [],
        datasets: [
          {
            ...(this.faturamentoMensalData.datasets[0] as any),
            data: []
          }
        ]
      };
      return;
    }

    const faturamentoPorMes: { [key: string]: number } = {};

    vendasPeriodo.forEach(venda => {
      if (venda && venda.dataVenda) {
        try {
          const data = new Date(venda.dataVenda);
          const mesAno = this.formatMesAno(data);

          if (!faturamentoPorMes[mesAno]) {
            faturamentoPorMes[mesAno] = 0;
          }
          faturamentoPorMes[mesAno] += this.toNumberSafe(venda.totalVenda);
        } catch (error) {
          console.warn('Erro ao processar data da venda:', venda, error);
        }
      }
    });

    // Labels contínuas por mês dentro do período (inclui meses sem vendas com zero)
    const mesesOrdenados = this.getMesesNoPeriodo(inicio, fim);
    const datasetValues = mesesOrdenados.map(mes => faturamentoPorMes[mes] ?? 0);
    this.faturamentoMensalData = {
      labels: [...mesesOrdenados],
      datasets: [
        {
          ...(this.faturamentoMensalData.datasets[0] as any),
          data: datasetValues
        }
      ]
    };
  }

  private formatMesAno(d: Date): string {
    const dt = new Date(d);
    const mes = String(dt.getMonth() + 1).padStart(2, '0');
    const ano = dt.getFullYear();
    return `${mes}/${ano}`;
  }

  private startOfMonth(d: Date): Date {
    return new Date(d.getFullYear(), d.getMonth(), 1, 0, 0, 0, 0);
  }

  private getMesesNoPeriodo(inicio: Date, fim: Date): string[] {
    const labels: string[] = [];
    let cursor = this.startOfMonth(inicio);
    const end = this.startOfMonth(fim);

    while (cursor.getTime() <= end.getTime()) {
      labels.push(this.formatMesAno(cursor));
      cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1, 0, 0, 0, 0);
    }
    return labels;
  }

  private prepararGraficoServicos(agendamentos: any[], servicos: any[]): void {
    if (!Array.isArray(agendamentos)) agendamentos = [];
    if (!Array.isArray(servicos)) servicos = [];

    const servicosCount: { [key: number]: number } = {};

    agendamentos.forEach(agendamento => {
      if (agendamento && agendamento.servicoId) {
        const servicoId = agendamento.servicoId;
        servicosCount[servicoId] = (servicosCount[servicoId] || 0) + 1;
      }
    });

    // Pegar os 5 serviços mais populares
    const topServicos = Object.entries(servicosCount)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 5);

    const labels = topServicos.map(([servicoId]) => {
      const servico = servicos.find(s => s && s.servicoId == servicoId);
      return servico ? servico.nomeServico : `Serviço ${servicoId}`;
    });
    const values = topServicos.map(([,count]) => count);
    this.servicosPopularesData = {
      labels,
      datasets: [
        {
          ...(this.servicosPopularesData.datasets[0] as any),
          data: values
        }
      ]
    };
  }

  private prepararGraficoProfissionais(agendamentos: any[], profissionais: any[], vendas: any[]): void {
    if (!Array.isArray(agendamentos)) agendamentos = [];
    if (!Array.isArray(profissionais)) profissionais = [];
    if (!Array.isArray(vendas)) vendas = [];

    const faturamentoPorProfissional: { [key: number]: number } = {};

    // Calcular faturamento real baseado diretamente nas vendas
    vendas.forEach(venda => {
      if (venda && venda.profissionalId && venda.totalVenda) {
        const profissionalId = venda.profissionalId;
        const valorVenda = this.toNumberSafe(venda.totalVenda);

        faturamentoPorProfissional[profissionalId] = (faturamentoPorProfissional[profissionalId] || 0) + valorVenda;
      }
    });

    const profLabels = Object.keys(faturamentoPorProfissional).map(profId => {
      const prof = profissionais.find(p => p && p.profissionalId == profId);
      return prof ? prof.nome : `Profissional ${profId}`;
    });
    const profValues = Object.values(faturamentoPorProfissional);
    this.profissionaisPerformanceData = {
      labels: profLabels,
      datasets: [
        {
          ...(this.profissionaisPerformanceData.datasets[0] as any),
          data: profValues
        }
      ]
    };
  }

  // Conversão robusta de valores monetários (suporta "R$ 1.234,56" e variantes)
  private toNumberSafe(value: any): number {
    if (value == null) return 0;
    if (typeof value === 'number' && isFinite(value)) return value;
    if (typeof value === 'string') {
      // Remove símbolo de moeda, espaços e normaliza separadores
      const normalized = value
        .replace(/[^0-9.,-]/g, '') // mantém apenas dígitos, vírgula, ponto e sinal
        .replace(/\.(?=\d{3}(\D|$))/g, '') // remove pontos como separador de milhar
        .replace(',', '.'); // converte vírgula decimal para ponto
      const n = parseFloat(normalized);
      return isNaN(n) ? 0 : n;
    }
    // Objetos/boolean etc.
    try {
      const n = Number(value);
      return isNaN(n) ? 0 : n;
    } catch {
      return 0;
    }
  }

  private prepararAgendamentosRecentes(agendamentos: any[], clientes: any[], servicos: any[], profissionais: any[]): void {
    if (!Array.isArray(agendamentos)) agendamentos = [];
    if (!Array.isArray(clientes)) clientes = [];
    if (!Array.isArray(servicos)) servicos = [];
    if (!Array.isArray(profissionais)) profissionais = [];

    this.agendamentosRecentes = agendamentos
      .filter(agendamento => agendamento && agendamento.dataHora) // Filtrar itens válidos
      .sort((a, b) => {
        try {
          return new Date(b.dataHora).getTime() - new Date(a.dataHora).getTime();
        } catch {
          return 0;
        }
      })
      .slice(0, 10)
      .map(agendamento => {
        const cliente = clientes.find(c => c && String(c.clienteId) === String(agendamento.clienteId))
          || { nome: agendamento.clienteNome ?? agendamento.ClienteNome };
        const servico = servicos.find(s => s && String(s.servicoId) === String(agendamento.servicoId));
        const profissional = profissionais.find(p => p && String(p.profissionalId) === String(agendamento.profissionalId))
          || { nome: agendamento.profissionalNome ?? agendamento.ProfissionalNome };

        return {
          agendamentoId: agendamento.agendamentoId || 0,
          clienteNome: cliente?.nome || 'Cliente não encontrado',
          servicoNome: servico?.nomeServico || 'Serviço não encontrado',
          profissionalNome: profissional?.nome || 'Profissional não encontrado',
          dataHora: agendamento.dataHora || '',
          status: agendamento.status || 'Indefinido',
          valor: Number(servico?.preco || 0)
        };
      });
  }

  private prepararPerformanceProfissionais(agendamentos: any[], profissionais: any[], vendas: any[]): void {
    if (!Array.isArray(agendamentos)) agendamentos = [];
    if (!Array.isArray(profissionais)) profissionais = [];
    if (!Array.isArray(vendas)) vendas = [];

    // ===== ANÁLISE BASEADA DIRETAMENTE NA TABELA DE VENDAS =====

    // Agrupar vendas por profissional
    const vendasPorProfissional: { [key: number]: any[] } = {};

    vendas.forEach(venda => {
      if (venda && venda.profissionalId) {
        const profissionalId = venda.profissionalId;

        if (!vendasPorProfissional[profissionalId]) {
          vendasPorProfissional[profissionalId] = [];
        }

        vendasPorProfissional[profissionalId].push(venda);
      }
    });

    this.profissionaisPerformance = profissionais
      .filter(prof => prof && prof.profissionalId)
      .map(prof => {
        const vendasDoProfissional = vendasPorProfissional[prof.profissionalId] || [];

        // Calcular métricas baseadas nas vendas
        const servicosRealizados = vendasDoProfissional.length;
        const faturamentoReal = vendasDoProfissional.reduce((sum, venda) => {
          return sum + Number(venda.totalVenda || 0);
        }, 0);

        // Clientes únicos que fizeram compras com este profissional
        const clientesUnicos = new Set(
          vendasDoProfissional.map(venda => venda.clienteId).filter(id => id)
        ).size;

        return {
          nome: prof.nome || 'Nome não informado',
          servicosRealizados,
          faturamento: faturamentoReal,
          avaliacaoMedia: 4.5 + Math.random() * 0.5, // Placeholder
          clientesAtendidos: clientesUnicos
        };
      })
      .sort((a, b) => b.faturamento - a.faturamento);
  }

  private prepararServicosPopulares(agendamentos: any[], servicos: any[], vendas: any[]): void {
    if (!Array.isArray(agendamentos)) agendamentos = [];
    if (!Array.isArray(servicos)) servicos = [];
    if (!Array.isArray(vendas)) vendas = [];
    // ===== ANÁLISE BASEADA DIRETAMENTE NA TABELA DE VENDAS =====

    const servicosStats: { [key: number]: { quantidade: number, faturamento: number } } = {};

    // Processar vendas diretamente
    vendas.forEach((venda, index) => {
      if (venda && venda.servicoId && venda.totalVenda) {
        const servicoId = venda.servicoId;

        if (!servicosStats[servicoId]) {
          servicosStats[servicoId] = { quantidade: 0, faturamento: 0 };
        }

        servicosStats[servicoId].quantidade++;
        servicosStats[servicoId].faturamento += Number(venda.totalVenda);
      }
    });

    const totalServicos = Object.values(servicosStats).reduce((sum, stat) => sum + stat.quantidade, 0);

    this.servicosPopulares = Object.entries(servicosStats)
      .map(([servicoId, stats]) => {
        const servico = servicos.find(s => s && s.servicoId == servicoId);
        return {
          nome: servico?.nomeServico || `Serviço ${servicoId}`,
          quantidade: stats.quantidade,
          faturamento: stats.faturamento,
          percentual: totalServicos > 0 ? (stats.quantidade / totalServicos) * 100 : 0
        };
      })
      .sort((a, b) => b.faturamento - a.faturamento) // Ordenar por faturamento, não quantidade
      .slice(0, 5);

    console.log(`🎯 Resultado: ${this.servicosPopulares.length} serviços populares encontrados`);
  }

  onPeriodoChange(): void {
    this.carregarDashboard();
  }

  onCustomRangeChange(): void {
    if (this.periodoSelecionado === 'custom') {
      this.carregarDashboard();
    }
  }

  onProfissionalChange(): void {
    this.carregarDashboard();
  }

  getStatusBadgeVariant(status: string): string {
    const st = this.normalizeStatus(status);
    if (!st) return 'status-muted';
    if (['finalizado', 'concluido', 'concluído', 'pago'].includes(st)) return 'status-success';
    if (['cancelado', 'cancelada', 'nao compareceu', 'não compareceu'].includes(st)) return 'status-danger';
    if (['agendado', 'pendente', 'confirmado', 'em andamento', 'atrasado'].includes(st)) return 'status-warning';
    return 'status-muted';
  }

  formatStatus(status: string): string {
    const st = this.normalizeStatus(status);
    if (!st) return 'Pendente';
    // manter a primeira letra maiúscula e preservar acentos comuns
    return st
      .split(' ')
      .map(w => (w ? w[0].toUpperCase() + w.slice(1) : w))
      .join(' ');
  }

  private normalizeStatus(status: any): string {
    return String(status || '').trim().toLowerCase();
  }

  formatarValor(valor: number | string, formato: string): string {
    if (typeof valor === 'string') return valor;

    switch (formato) {
      case 'currency':
        return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(valor);
      case 'percentage':
        return `${valor}%`;
      default:
        return valor.toString();
    }
  }

  private aplicarTemaNosGraficos(): void {
    // Atualiza cores das paletas quando tema muda
    try {
      const palette = chartPalette();
      // Doughnut
      if (this.servicosPopularesData?.datasets?.[0]) {
        (this.servicosPopularesData.datasets[0] as any).backgroundColor = palette;
      }
      // Bar
      if (this.profissionaisPerformanceData?.datasets?.[0]) {
        (this.profissionaisPerformanceData.datasets[0] as any).backgroundColor = palette[0];
      }
      // Line
      if (this.faturamentoMensalData?.datasets?.[0]) {
        const p = getThemePalette();
        (this.faturamentoMensalData.datasets[0] as any).borderColor = p.primary;
        (this.faturamentoMensalData.datasets[0] as any).backgroundColor = p.primary + '20';
      }
    } catch (e) {
      console.warn('Falha ao aplicar tema nos gráficos', e);
    }
  }

  getIconColor(color: string): string {
    const map: Record<string,string> = {
      primary: getThemePalette().primary,
      success: getThemePalette().success,
      warning: getThemePalette().warning,
      danger: getThemePalette().error
    };
    return map[color] || map['primary'];
  }

  exportarRelatorio(): void {
    console.log('Exportando relatório...');

    // Preparar dados para o relatório
    const reportData = {
      faturamento: this.agendamentosRecentes.map(ag => ({
        data: new Date(),
        clienteNome: ag.clienteNome,
        servicoNome: ag.servicoNome,
        profissionalNome: ag.profissionalNome,
        valor: ag.valor,
        status: ag.status,
        clienteId: ag.agendamentoId
      }))
    };

    // Gerar relatório HTML para impressão
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 30); // Últimos 30 dias
    const endDate = new Date();

    this.reportService.generateFaturamentoReport(startDate, endDate, reportData.faturamento);
  }

  exportarCSV(): void {
    const csvData = this.agendamentosRecentes.map(ag => ({
      'Data': new Date(ag.dataHora).toLocaleDateString('pt-BR'),
      'Cliente': ag.clienteNome,
      'Serviço': ag.servicoNome,
      'Profissional': ag.profissionalNome,
      'Status': ag.status,
      'Valor': ag.valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
    }));

    this.reportService.generateCSVReport(csvData, 'relatorio_performance');
  }

  exportarRelatorioComProfissionais(): void {
    console.log('Exportando relatório com dados dos profissionais...');

    // Preparar dados para o relatório com informações dos profissionais
    const reportData = this.agendamentosRecentes.map(ag => ({
      data: new Date(),
      clienteNome: ag.clienteNome,
      servicoNome: ag.servicoNome,
      profissionalNome: ag.profissionalNome,
      valor: ag.valor,
      status: ag.status,
      clienteId: ag.agendamentoId
    }));

    // Gerar relatório melhorado com dados dos profissionais
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 30); // Últimos 30 dias
    const endDate = new Date();

    this.reportService.generateFaturamentoComProfissionaisReport(startDate, endDate, reportData);
  }

  atualizarDados(): void {
    this.carregarDashboard();
  }

  // ===== Normalizadores para dados de API (case-insensitive) =====
  private normalizarVendas(vendas: any[]): any[] {
    return (vendas || []).map(v => ({
      vendaId: v.vendaId ?? v.VendaId ?? v.id ?? v.Id ?? v.vendaID ?? v.VendaID,
      clienteId: v.clienteId ?? v.ClienteId ?? v.clienteID ?? v.ClienteID,
      dataVenda: v.dataVenda ?? v.DataVenda ?? v.data ?? v.Data ?? v.dataHora ?? v.DataHora ?? v.createdAt ?? v.CreatedAt,
      totalVenda: v.totalVenda ?? v.TotalVenda ?? v.valorTotal ?? v.ValorTotal ?? v.total ?? v.Total ?? v.precoTotal ?? v.PrecoTotal ?? v.amount ?? v.Amount ?? v.valor ?? v.Valor ?? 0,
      profissionalId: v.profissionalId ?? v.ProfissionalId ?? v.funcionarioId ?? v.FuncionarioId ?? v.colaboradorId ?? v.ColaboradorId ?? v.vendedorId ?? v.VendedorId,
      servicoId: v.servicoId ?? v.ServicoId ?? v.servicoID ?? v.ServicoID
    }));
  }

  private normalizarServicos(servicos: any[]): any[] {
    return (servicos || []).map(s => ({
      servicoId: s.servicoId ?? s.ServicoId ?? s.id ?? s.Id,
      nomeServico: s.nomeServico ?? s.NomeServico ?? s.nome ?? s.Nome,
      preco: s.preco ?? s.Preco ?? s.price ?? s.Price ?? 0,
      duracao: s.duracao ?? s.Duracao ?? 0,
      categoria: s.categoria ?? s.Categoria
    }));
  }

  private normalizarClientes(clientes: any[]): any[] {
    return (clientes || []).map(c => ({
      clienteId: c.clienteId ?? c.ClienteId ?? c.id ?? c.Id ?? c.clienteID ?? c.ClienteID,
      nome: c.nome ?? c.Nome ?? c.name ?? c.Name,
      telefone: c.telefone ?? c.Telefone ?? c.phone ?? c.Phone,
      email: c.email ?? c.Email
    }));
  }

  private normalizarAgendamentos(agendamentos: any[]): any[] {
    return (agendamentos || []).map(a => ({
      agendamentoId: a.agendamentoId ?? a.AgendamentoId ?? a.id ?? a.Id,
      clienteId: a.clienteId ?? a.ClienteId,
      servicoId: a.servicoId ?? a.ServicoId,
      profissionalId: a.profissionalId ?? a.ProfissionalId,
      dataHora: a.dataHora ?? a.DataHora ?? a.horario ?? a.Horario,
      status: a.status ?? a.Status ?? ''
    }));
  }

  private normalizarProfissionais(profissionais: any[]): any[] {
    return (profissionais || []).map(p => ({
      profissionalId: p.profissionalId ?? p.ProfissionalId ?? p.id ?? p.Id,
      nome: p.nome ?? p.Nome,
      especialidade: p.especialidade ?? p.Especialidade ?? p.especializacao ?? p.Especializacao,
      telefone: p.telefone ?? p.Telefone,
      email: p.email ?? p.Email
    }));
  }

  // ===== Helpers de período/data =====
  private getPeriodoRange(periodo: string): { inicio: Date, fim: Date } {
    const hoje = new Date();
    const fimHoje = this.endOfDay(hoje);

    if (periodo === 'custom') {
      if (this.customInicio && this.customFim) {
        let inicio = this.startOfDay(this.customInicio);
        let fim = this.endOfDay(this.customFim);
        if (inicio.getTime() > fim.getTime()) {
          const tmp = inicio;
          inicio = this.startOfDay(fim);
          fim = this.endOfDay(tmp);
        }
        return { inicio, fim };
      }
      // fallback seguro quando o usuário ainda não preencheu as datas
      const inicioFallback = this.startOfDay(new Date(hoje.getTime() - 30 * 24 * 60 * 60 * 1000));
      return { inicio: inicioFallback, fim: fimHoje };
    }

    const fim = fimHoje;
    let dias = parseInt(periodo, 10);
    if (isNaN(dias)) dias = 30;
    const inicio = this.startOfDay(new Date(hoje.getTime() - dias * 24 * 60 * 60 * 1000));
    return { inicio, fim };
  }

  private getPeriodoAnteriorRange(inicio: Date, fim: Date): { inicio: Date, fim: Date } {
    const ms = fim.getTime() - inicio.getTime();
    // período anterior imediatamente antes do atual
    const fimAnterior = new Date(inicio.getTime() - 1);
    const inicioAnterior = new Date(fimAnterior.getTime() - ms);
    return { inicio: this.startOfDay(inicioAnterior), fim: this.endOfDay(fimAnterior) };
  }

  private startOfDay(d: Date): Date {
    const dt = new Date(d);
    dt.setHours(0, 0, 0, 0);
    return dt;
  }

  private endOfDay(d: Date): Date {
    const dt = new Date(d);
    dt.setHours(23, 59, 59, 999);
    return dt;
  }

  private isWithinRange(dateLike: any, inicio: Date, fim: Date): boolean {
    if (!dateLike) return false;
    try {
      const dt = new Date(dateLike);
      if (isNaN(dt.getTime())) return false;
      return dt >= inicio && dt <= fim;
    } catch {
      return false;
    }
  }

  // Métodos para dados mock em caso de erro da API
  private carregarDadosMock(): void {
    const dadosMock = {
      clientes: this.getDadosMockClientes(),
      agendamentos: this.getDadosMockAgendamentos(),
      vendas: this.getDadosMockVendas(),
      servicos: this.getDadosMockServicos(),
      profissionais: this.getDadosMockProfissionais()
    };

    console.log('Carregando dados mock devido a erro na API');
    this.processarDados(dadosMock);
  }

  private getDadosMockClientes(): any[] {
    return [
      { clienteId: 1, nome: 'João Silva', telefone: '11999999999', email: 'joao@email.com', dataAtivo: '2025-01-15' },
      { clienteId: 2, nome: 'Maria Santos', telefone: '11888888888', email: 'maria@email.com', dataAtivo: '2025-02-10' },
      { clienteId: 3, nome: 'Pedro Costa', telefone: '11777777777', email: 'pedro@email.com', dataAtivo: '2025-03-05' },
      { clienteId: 4, nome: 'Ana Oliveira', telefone: '11666666666', email: 'ana@email.com', dataAtivo: '2025-01-20' },
      { clienteId: 5, nome: 'Carlos Lima', telefone: '11555555555', email: 'carlos@email.com', dataAtivo: '2025-02-25' }
    ];
  }

  private getDadosMockAgendamentos(): any[] {
    return [
      // Agendamentos básicos
      { agendamentoId: 1, clienteId: 1, servicoId: 1, profissionalId: 1, dataHora: '2025-07-31T10:00:00', status: 'Finalizado' },
      { agendamentoId: 2, clienteId: 2, servicoId: 2, profissionalId: 2, dataHora: '2025-07-31T11:00:00', status: 'Agendado' },
      { agendamentoId: 3, clienteId: 3, servicoId: 1, profissionalId: 1, dataHora: '2025-07-30T14:00:00', status: 'Finalizado' },
      { agendamentoId: 4, clienteId: 4, servicoId: 3, profissionalId: 3, dataHora: '2025-07-30T15:00:00', status: 'Finalizado' },
      { agendamentoId: 5, clienteId: 5, servicoId: 2, profissionalId: 2, dataHora: '2025-07-29T16:00:00', status: 'Finalizado' },
      { agendamentoId: 6, clienteId: 1, servicoId: 1, profissionalId: 1, dataHora: '2025-07-31T16:00:00', status: 'Agendado' },

      // Agendamentos adicionais para corresponder às vendas
      { agendamentoId: 7, clienteId: 2, servicoId: 1, profissionalId: 1, dataHora: '2025-07-25T10:00:00', status: 'Finalizado' },
      { agendamentoId: 8, clienteId: 3, servicoId: 2, profissionalId: 2, dataHora: '2025-07-20T11:00:00', status: 'Finalizado' },
      { agendamentoId: 9, clienteId: 4, servicoId: 3, profissionalId: 3, dataHora: '2025-07-15T14:00:00', status: 'Finalizado' },
      { agendamentoId: 10, clienteId: 5, servicoId: 1, profissionalId: 1, dataHora: '2025-07-10T15:00:00', status: 'Finalizado' },
      { agendamentoId: 11, clienteId: 1, servicoId: 2, profissionalId: 2, dataHora: '2025-07-05T16:00:00', status: 'Finalizado' },
      { agendamentoId: 12, clienteId: 2, servicoId: 3, profissionalId: 3, dataHora: '2025-07-31T09:00:00', status: 'Finalizado' },
      { agendamentoId: 13, clienteId: 3, servicoId: 1, profissionalId: 1, dataHora: '2025-07-31T17:00:00', status: 'Finalizado' },
      { agendamentoId: 14, clienteId: 4, servicoId: 5, profissionalId: 3, dataHora: '2025-06-15T10:00:00', status: 'Finalizado' },
      { agendamentoId: 15, clienteId: 5, servicoId: 4, profissionalId: 2, dataHora: '2025-05-10T11:00:00', status: 'Finalizado' }
    ];
  }

  private getDadosMockVendas(): any[] {
    return [
      // Vendas do período atual (julho 2025) - valores garantidos
      { vendaId: 40, clienteId: 9, dataVenda: '2025-07-23T09:00:00.000', totalVenda: 80.00, profissionalId: 1, servicoId: 13 },
      { vendaId: 41, clienteId: 14, dataVenda: '2025-07-24T12:00:00.000', totalVenda: 80.00, profissionalId: 1, servicoId: 13 },
      { vendaId: 42, clienteId: 17, dataVenda: '2025-07-25T14:30:00.000', totalVenda: 60.00, profissionalId: 1, servicoId: 16 },
      { vendaId: 43, clienteId: 5, dataVenda: '2025-07-23T09:30:00.000', totalVenda: 25.00, profissionalId: 2, servicoId: 12 },
      { vendaId: 44, clienteId: 7, dataVenda: '2025-07-24T08:30:00.000', totalVenda: 30.00, profissionalId: 1, servicoId: 11 },
      { vendaId: 45, clienteId: 13, dataVenda: '2025-07-26T12:00:00.000', totalVenda: 80.00, profissionalId: 1, servicoId: 13 },
      { vendaId: 46, clienteId: 9, dataVenda: '2025-07-24T09:00:00.000', totalVenda: 80.00, profissionalId: 2, servicoId: 13 },
      { vendaId: 47, clienteId: 17, dataVenda: '2025-07-28T15:00:00.000', totalVenda: 40.00, profissionalId: 2, servicoId: 20 },
      { vendaId: 48, clienteId: 12, dataVenda: '2025-07-25T11:30:00.000', totalVenda: 50.00, profissionalId: 3, servicoId: 14 },
      { vendaId: 49, clienteId: 15, dataVenda: '2025-07-27T14:00:00.000', totalVenda: 60.00, profissionalId: 3, servicoId: 16 },
      // Vendas de hoje (31 de julho) - valores garantidos
      { vendaId: 70, clienteId: 1, dataVenda: '2025-07-31T10:00:00.000', totalVenda: 45.00, profissionalId: 1, servicoId: 1 },
      { vendaId: 71, clienteId: 2, dataVenda: '2025-07-31T14:00:00.000', totalVenda: 70.00, profissionalId: 3, servicoId: 3 },
      { vendaId: 72, clienteId: 3, dataVenda: '2025-07-31T16:00:00.000', totalVenda: 35.00, profissionalId: 2, servicoId: 2 },
      // Vendas antigas (fora do período)
      { vendaId: 60, clienteId: 17, dataVenda: '2025-06-16T09:00:00.000', totalVenda: 30.00, profissionalId: 2, servicoId: 11 },
      { vendaId: 61, clienteId: 9, dataVenda: '2025-05-23T10:30:00.000', totalVenda: 30.00, profissionalId: 3, servicoId: 11 },
      // Vendas adicionais para teste
      { vendaId: 100, clienteId: 1, dataVenda: '2025-07-15T10:00:00.000', totalVenda: 100.00, profissionalId: 1, servicoId: 1 },
      { vendaId: 101, clienteId: 2, dataVenda: '2025-07-16T11:00:00.000', totalVenda: 200.00, profissionalId: 2, servicoId: 2 },
      { vendaId: 102, clienteId: 3, dataVenda: '2025-07-17T12:00:00.000', totalVenda: 150.00, profissionalId: 3, servicoId: 3 }
    ];
  }

  private getDadosMockServicos(): any[] {
    return [
      { servicoId: 1, nomeServico: 'Corte Tradicional', preco: 45.00, duracao: 30 },
      { servicoId: 2, nomeServico: 'Barba Completa', preco: 35.00, duracao: 25 },
      { servicoId: 3, nomeServico: 'Corte + Barba', preco: 70.00, duracao: 60 },
      { servicoId: 11, nomeServico: 'Corte Simples', preco: 30.00, duracao: 20 },
      { servicoId: 12, nomeServico: 'Acabamento', preco: 25.00, duracao: 15 },
      { servicoId: 13, nomeServico: 'Corte Premium', preco: 80.00, duracao: 45 },
      { servicoId: 14, nomeServico: 'Barba Estilizada', preco: 50.00, duracao: 35 },
      { servicoId: 15, nomeServico: 'Tratamento Completo', preco: 150.00, duracao: 90 },
      { servicoId: 16, nomeServico: 'Corte Moderno', preco: 60.00, duracao: 40 },
      { servicoId: 20, nomeServico: 'Retoque', preco: 40.00, duracao: 20 }
    ];
  }

  private getDadosMockProfissionais(): any[] {
    return [
      { profissionalId: 1, nome: 'Marcos Barbeiro', especialidade: 'Cortes Clássicos', telefone: '11444444444', email: 'marcos@barbearia.com' },
      { profissionalId: 2, nome: 'Roberto Silva', especialidade: 'Barbas', telefone: '11333333333', email: 'roberto@barbearia.com' },
      { profissionalId: 3, nome: 'Anderson Costa', especialidade: 'Cortes Modernos', telefone: '11222222222', email: 'anderson@barbearia.com' }
    ];
  }
}
