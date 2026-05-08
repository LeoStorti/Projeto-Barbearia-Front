import { Component, OnInit } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { MatTableDataSource } from '@angular/material/table';
import { MatButtonModule } from '@angular/material/button';
import { MatTabsModule } from '@angular/material/tabs';
import { MatInputModule } from '@angular/material/input';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { CommonModule } from '@angular/common';
import { MatTableModule } from '@angular/material/table';
import { FormsModule } from '@angular/forms';
import { isDevMode } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { AuthService } from '../../services/auth.service';
import { MatCardModule } from '@angular/material/card';
import { ReportService } from '../../services/report.service';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatSnackBarModule } from '@angular/material/snack-bar';
import { MatIconModule } from '@angular/material/icon';
import { AgendamentosService } from '../../services/agendamentos.service';
import { PagamentosService } from '../../services/pagamentos.service';
import { ProfissionaisService } from '../../services/profissionais.service';
import { ProdutosService } from '../../services/produtos.service';
import { forkJoin, of, catchError, map } from 'rxjs';


export interface Clientes {
  ClienteId: number;
  NomeCliente: string;
  CNPJCliente: string;
  EnderecoCliente: string;
  TelefoneCliente: string;
}

type VendaApi = any;

type VendaNormalizada = {
  vendaId?: number;
  clienteId?: number;
  dataVenda?: string;
  totalVenda: number;
  profissionalId?: number;
  servicoId?: number;
  raw: VendaApi;
};

type ProdutoCatalogo = {
  ProdutoId?: number;
  id?: number;
  NomeProduto?: string;
  nomeProduto?: string;
  Categoria?: string;
  categoria?: string;
  PrecoVenda?: number;
  precoVenda?: number;
};

type AgendamentoNormalizado = {
  profissionalId?: number;
  servico?: string;
  status?: string;
  data?: string;
  raw: any;
};

@Component({
  selector: 'app-business-relatorios',
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
    MatSnackBarModule,
    MatIconModule
  ],
  templateUrl: './business-relatorios.component.html',
  styleUrls: ['./business-relatorios.component.css']
})
export class BusinessRelatorios implements OnInit {
  private readonly enableDevApiTests = isDevMode();

  displayedColumns: string[] = ['ClienteId', 'NomeCliente', 'CNPJCliente', 'EnderecoCliente','TelefoneCliente'];
  dataSource = new MatTableDataSource<Clientes>();
  filtroNome: string = '';
  clienteSelecionado: Clientes | null = null;
  clienteId: number = 0;
  cliente: any = {};
  activeTabIndex = 2; // Definir a aba ativa como "Cadastro"

  userName: string = '';
  loginTime: string = '';

  // Propriedades para o modal de seleção de período
  showDateModal: boolean = false;
  selectedReportType: number = 0;
  startDate: string = '';
  endDate: string = '';

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private http: HttpClient,
    private authService: AuthService,
    private reportService: ReportService,
    private snackBar: MatSnackBar,
    private agendamentosService: AgendamentosService,
    private pagamentosService: PagamentosService,
    private profissionaisService: ProfissionaisService,
    private produtosService: ProdutosService
  ) {}

  private formatCurrency(value: number): string {
    return (value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  }

  private unwrapArray(resp: any): any[] {
    if (Array.isArray(resp)) return resp;
    if (resp && Array.isArray(resp.data)) return resp.data;
    if (resp && Array.isArray(resp.Data)) return resp.Data;
    if (resp && typeof resp === 'object') {
      for (const key of ['result', 'Result', 'items', 'Items', 'value', 'Value', 'vendas', 'Vendas']) {
        if (Array.isArray((resp as any)[key])) return (resp as any)[key];
      }
      for (const k of Object.keys(resp)) {
        const val = (resp as any)[k];
        if (Array.isArray(val)) return val;
      }
    }
    return [];
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

  private parseDate(value: any): Date | null {
    if (!value) return null;
    const dt = new Date(value);
    if (isNaN(dt.getTime())) return null;
    return dt;
  }

  private normalizeStatus(rawStatus: any): string {
    const s = (rawStatus ?? '').toString().trim();
    if (!s) return '';
    const lower = s.toLowerCase();
    if (lower === 'confirmado' || lower === 'confirmada') return 'Confirmado';
    if (lower === 'finalizado' || lower === 'finalizada') return 'Finalizado';
    if (lower === 'concluido' || lower === 'concluida' || lower === 'concluído' || lower === 'concluída') return 'Finalizado';
    if (lower === 'pago' || lower === 'paga') return 'Finalizado';
    if (lower === 'cancelado' || lower === 'cancelada') return 'Cancelado';
    return s;
  }

  private isAgendamentoValidoParaComissao(status: string): boolean {
    const s = this.normalizeStatus(status);
    return s === 'Confirmado' || s === 'Finalizado';
  }

  private normalizarAgendamentos(items: any[]): AgendamentoNormalizado[] {
    return (items || []).map((a: any) => {
      const profissionalId = a?.profissionalId ?? a?.ProfissionalId ?? a?.profissionalID ?? a?.ProfissionalID ?? a?.funcionarioId ?? a?.FuncionarioId;

      // Nome do serviço pode vir em vários formatos (string direta, objeto, campos soltos)
      const servicoObj = a?.servico ?? a?.Servico;
      const servico =
        (typeof servicoObj === 'string' ? servicoObj : undefined) ??
        servicoObj?.nomeServico ?? servicoObj?.NomeServico ?? servicoObj?.nome ?? servicoObj?.Nome ??
        a?.nomeServico ?? a?.NomeServico ?? a?.servicoNome ?? a?.ServicoNome ??
        a?.descricaoServico ?? a?.DescricaoServico;

      const statusRaw = a?.status ?? a?.Status ?? a?.situacao ?? a?.Situacao;
      const status = this.normalizeStatus(statusRaw);

      const data = a?.data ?? a?.Data ?? a?.dataAgendamento ?? a?.DataAgendamento ?? a?.dataHora ?? a?.DataHora;

      return {
        profissionalId: profissionalId != null ? Number(profissionalId) : undefined,
        servico: (servico ?? '').toString().trim() || undefined,
        status,
        data: data ? data.toString() : undefined,
        raw: a
      };
    });
  }

  private normalizarVendas(vendas: any[]): VendaNormalizada[] {
    return (vendas || []).map((v: any) => ({
      vendaId: v.vendaId ?? v.VendaId ?? v.id ?? v.Id ?? v.vendaID ?? v.VendaID,
      clienteId: v.clienteId ?? v.ClienteId ?? v.clienteID ?? v.ClienteID,
      dataVenda: v.dataVenda ?? v.DataVenda ?? v.data ?? v.Data ?? v.dataHora ?? v.DataHora ?? v.createdAt ?? v.CreatedAt,
      totalVenda: v.totalVenda ?? v.TotalVenda ?? v.valorTotal ?? v.ValorTotal ?? v.total ?? v.Total ?? v.precoTotal ?? v.PrecoTotal ?? v.amount ?? v.Amount ?? v.valor ?? v.Valor ?? 0,
      profissionalId: v.profissionalId ?? v.ProfissionalId ?? v.funcionarioId ?? v.FuncionarioId ?? v.colaboradorId ?? v.ColaboradorId ?? v.vendedorId ?? v.VendedorId,
      servicoId: v.servicoId ?? v.ServicoId ?? v.servicoID ?? v.ServicoID,
      raw: v
    }));
  }

  private getVendasDoPeriodo(startDate: Date, endDate: Date) {
    const inicio = this.startOfDay(startDate);
    const fim = this.endOfDay(endDate);

    return this.http.get<any>('/api/Venda').pipe(
      map((resp) => this.unwrapArray(resp)),
      map((arr) => this.normalizarVendas(arr)),
      map((vendas) => vendas.filter((v) => {
        const dt = this.parseDate(v.dataVenda);
        if (!dt) return false;
        return dt >= inicio && dt <= fim;
      }))
    );
  }

  private buildProdutosCatalogoMap(produtos: any[]): Map<number, { nome: string; categoria: string; precoVenda?: number }> {
    const mapById = new Map<number, { nome: string; categoria: string; precoVenda?: number }>();
    (produtos || []).forEach((p: ProdutoCatalogo) => {
      const id = (p.ProdutoId ?? p.id);
      if (!id) return;
      const nome = (p.NomeProduto ?? p.nomeProduto ?? `Produto #${id}`);
      const categoria = (p.Categoria ?? p.categoria ?? '—');
      const precoVenda = (p.PrecoVenda ?? p.precoVenda);
      mapById.set(id, { nome, categoria, precoVenda });
    });
    return mapById;
  }

  private extractItensProdutoFromVenda(venda: VendaNormalizada, produtosMap?: Map<number, { nome: string; categoria: string; precoVenda?: number }>) {
    const raw = venda.raw || {};
    const arrays: any[] =
      raw.itens ?? raw.Itens ?? raw.items ?? raw.Items ?? raw.produtos ?? raw.Produtos ?? raw.itensProdutos ?? raw.ItensProdutos ?? [];
    const itens = Array.isArray(arrays) ? arrays : [];

    return itens
      .map((it: any) => {
        const produtoId = it.produtoId ?? it.ProdutoId ?? it.idProduto ?? it.IdProduto;
        const quantidade = it.quantidade ?? it.Quantidade ?? it.qtd ?? it.Qtd ?? 1;
        const valorUnitario = it.valorUnitario ?? it.ValorUnitario ?? it.precoUnitario ?? it.PrecoUnitario ?? it.preco ?? it.Preco;
        const valorTotal = it.valorTotal ?? it.ValorTotal ?? it.total ?? it.Total;
        const nomeDireto = it.nomeProduto ?? it.NomeProduto ?? it.nome ?? it.Nome;
        const categoriaDireta = it.categoria ?? it.Categoria;

        let nome = nomeDireto;
        let categoria = categoriaDireta;
        let preco = valorUnitario;

        if ((!nome || !categoria) && produtoId && produtosMap?.has(produtoId)) {
          const ref = produtosMap.get(produtoId)!;
          nome = nome || ref.nome;
          categoria = categoria || ref.categoria;
          preco = preco ?? ref.precoVenda;
        }

        if (!nome && produtoId) nome = `Produto #${produtoId}`;

        const qtdNum = Number(quantidade ?? 1);
        const unitNum = Number(preco ?? 0);
        const totalNum = Number(valorTotal ?? (qtdNum * unitNum));

        return {
          produtoId: produtoId ? Number(produtoId) : undefined,
          produto: nome || '—',
          categoria: categoria || '—',
          quantidade: isNaN(qtdNum) ? 1 : qtdNum,
          valorUnitario: isNaN(unitNum) ? 0 : unitNum,
          valorTotal: isNaN(totalNum) ? 0 : totalNum
        };
      })
      .filter((x: any) => x && x.produto);
  }

  ngOnInit(): void {
    this.userName = this.authService.getUserName();
    this.loginTime = this.authService.getSessionDuration();

    this.route.paramMap.subscribe(params => {
      this.clienteId = +params.get('id')!;
      if (this.clienteId) {
        this.carregarDadosCliente(this.clienteId);
      }
      // Definir a aba ativa com base no parâmetro de rota ou lógica específica
      this.activeTabIndex = this.clienteId ? 1 : 0;

      // Adicionar verificação para garantir que vá para a segunda aba se não houver id
      if (!this.clienteId) {
        this.activeTabIndex = 1;
      }
    });
    this.carregarTodosClientes();

    if (this.enableDevApiTests) {
      // Testes de suporte para troubleshooting local
      this.testarAPIAgendamentos();
      this.testarFormatosDataAPI();
      this.testarTodosAgendamentos();
      this.testarConectividadeAPI();
    }
  }

  // Função de teste para verificar se a API está funcionando
  testarAPIAgendamentos(): void {
    console.log('=== TESTE DA API DE AGENDAMENTOS ===');
    const hoje = new Date().toISOString().split('T')[0];
    console.log('Testando busca de agendamentos para hoje:', hoje);

    this.agendamentosService.getPorData(hoje).subscribe({
      next: (agendamentos) => {
        console.log('✅ API funcionando! Agendamentos encontrados para hoje:', agendamentos);

        if (agendamentos.length === 0) {
          console.log('⚠️ Nenhum agendamento para hoje. Testando outras datas...');
          this.buscarAgendamentosExistentes();
        }
      },
      error: (erro) => {
        console.error('❌ Erro na API de agendamentos:', erro);
      }
    });
  }

  // Função para buscar agendamentos em um período mais amplo
  buscarAgendamentosExistentes(): void {
    console.log('=== BUSCANDO AGENDAMENTOS EM PERÍODO AMPLO ===');

    const datasParaTeste: string[] = [];
    const hoje = new Date();

    // Verificar últimos 30 dias
    for (let i = 0; i < 30; i++) {
      const data = new Date(hoje);
      data.setDate(hoje.getDate() - i);
      datasParaTeste.push(data.toISOString().split('T')[0]);
    }

    // Verificar próximos 30 dias
    for (let i = 1; i <= 30; i++) {
      const data = new Date(hoje);
      data.setDate(hoje.getDate() + i);
      datasParaTeste.push(data.toISOString().split('T')[0]);
    }

    console.log('Testando', datasParaTeste.length, 'datas diferentes...');

    let agendamentosEncontrados = 0;
    let datasComAgendamentos: string[] = [];

    datasParaTeste.forEach((data, index) => {
      this.agendamentosService.getPorData(data).subscribe({
        next: (agendamentos) => {
          if (agendamentos.length > 0) {
            agendamentosEncontrados += agendamentos.length;
            datasComAgendamentos.push(data);
            console.log(`📅 ${data}: ${agendamentos.length} agendamentos encontrados`);
            console.log('Agendamentos:', agendamentos);
          }

          // Se for a última data testada, mostrar resumo
          if (index === datasParaTeste.length - 1) {
            console.log('=== RESUMO DA BUSCA ===');
            console.log(`Total de agendamentos encontrados: ${agendamentosEncontrados}`);
            console.log(`Datas com agendamentos: ${datasComAgendamentos.length}`);
            console.log('Datas com dados:', datasComAgendamentos);

            if (datasComAgendamentos.length > 0) {
              console.log('✅ Sugestão: Use uma dessas datas para gerar relatórios!');
            } else {
              console.log('❌ Nenhum agendamento encontrado em 60 dias. Verifique se há dados no sistema.');
            }
          }
        },
        error: (erro) => {
          console.error(`❌ Erro ao buscar agendamentos para ${data}:`, erro);
        }
      });
    });
  }

  // Função para testar formatos de data na API
  testarFormatosDataAPI(): void {
    const hoje = new Date().toISOString().split('T')[0];
    console.log('=== TESTANDO FORMATOS DE DATA NA API ===');

    this.agendamentosService.testarFormatosData(hoje).subscribe({
      next: (resultado) => {
        console.log('✅ Formato de data funcionou:', resultado);
      },
      error: (erro) => {
        console.error('❌ Erro no teste de formatos:', erro);
      },
      complete: () => {
        console.log('🏁 Teste de formatos de data concluído');

        // Fazer um teste adicional com uma data específica que sabemos que tem dados
        this.testarDataEspecifica();
      }
    });
  }

  // Função para testar uma data específica em diferentes formatos
  testarDataEspecifica(): void {
    console.log('=== TESTE ADICIONAL COM DATA ESPECÍFICA ===');

    // Testar hoje e algumas datas recentes
    const datasParaTeste = [
      '2025-08-25', // Hoje no formato ISO
      '2025-08-24', // Ontem
      '2025-08-01', // Início do mês
      '2025-07-01', // Mês passado
    ];

    datasParaTeste.forEach(data => {
      console.log(`🔍 Testando data: ${data}`);

      this.agendamentosService.getPorData(data).subscribe({
        next: (agendamentos) => {
          if (agendamentos.length > 0) {
            console.log(`✅ ENCONTRADO! Data ${data} tem ${agendamentos.length} agendamentos:`, agendamentos);
          } else {
            console.log(`⚪ Data ${data} - sem agendamentos (mas sem erro)`);
          }
        },
        error: (erro) => {
          console.error(`❌ Erro na data ${data}:`, erro);
        }
      });
    });
  }  // Função para testar busca de todos os agendamentos
  testarTodosAgendamentos(): void {
    console.log('=== TESTANDO BUSCA DE TODOS OS AGENDAMENTOS ===');

    this.agendamentosService.getTodos().subscribe({
      next: (todosAgendamentos) => {
        console.log('✅ Busca de todos os agendamentos realizada com sucesso!');
        console.log('Total de agendamentos no sistema:', todosAgendamentos.length);

        if (todosAgendamentos.length > 0) {
          console.log('📋 Primeiros 5 agendamentos:', todosAgendamentos.slice(0, 5));

          // Analisar as datas dos agendamentos
          const datasEncontradas = new Set<string>();
          todosAgendamentos.forEach(ag => {
            if (ag.horario) {
              const data = ag.horario.split('T')[0];
              datasEncontradas.add(data);
            }
          });

          console.log('📅 Datas únicas encontradas:', Array.from(datasEncontradas).sort());
          console.log('💡 Use uma dessas datas para gerar relatórios com dados reais!');
        } else {
          console.log('❌ Nenhum agendamento encontrado no sistema.');
          console.log('💡 Verifique se há dados cadastrados no backend.');
        }
      },
      error: (erro) => {
        console.error('❌ Erro ao buscar todos os agendamentos:', erro);
      }
    });
  }  carregarDadosCliente(id: number): void {
    this.http.get<Clientes>(`/api/clientes/${id}`).subscribe((data: Clientes) => {
      this.clienteSelecionado = data;
    }, error => {
      console.error('Erro ao carregar dados do cliente', error);
    });
  }

  carregarTodosClientes(): void {
    this.http.get<Clientes[]>(`/api/clientes`).subscribe((data: Clientes[]) => {
      this.dataSource.data = data;
    }, error => {
      console.error('Erro ao carregar todos os clientes', error);
    });
  }

  onTabChange(event: any): void {
    const tabLabel = event.tab.textLabel;
    if (tabLabel === 'Consulta') {
      this.router.navigate(['/frmclientesconsulta']);
    } else if (tabLabel === 'Cadastro') {
      // Evitar redirecionamento se estiver editando um cliente específico
      if (this.clienteId) {
        this.router.navigate(['/frmclientescadastro', this.clienteId]);
      } else {
        this.router.navigate(['/frmclientescadastro']);
      }
    }
  }

  // Métodos para gerar relatórios
  generateReport(reportType: number): void {
    // Verificar se o ReportService está disponível
    if (!this.reportService) {
      console.error('ReportService não encontrado');
      this.snackBar.open('Erro: Service de relatórios não disponível', 'Fechar', { duration: 3000 });
      return;
    }

    // Abrir modal para seleção de período
    this.selectedReportType = reportType;
    this.setPredefinedPeriod(30); // Definir período padrão de 30 dias
    this.showDateModal = true;
  }

  // Métodos para o modal de seleção de período
  setPredefinedPeriod(days: number): void {
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(endDate.getDate() - days);

    this.endDate = this.formatDateForInput(endDate);
    this.startDate = this.formatDateForInput(startDate);
  }

  private formatDateForInput(date: Date): string {
    return date.toISOString().split('T')[0];
  }

  closeDateModal(): void {
    this.showDateModal = false;
  }

  getReportTitle(reportType: number): string {
    const titles: { [key: number]: string } = {
      1: 'Faturamento Total por Data',
      2: 'Vendas Total por Data',
      3: 'Comissões dos Profissionais',
      4: 'Comandas por Número ou Data',
      5: 'Produtos Vendidos',
      6: 'Serviços por Tipo',
      7: 'Agendamentos por Profissional',
      8: 'Produtos por Categoria'
    };
    return titles[reportType] || 'Relatório';
  }

  generateReportWithDates(): void {
    if (!this.startDate || !this.endDate) {
      this.snackBar.open('Por favor, selecione as datas de início e fim', 'Fechar', { duration: 3000 });
      return;
    }

    this.snackBar.open('Gerando relatório...', 'Fechar', { duration: 2000 });
    this.showDateModal = false;

    try {
      const startDateObj = new Date(this.startDate);
      const endDateObj = new Date(this.endDate);

      switch (this.selectedReportType) {
        case 1:
          this.generateFaturamentoReport(startDateObj, endDateObj);
          break;
        case 2:
          this.generateVendasReport(startDateObj, endDateObj);
          break;
        case 3:
          this.generateComissoesReport(startDateObj, endDateObj);
          break;
        case 4:
          this.generateComandasReport(startDateObj, endDateObj);
          break;
        case 5:
          this.generateProdutosReport(startDateObj, endDateObj);
          break;
        case 6:
          this.generateServicosReport(startDateObj, endDateObj);
          break;
        case 7:
          this.generateAgendamentosReport(startDateObj, endDateObj);
          break;
        case 8:
          this.generateProdutosCategoriaReport(startDateObj, endDateObj);
          break;
        default:
          this.snackBar.open('Tipo de relatório inválido', 'Fechar', { duration: 3000 });
      }
    } catch (error) {
      console.error('Erro ao gerar relatório:', error);
      this.snackBar.open('Erro ao gerar relatório', 'Fechar', { duration: 3000 });
    }
  }

  private generateFaturamentoReport(startDate: Date, endDate: Date): void {
    this.snackBar.open('Carregando dados...', 'Fechar', { duration: 1000 });

    this.getVendasDoPeriodo(startDate, endDate).subscribe({
      next: (vendas: VendaNormalizada[]) => {
        if (!vendas.length) {
          this.snackBar.open('Nenhuma venda encontrada no período selecionado', 'Fechar', { duration: 3500 });
          return;
        }

        const mapByDate = new Map<string, { data: string; valorTotal: number; quantidade: number }>();
        vendas.forEach((v) => {
          const dt = this.parseDate(v.dataVenda);
          if (!dt) return;
          const key = dt.toISOString().split('T')[0];
          const acc = mapByDate.get(key) ?? { data: key, valorTotal: 0, quantidade: 0 };
          acc.valorTotal += Number(v.totalVenda ?? 0);
          acc.quantidade += 1;
          mapByDate.set(key, acc);
        });

        const faturamentoPorData = Array.from(mapByDate.values())
          .sort((a, b) => a.data.localeCompare(b.data))
          .map((x) => ({
            data: new Date(x.data).toLocaleDateString('pt-BR'),
            valorTotal: x.valorTotal,
            quantidadeServicos: x.quantidade
          }));

        const reportData = {
          title: 'Relatório de Faturamento por Dia',
          subtitle: 'Faturamento com base em vendas registradas na API',
          period: `${startDate.toLocaleDateString('pt-BR')} a ${endDate.toLocaleDateString('pt-BR')}`,
          data: faturamentoPorData.map((item) => ({
            'Data': item.data,
            'Faturamento Total': this.formatCurrency(item.valorTotal),
            'Qtd. Vendas': item.quantidadeServicos
          })),
          summary: {
            'Valor Total': this.formatCurrency(faturamentoPorData.reduce((sum, item) => sum + item.valorTotal, 0)),
            'Total de Vendas': faturamentoPorData.reduce((sum, item) => sum + item.quantidadeServicos, 0),
            'Dias com Vendas': faturamentoPorData.length
          }
        };

        this.reportService.generateHTMLReport(reportData);
        this.snackBar.open('Relatório gerado com sucesso!', 'Fechar', { duration: 2000 });
      },
      error: (error) => {
        console.error('Erro ao carregar vendas para faturamento:', error);
        this.snackBar.open('Erro ao carregar dados do faturamento (API)', 'Fechar', { duration: 3500 });
      }
    });
  }

  // (Removido) geração de dados mock: relatórios usam somente API.

  private generateVendasReport(startDate: Date, endDate: Date): void {
    this.snackBar.open('Carregando dados de vendas...', 'Fechar', { duration: 1000 });

    forkJoin({
      vendas: this.getVendasDoPeriodo(startDate, endDate),
      servicos: this.http.get<any>('/api/Servicos').pipe(map((resp) => this.unwrapArray(resp)))
    }).subscribe({
      next: ({ vendas, servicos }) => {
        const servicosMap = new Map<number, { nome: string; categoria: string }>();
        (servicos || []).forEach((s: any) => {
          const id = s.servicoId ?? s.ServicoId ?? s.id ?? s.Id;
          if (!id) return;
          const nome = s.nomeServico ?? s.NomeServico ?? s.nome ?? s.Nome ?? `Serviço #${id}`;
          const categoria = s.categoria ?? s.Categoria ?? '—';
          servicosMap.set(Number(id), { nome, categoria });
        });

        if (!vendas.length) {
          this.snackBar.open('Nenhuma venda encontrada no período selecionado', 'Fechar', { duration: 3500 });
          return;
        }

        const byServico = new Map<string, { servico: string; categoria: string; quantidade: number; valorTotal: number }>();
        vendas.forEach((v) => {
          const servicoRef = v.servicoId ? servicosMap.get(Number(v.servicoId)) : undefined;
          const servico = servicoRef?.nome ?? (v.servicoId ? `Serviço #${v.servicoId}` : '—');
          const categoria = servicoRef?.categoria ?? '—';
          const key = `${servico}||${categoria}`;
          const acc = byServico.get(key) ?? { servico, categoria, quantidade: 0, valorTotal: 0 };
          acc.quantidade += 1;
          acc.valorTotal += Number(v.totalVenda ?? 0);
          byServico.set(key, acc);
        });

        const rows = Array.from(byServico.values()).sort((a, b) => b.valorTotal - a.valorTotal);

        const reportData = {
          title: 'Relatório de Vendas por Serviço',
          subtitle: 'Vendas agrupadas por serviço/categoria (dados reais da API)',
          period: `${startDate.toLocaleDateString('pt-BR')} a ${endDate.toLocaleDateString('pt-BR')}`,
          data: rows.map((item) => ({
            'Serviço': item.servico,
            'Categoria': item.categoria,
            'Quantidade': item.quantidade,
            'Valor Total': this.formatCurrency(item.valorTotal)
          })),
          summary: {
            'Valor Total': this.formatCurrency(rows.reduce((sum, item) => sum + item.valorTotal, 0)),
            'Total de Vendas': rows.reduce((sum, item) => sum + item.quantidade, 0),
            'Categorias': [...new Set(rows.map(item => item.categoria))].length,
            'Serviços': rows.length
          }
        };

        this.reportService.generateHTMLReport(reportData);
        this.snackBar.open('Relatório de vendas gerado!', 'Fechar', { duration: 2000 });
      },
      error: (error) => {
        console.error('Erro ao gerar relatório de vendas:', error);
        this.snackBar.open('Erro ao carregar dados de vendas (API)', 'Fechar', { duration: 3500 });
      }
    });
  }

  private generateComissoesReport(startDate: Date, endDate: Date): void {
    this.snackBar.open('Carregando dados de comissões...', 'Fechar', { duration: 1000 });

    // Buscar profissionais e vendas reais do período
    forkJoin({
      profissionais: this.profissionaisService.getProfissionais(),
      vendas: this.getVendasDoPeriodo(startDate, endDate),
      servicos: this.http.get<any>('/api/Servicos').pipe(map((resp) => this.unwrapArray(resp)), catchError(() => of([])))
    }).subscribe({
      next: (data) => {
        const servicosMap = new Map<number, string>();
        (data.servicos || []).forEach((s: any) => {
          const id = Number(s?.servicoId ?? s?.ServicoId ?? s?.id ?? s?.Id ?? 0);
          if (!id) return;
          const nome = String(s?.nomeServico ?? s?.NomeServico ?? s?.nome ?? s?.Nome ?? `Serviço #${id}`);
          servicosMap.set(id, nome);
        });

        const comissoesPorProfissional = this.calculateComissoesPorProfissional(
          data.vendas as VendaNormalizada[],
          data.profissionais,
          servicosMap
        );

        const reportData = {
          title: 'Relatório de Comissões dos Profissionais',
          subtitle: 'Comissões por vendas realizadas no período (dados reais da API)',
          period: `${startDate.toLocaleDateString('pt-BR')} a ${endDate.toLocaleDateString('pt-BR')}`,
          data: comissoesPorProfissional.map((item: any) => ({
            'Profissional': item.profissional,
            'Especialidade': item.especialidade || '—',
            'Qtd. Serviços': item.quantidadeServicos,
            'Total Serviços': this.formatCurrency(item.valorTotalServicos),
            'Comissão Total': this.formatCurrency(item.totalComissao),
            'Comissão Média': this.formatCurrency(item.comissaoMedia),
            'Serviço Mais Frequente': item.servicoFavorito || '—'
          })),
          summary: {
            'Total de Comissões': this.formatCurrency(comissoesPorProfissional.reduce((sum, item) => sum + item.totalComissao, 0)),
            'Profissionais Ativos': comissoesPorProfissional.length,
            'Total de Serviços': comissoesPorProfissional.reduce((sum, item) => sum + item.quantidadeServicos, 0)
          }
        };

        this.reportService.generateHTMLReport(reportData);
        this.snackBar.open('Relatório de comissões gerado!', 'Fechar', { duration: 2000 });
      },
      error: (error) => {
        console.error('Erro ao gerar relatório de comissões:', error);
        this.snackBar.open('Erro ao carregar dados de comissões', 'Fechar', { duration: 3000 });
      }
    });
  }

  private generateComandasReport(startDate: Date, endDate: Date): void {
    this.snackBar.open('Carregando comandas (vendas)...', 'Fechar', { duration: 1000 });

    forkJoin({
      vendas: this.getVendasDoPeriodo(startDate, endDate),
      clientes: this.http.get<any>('/api/Clientes').pipe(map((resp) => this.unwrapArray(resp)), catchError(() => of([])))
    }).subscribe({
      next: ({ vendas, clientes }) => {
        const clientesMap = new Map<number, string>();
        (clientes || []).forEach((c: any) => {
          const id = c.clienteId ?? c.ClienteId ?? c.id ?? c.Id;
          if (!id) return;
          const nome = c.nome ?? c.Nome ?? c.nomeCliente ?? c.NomeCliente ?? c.name ?? c.Name ?? `Cliente #${id}`;
          clientesMap.set(Number(id), nome);
        });

        if (!vendas.length) {
          this.snackBar.open('Nenhuma comanda/venda encontrada no período', 'Fechar', { duration: 3500 });
          return;
        }

        const rows = vendas
          .slice()
          .sort((a, b) => {
            const da = this.parseDate(a.dataVenda)?.getTime() ?? 0;
            const db = this.parseDate(b.dataVenda)?.getTime() ?? 0;
            return db - da;
          })
          .map((v) => {
            const dt = this.parseDate(v.dataVenda);
            const cliente = (v.clienteId && clientesMap.get(Number(v.clienteId))) || (v.clienteId ? `Cliente #${v.clienteId}` : '—');
            return {
              'Comanda': v.vendaId ?? '—',
              'Data': dt ? dt.toLocaleDateString('pt-BR') : '—',
              'Cliente': cliente,
              'Valor': this.formatCurrency(Number(v.totalVenda ?? 0))
            };
          });

        const reportData = {
          title: 'Relatório de Comandas',
          subtitle: 'Comandas geradas a partir de vendas (dados reais da API)',
          period: `${startDate.toLocaleDateString('pt-BR')} a ${endDate.toLocaleDateString('pt-BR')}`,
          data: rows,
          summary: {
            'Total de Comandas': vendas.length,
            'Valor Total': this.formatCurrency(vendas.reduce((sum, v) => sum + Number(v.totalVenda ?? 0), 0))
          }
        };

        this.reportService.generateHTMLReport(reportData);
        this.snackBar.open('Relatório de comandas gerado!', 'Fechar', { duration: 2000 });
      },
      error: (error) => {
        console.error('Erro ao gerar relatório de comandas:', error);
        this.snackBar.open('Erro ao carregar comandas (API)', 'Fechar', { duration: 3500 });
      }
    });
  }

  private generateProdutosReport(startDate: Date, endDate: Date): void {
    this.snackBar.open('Carregando vendas de produtos...', 'Fechar', { duration: 1000 });

    forkJoin({
      vendas: this.getVendasDoPeriodo(startDate, endDate),
      produtos: this.produtosService.getProdutos().pipe(catchError(() => of([])))
    }).subscribe({
      next: ({ vendas, produtos }) => {
        const produtosMap = this.buildProdutosCatalogoMap(produtos);
        const itens = vendas.flatMap((v) => this.extractItensProdutoFromVenda(v, produtosMap));

        const byProduto = new Map<string, { produto: string; categoria: string; quantidade: number; valorUnitario: number; valorTotal: number }>();
        itens.forEach((it: any) => {
          const key = `${it.produto}||${it.categoria}||${it.valorUnitario}`;
          const acc = byProduto.get(key) ?? { produto: it.produto, categoria: it.categoria, quantidade: 0, valorUnitario: it.valorUnitario, valorTotal: 0 };
          acc.quantidade += Number(it.quantidade ?? 0);
          acc.valorTotal += Number(it.valorTotal ?? 0);
          byProduto.set(key, acc);
        });

        const rows = Array.from(byProduto.values()).sort((a, b) => b.valorTotal - a.valorTotal);

        const reportData = {
          title: 'Relatório de Produtos Vendidos',
          subtitle: itens.length
            ? 'Produtos vendidos a partir dos itens retornados pela API'
            : 'A API não retornou itens de produtos para o período selecionado',
          period: `${startDate.toLocaleDateString('pt-BR')} a ${endDate.toLocaleDateString('pt-BR')}`,
          data: rows.map((item) => ({
            'Produto': item.produto,
            'Categoria': item.categoria,
            'Quantidade': item.quantidade,
            'Valor Unitário': this.formatCurrency(item.valorUnitario),
            'Valor Total': this.formatCurrency(item.valorTotal)
          })),
          summary: {
            'Total de Itens': rows.reduce((sum, item) => sum + item.quantidade, 0),
            'Valor Total': this.formatCurrency(rows.reduce((sum, item) => sum + item.valorTotal, 0))
          }
        };

        this.reportService.generateHTMLReport(reportData);
        this.snackBar.open('Relatório de produtos gerado!', 'Fechar', { duration: 2000 });
      },
      error: (error) => {
        console.error('Erro ao gerar relatório de produtos:', error);
        this.snackBar.open('Erro ao carregar vendas de produtos (API)', 'Fechar', { duration: 3500 });
      }
    });
  }

  private generateServicosReport(startDate: Date, endDate: Date): void {
    this.snackBar.open('Carregando dados de serviços...', 'Fechar', { duration: 1000 });

    forkJoin({
      vendas: this.getVendasDoPeriodo(startDate, endDate),
      servicos: this.http.get<any>('/api/Servicos').pipe(map((resp) => this.unwrapArray(resp)))
    }).subscribe({
      next: ({ vendas, servicos }) => {
        const servicosMap = new Map<number, { nome: string; categoria: string }>();
        (servicos || []).forEach((s: any) => {
          const id = s.servicoId ?? s.ServicoId ?? s.id ?? s.Id;
          if (!id) return;
          const nome = s.nomeServico ?? s.NomeServico ?? s.nome ?? s.Nome ?? `Serviço #${id}`;
          const categoria = s.categoria ?? s.Categoria ?? '—';
          servicosMap.set(Number(id), { nome, categoria });
        });

        const byTipo = new Map<string, { tipoServico: string; categoria: string; quantidade: number; valorTotal: number }>();
        vendas.forEach((v) => {
          const servicoRef = v.servicoId ? servicosMap.get(Number(v.servicoId)) : undefined;
          const tipoServico = servicoRef?.nome ?? (v.servicoId ? `Serviço #${v.servicoId}` : '—');
          const categoria = servicoRef?.categoria ?? '—';
          const key = `${tipoServico}||${categoria}`;
          const acc = byTipo.get(key) ?? { tipoServico, categoria, quantidade: 0, valorTotal: 0 };
          acc.quantidade += 1;
          acc.valorTotal += Number(v.totalVenda ?? 0);
          byTipo.set(key, acc);
        });

        const rows = Array.from(byTipo.values())
          .map((x) => ({
            ...x,
            valorMedio: x.quantidade ? (x.valorTotal / x.quantidade) : 0
          }))
          .sort((a, b) => b.valorTotal - a.valorTotal);

        const reportData = {
          title: 'Relatório de Serviços por Tipo',
          subtitle: 'Dados reais baseados em vendas da API',
          period: `${startDate.toLocaleDateString('pt-BR')} a ${endDate.toLocaleDateString('pt-BR')}`,
          data: rows.map((item) => ({
            'Tipo de Serviço': item.tipoServico,
            'Categoria': item.categoria,
            'Quantidade': item.quantidade,
            'Valor Médio': this.formatCurrency(item.valorMedio),
            'Valor Total': this.formatCurrency(item.valorTotal)
          })),
          summary: {
            'Total de Serviços': rows.reduce((sum, item) => sum + item.quantidade, 0),
            'Valor Total': this.formatCurrency(rows.reduce((sum, item) => sum + item.valorTotal, 0))
          }
        };

        this.reportService.generateHTMLReport(reportData);
        this.snackBar.open('Relatório de serviços gerado!', 'Fechar', { duration: 2000 });
      },
      error: (error) => {
        console.error('Erro ao gerar relatório de serviços:', error);
        this.snackBar.open('Erro ao carregar dados de serviços (API)', 'Fechar', { duration: 3500 });
      }
    });
  }

  private generateAgendamentosReport(startDate: Date, endDate: Date): void {
    this.snackBar.open('Carregando dados de agendamentos...', 'Fechar', { duration: 1000 });

    forkJoin({
      profissionais: this.profissionaisService.getProfissionais(),
      agendamentos: this.getAgendamentosDoPeríodo(startDate, endDate)
    }).subscribe({
      next: (data) => {
        const agendamentosPorProfissional = this.calculateAgendamentosPorProfissional(
          data.agendamentos as any[],
          data.profissionais
        );

        const reportData = {
          title: 'Relatório de Agendamentos por Profissional',
          subtitle: 'Total de agendamentos por profissional baseado em dados reais',
          period: `${startDate.toLocaleDateString('pt-BR')} a ${endDate.toLocaleDateString('pt-BR')}`,
          data: agendamentosPorProfissional.map((item: any) => ({
            'Profissional': item.profissional,
            'Especialidade': item.especialidade || '—',
            'Total': item.totalAgendamentos,
            'Concluídos': item.agendamentosConcluidos,
            'Cancelados': item.agendamentosCancelados,
            'Pendentes': item.agendamentosPendentes,
            'Taxa de Conclusão': item.taxaConclusao
          })),
          summary: {
            'Total de Agendamentos': agendamentosPorProfissional.reduce((sum: number, item: any) => sum + item.totalAgendamentos, 0),
            'Total Concluídos': agendamentosPorProfissional.reduce((sum: number, item: any) => sum + item.agendamentosConcluidos, 0),
            'Total Cancelados': agendamentosPorProfissional.reduce((sum: number, item: any) => sum + item.agendamentosCancelados, 0),
            'Profissionais Ativos': agendamentosPorProfissional.length
          }
        };

        this.reportService.generateHTMLReport(reportData);
        this.snackBar.open('Relatório de agendamentos gerado!', 'Fechar', { duration: 2000 });
      },
      error: (error) => {
        console.error('Erro ao gerar relatório de agendamentos:', error);
        this.snackBar.open('Erro ao carregar dados de agendamentos', 'Fechar', { duration: 3000 });
      }
    });
  }

  private generateProdutosCategoriaReport(startDate: Date, endDate: Date): void {
    this.snackBar.open('Carregando produtos por categoria...', 'Fechar', { duration: 1000 });

    forkJoin({
      vendas: this.getVendasDoPeriodo(startDate, endDate),
      produtos: this.produtosService.getProdutos().pipe(catchError(() => of([])))
    }).subscribe({
      next: ({ vendas, produtos }) => {
        const produtosMap = this.buildProdutosCatalogoMap(produtos);
        const itens = vendas.flatMap((v) => this.extractItensProdutoFromVenda(v, produtosMap));

        const byCategoriaProduto = new Map<string, { categoria: string; produto: string; quantidade: number; valorTotal: number }>();
        itens.forEach((it: any) => {
          const key = `${it.categoria}||${it.produto}`;
          const acc = byCategoriaProduto.get(key) ?? { categoria: it.categoria, produto: it.produto, quantidade: 0, valorTotal: 0 };
          acc.quantidade += Number(it.quantidade ?? 0);
          acc.valorTotal += Number(it.valorTotal ?? 0);
          byCategoriaProduto.set(key, acc);
        });

        const rows = Array.from(byCategoriaProduto.values()).sort((a, b) => b.valorTotal - a.valorTotal);

        const reportData = {
          title: 'Relatório de Produtos por Categoria',
          subtitle: itens.length
            ? 'Dados reais baseados em itens de produto retornados pela API'
            : 'A API não retornou itens de produtos para o período selecionado',
          period: `${startDate.toLocaleDateString('pt-BR')} a ${endDate.toLocaleDateString('pt-BR')}`,
          data: rows.map((item) => ({
            'Categoria': item.categoria,
            'Produto': item.produto,
            'Quantidade': item.quantidade,
            'Valor Total': this.formatCurrency(item.valorTotal)
          })),
          summary: {
            'Total de Itens': rows.reduce((sum, item) => sum + item.quantidade, 0),
            'Valor Total': this.formatCurrency(rows.reduce((sum, item) => sum + item.valorTotal, 0)),
            'Categorias': [...new Set(rows.map(item => item.categoria))].length
          }
        };

        this.reportService.generateHTMLReport(reportData);
        this.snackBar.open('Relatório gerado!', 'Fechar', { duration: 2000 });
      },
      error: (error) => {
        console.error('Erro ao gerar relatório de produtos por categoria:', error);
        this.snackBar.open('Erro ao carregar produtos por categoria (API)', 'Fechar', { duration: 3500 });
      }
    });
  }

  // Métodos auxiliares para processamento de dados reais
  private getDateRange(startDate: Date, endDate: Date): string[] {
    const dates: string[] = [];
    const currentDate = new Date(startDate);

    while (currentDate <= endDate) {
      dates.push(currentDate.toISOString().split('T')[0]);
      currentDate.setDate(currentDate.getDate() + 1);
    }

    return dates;
  }

  private calculateFaturamentoPorData(agendamentos: any[]): any[] {
    const faturamentoPorData = new Map();
    console.log('=== INICIANDO CÁLCULO DE FATURAMENTO ===');
    console.log('Número de agendamentos recebidos:', agendamentos.length);
    console.log('Processando agendamentos para faturamento:', agendamentos);

    // Verificar estrutura dos dados
    if (agendamentos.length > 0) {
      console.log('Estrutura do primeiro agendamento:', Object.keys(agendamentos[0]));
      console.log('Primeiro agendamento completo:', JSON.stringify(agendamentos[0], null, 2));
    }

    let agendamentosProcessados = 0;
    let agendamentosIgnorados = 0;

    agendamentos.forEach((agendamento, index) => {
      console.log(`\n--- AGENDAMENTO ${index + 1} ---`);
      console.log('Agendamento completo:', agendamento);

      // Verificar diferentes campos de status
      const statusPossivel = agendamento.status || agendamento.Status || agendamento.situacao || agendamento.Situacao;
      const servicoPossivel = agendamento.servico || agendamento.Servico || agendamento.nomeServico || agendamento.NomeServico || agendamento.servicoNome;

      console.log(`Status encontrado: "${statusPossivel}", Serviço encontrado: "${servicoPossivel}"`);

      // Aceitar mais status e ser case-insensitive
      const statusValidos = ['confirmado', 'finalizado', 'concluido', 'pago', 'realizado', 'completed'];
      const statusLower = (statusPossivel || '').toLowerCase();

      console.log(`Status verificado: "${statusLower}"`);
      console.log(`Status é válido: ${statusValidos.includes(statusLower) || !statusPossivel}`);

      // Ser mais flexível com status - processar se não há status definido ou se é um status válido
      if (statusValidos.includes(statusLower) || !statusPossivel) {
        // Tentar diferentes formatos de data com múltiplos campos
        let data;
        const possiveisCamposData = [
          agendamento.horario,
          agendamento.data,
          agendamento.dataHora,
          agendamento.Horario,
          agendamento.Data,
          agendamento.DataHora,
          agendamento.dataAgendamento,
          agendamento.dataServico
        ];

        console.log('Campos de data disponíveis:', {
          horario: agendamento.horario,
          data: agendamento.data,
          dataHora: agendamento.dataHora,
          Horario: agendamento.Horario,
          Data: agendamento.Data,
          DataHora: agendamento.DataHora,
          dataAgendamento: agendamento.dataAgendamento,
          dataServico: agendamento.dataServico
        });

        // Procurar primeiro campo de data válido
        for (const campoData of possiveisCamposData) {
          if (campoData) {
            if (typeof campoData === 'string') {
              data = campoData.split('T')[0];
              console.log(`Data extraída do campo: ${data}`);
              break;
            } else if (campoData instanceof Date) {
              data = campoData.toISOString().split('T')[0];
              console.log(`Data extraída de objeto Date: ${data}`);
              break;
            }
          }
        }

        if (!data) {
          console.log('❌ Nenhuma data válida encontrada para agendamento:', agendamento);
          agendamentosIgnorados++;
          return;
        }

        const valor = this.getValorServico(servicoPossivel);
        console.log(`Data final: ${data}, Valor calculado: ${valor}`);

        if (!faturamentoPorData.has(data)) {
          console.log(`Criando novo registro para data: ${data}`);
          faturamentoPorData.set(data, {
            data: new Date(data).toLocaleDateString('pt-BR'),
            valorTotal: 0,
            quantidadeServicos: 0
          });
        }

        const registro = faturamentoPorData.get(data);
        const registroAnterior = { ...registro };

        registro.valorTotal += valor;
        registro.quantidadeServicos += 1;

        console.log(`✅ Registro atualizado para ${data}:`);
        console.log('Antes:', registroAnterior);
        console.log('Depois:', registro);

        agendamentosProcessados++;
      } else {
        console.log(`❌ Agendamento ignorado - status: "${statusPossivel}"`);
        agendamentosIgnorados++;
      }
    });

    const resultado = Array.from(faturamentoPorData.values());
    console.log('\n=== RESULTADO FINAL DO FATURAMENTO ===');
    console.log(`Agendamentos processados: ${agendamentosProcessados}`);
    console.log(`Agendamentos ignorados: ${agendamentosIgnorados}`);
    console.log('Número de dias com faturamento:', resultado.length);
    console.log('Resultado final do faturamento:', resultado);

    return resultado;
  }

  private calculateFaturamentoSummary(faturamentoPorData: any[]): any {
    return {
      'Total de Faturamento': faturamentoPorData.reduce((sum, item) => sum + item.valorTotal, 0),
      'Total de Serviços': faturamentoPorData.reduce((sum, item) => sum + item.quantidadeServicos, 0),
      'Dias com Faturamento': faturamentoPorData.length
    };
  }

  private getValorServico(nomeServico: string): number {
    console.log(`🔍 Buscando valor para serviço: "${nomeServico}"`);

    // Tabela de valores dos serviços - você pode buscar isso da API também
    const valores: { [key: string]: number } = {
      'Corte Masculino': 50.00,
      'Corte Feminino': 80.00,
      'Barba Completa': 40.00,
      'Corte + Barba': 80.00,
      'Sobrancelha': 20.00,
      'Hidratação': 60.00,
      'Escova': 30.00,
      'Pintura': 100.00,
      // Adicionar variações comuns
      'corte masculino': 50.00,
      'corte feminino': 80.00,
      'barba completa': 40.00,
      'corte + barba': 80.00,
      'sobrancelha': 20.00,
      'hidratação': 60.00,
      'escova': 30.00,
      'pintura': 100.00,
      'corte': 50.00,
      'barba': 40.00
    };

    // Buscar valor exato primeiro, depois case-insensitive
    let valor = valores[nomeServico];
    console.log(`Valor direto encontrado: ${valor}`);

    if (!valor) {
      const servicoLower = (nomeServico || '').toLowerCase().trim();
      console.log(`Tentando busca case-insensitive: "${servicoLower}"`);
      valor = valores[servicoLower];
      console.log(`Valor case-insensitive encontrado: ${valor}`);
    }

    const valorFinal = valor || 45.00; // Valor padrão se não encontrar
    console.log(`💰 Resultado final - Serviço "${nomeServico}" -> valor: R$ ${valorFinal}`);
    return valorFinal;
  }

  private calculateVendasPorCategoria(agendamentos: any[]): any[] {
    const vendas = new Map();

    agendamentos.forEach(agendamento => {
      const status = this.normalizeStatus(agendamento?.status);
      if (this.isAgendamentoValidoParaComissao(status)) {
        const servico = (agendamento?.servico ?? '').toString().trim();
        const valor = this.getValorServico(servico);
        const categoria = this.getCategoriaServico(servico);

        if (!vendas.has(servico)) {
          vendas.set(servico, {
            servico: servico,
            categoria: categoria,
            quantidade: 0,
            valorTotal: 0
          });
        }

        const registro = vendas.get(servico);
        registro.quantidade += 1;
        registro.valorTotal += valor;
      }
    });

    return Array.from(vendas.values());
  }

  private getCategoriaServico(nomeServico: string): string {
    const categorias: { [key: string]: string } = {
      'Corte Masculino': 'Cortes',
      'Corte Feminino': 'Cortes',
      'Barba Completa': 'Barba',
      'Corte + Barba': 'Combo',
      'Sobrancelha': 'Estética',
      'Hidratação': 'Tratamentos',
      'Escova': 'Finalização',
      'Pintura': 'Coloração'
    };

    return categorias[nomeServico] || 'Serviços';
  }

  private getAgendamentosDoPeríodo(startDate: Date, endDate: Date) {
    const dateRange = this.getDateRange(startDate, endDate);
    const requests = dateRange.map((date: string) =>
      this.agendamentosService.getPorData(date).pipe(
        catchError((error: any) => {
          console.error('Erro ao buscar agendamentos', date, error);
          return of([]);
        })
      )
    );

    return forkJoin(requests).pipe(
      map((allAgendamentos: any[]) => this.normalizarAgendamentos(allAgendamentos.flat()))
    );
  }

  private calculateComissoesPorProfissional(
    vendas: VendaNormalizada[],
    profissionais: any[],
    servicosMap: Map<number, string>
  ): any[] {
    const comissoesPorProfissional = new Map();

    // Inicializar mapa com todos os profissionais
    profissionais.forEach(prof => {
      comissoesPorProfissional.set(prof.id, {
        profissional: prof.nome,
        especialidade: prof.especialidade,
        quantidadeServicos: 0,
        valorTotalServicos: 0,
        totalComissao: 0,
        servicosMaisFrequentes: new Map()
      });
    });

    // Processar vendas reais
    vendas.forEach((venda: VendaNormalizada) => {
      const profId = Number(venda?.profissionalId ?? 0);
      if (!profId || !comissoesPorProfissional.has(profId)) {
        return;
      }

      const valorVenda = Number(venda?.totalVenda ?? 0);
      if (!Number.isFinite(valorVenda) || valorVenda <= 0) {
        return;
      }

      const comissao = valorVenda * 0.3; // 30% de comissão
      const registro = comissoesPorProfissional.get(profId);
      registro.quantidadeServicos += 1;
      registro.valorTotalServicos += valorVenda;
      registro.totalComissao += comissao;

      const servicoId = Number(venda?.servicoId ?? 0);
      const servicoNome = (servicoId && servicosMap.get(servicoId)) || (servicoId ? `Serviço #${servicoId}` : '—');
      const servicoCount = registro.servicosMaisFrequentes.get(servicoNome) || 0;
      registro.servicosMaisFrequentes.set(servicoNome, servicoCount + 1);
    });

    // Filtrar apenas profissionais com serviços e formatar resultado
    return Array.from(comissoesPorProfissional.values())
      .filter((prof: any) => prof.quantidadeServicos > 0)
      .map((prof: any) => {
        const servicoMaisFrequente = prof.servicosMaisFrequentes.size > 0 ?
          [...prof.servicosMaisFrequentes.entries()].sort((a, b) => b[1] - a[1])[0][0] : 'N/A';

        return {
          profissional: prof.profissional,
          especialidade: prof.especialidade,
          quantidadeServicos: prof.quantidadeServicos,
          valorTotalServicos: prof.valorTotalServicos,
          totalComissao: prof.totalComissao,
          comissaoMedia: prof.totalComissao / prof.quantidadeServicos,
          servicoFavorito: servicoMaisFrequente
        };
      })
      .sort((a, b) => b.totalComissao - a.totalComissao);
  }

  private calculateAgendamentosPorProfissional(agendamentos: any[], profissionais: any[]): any[] {
    const agendamentosPorProfissional = new Map();

    // Inicializar mapa com todos os profissionais
    profissionais.forEach(prof => {
      agendamentosPorProfissional.set(prof.id, {
        profissional: prof.nome,
        especialidade: prof.especialidade,
        totalAgendamentos: 0,
        agendamentosConcluidos: 0,
        agendamentosCancelados: 0,
        agendamentosPendentes: 0
      });
    });

    // Processar todos os agendamentos
    agendamentos.forEach(agendamento => {
      if (agendamento.profissionalId) {
        const profId = agendamento.profissionalId;

        if (agendamentosPorProfissional.has(profId)) {
          const registro = agendamentosPorProfissional.get(profId);
          registro.totalAgendamentos += 1;

          switch (agendamento.status) {
            case 'Confirmado':
            case 'Finalizado':
              registro.agendamentosConcluidos += 1;
              break;
            case 'Cancelado':
              registro.agendamentosCancelados += 1;
              break;
            default:
              registro.agendamentosPendentes += 1;
              break;
          }
        }
      }
    });

    // Retornar apenas profissionais com agendamentos
    return Array.from(agendamentosPorProfissional.values())
      .filter((prof: any) => prof.totalAgendamentos > 0)
      .map((prof: any) => ({
        profissional: prof.profissional,
        especialidade: prof.especialidade,
        totalAgendamentos: prof.totalAgendamentos,
        agendamentosConcluidos: prof.agendamentosConcluidos,
        agendamentosCancelados: prof.agendamentosCancelados,
        agendamentosPendentes: prof.agendamentosPendentes,
        taxaConclusao: prof.totalAgendamentos > 0 ?
          ((prof.agendamentosConcluidos / prof.totalAgendamentos) * 100).toFixed(1) + '%' : '0%'
      }))
      .sort((a, b) => b.totalAgendamentos - a.totalAgendamentos);
  }

  // Função para testar conectividade básica da API
  testarConectividadeAPI(): void {
    console.log('=== TESTE DE CONECTIVIDADE DA API ===');

    const urlAPI = '/api/Agendamentos';
    console.log('🌐 Testando conectividade com:', urlAPI);

    // Fazer uma requisição simples sem parâmetros
    this.http.get(urlAPI, {
      headers: new HttpHeaders({
        'Accept': 'application/json',
        'Content-Type': 'application/json'
      })
    }).subscribe({
      next: (response) => {
        console.log('✅ API respondeu com sucesso:', response);
      },
      error: (erro) => {
        console.error('❌ Erro de conectividade da API:', erro);
        console.error('Status:', erro.status);
        console.error('Mensagem:', erro.message);
        console.error('URL:', erro.url);

        if (erro.status === 0) {
          console.log('💡 Erro de CORS ou servidor offline. Verifique se a API está rodando.');
        } else if (erro.status === 400) {
          console.log('💡 Bad Request - provavelmente problema no formato dos parâmetros.');
        } else if (erro.status === 404) {
          console.log('💡 Endpoint não encontrado - verifique a URL da API.');
        } else if (erro.status === 500) {
          console.log('💡 Erro interno do servidor - verifique os logs do backend.');
        }
      }
    });
  }
}
