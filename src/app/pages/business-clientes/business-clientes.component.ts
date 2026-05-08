import { MatDialog, MatDialogContent, MatDialogActions, MatDialogTitle, MatDialogModule } from '@angular/material/dialog';
import { MatIcon } from '@angular/material/icon';
import { Component, OnInit, AfterViewInit, ViewChild, TemplateRef, ViewEncapsulation } from '@angular/core';
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
import { ActivatedRoute, Router } from '@angular/router';
import { AuthService } from '../../services/auth.service';
import { ClientesService, Clientes } from '../../services/clientes.service';
import { MatCardModule } from '@angular/material/card';
import { MatPaginator } from '@angular/material/paginator';
import { MatPaginatorModule } from '@angular/material/paginator';
import { MatDatepicker, MatDatepickerModule } from '@angular/material/datepicker';
import { MatSelectModule } from '@angular/material/select';
import { MatOptionModule, MatNativeDateModule } from '@angular/material/core';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';

export interface Venda {
  vendaId: number;
  dataVenda: string;
  clienteId: number;
  totalVenda: number;
}

@Component({
  selector: 'app-frm-clientes-cadastro',
  standalone: true,
  encapsulation: ViewEncapsulation.None,
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
    MatPaginatorModule,
    MatIcon,
    MatDialogContent,
    MatDialogActions,
    MatDialogTitle,
    MatDialogModule,
    MatDatepicker,
    MatDatepickerModule,
    MatSelectModule,
    MatOptionModule,
    MatNativeDateModule,
    MatTooltipModule,
    MatSnackBarModule
  ],
  templateUrl: './business-clientes.component.html',
  styleUrls: ['./business-clientes.component.css'],
})
export class BusinessClientes implements OnInit, AfterViewInit {
  // Controle do modal e formulário do cliente
  clienteForm: any = {
    ClienteId: 0,
    Nome: '',
    Telefone: '',
    Email: '',
    DataNascimento: '',
    Endereco: '',
    Observacoes: '',
    Alergias: ''
  };
  clienteEditando: boolean = false;
  dialogRef: any;
  displayedColumnsClientes: string[] = ['nome', 'email', 'telefone', 'endereco', 'dataNascimento', 'observacoes', 'alergias', 'acoes'];
  displayedColumnsServicos: string[] = ['clienteId', 'servico', 'dataVenda', 'totalVenda'];

  dataSourceClientes = new MatTableDataSource<Clientes>();
  dataSourceServicos = new MatTableDataSource<Venda>();

  filtroNome: string = '';
  clienteSelecionado: Clientes | null = null;
  clienteId: number = 0;
  cliente: any = {};
  activeTabIndex = 2;
  nome: string = '';
  telefone: string = '';
  email: string = '';
  dataNascimento: string = '';
  endereco: string = '';
  observacoes: string = '';
  alergias: string = '';

  userName: string = '';
  loginTime: string = '';
  @ViewChild(MatPaginator) paginator!: MatPaginator;
  @ViewChild('modalCliente') modalClienteTemplate!: TemplateRef<any>;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private http: HttpClient,
    private authService: AuthService,
    private clientesService: ClientesService,
    private snackBar: MatSnackBar,
    public dialog: MatDialog
  ) {}

  private formatHttpError(userMessage: string, error: any): string {
    const lines: string[] = [userMessage];

    const status = error?.status;
    const statusText = String(error?.statusText ?? '').trim();
    const url = String(error?.url ?? '').trim();
    const msg = String(error?.message ?? '').trim();

    const correlationId = String(error?.__correlationId ?? '').trim();

    if (status !== undefined && status !== null) {
      lines.push(`Status: ${status}${statusText ? ' - ' + statusText : ''}`);
    }
    if (url) {
      lines.push(`URL: ${url}`);
    }
    if (msg) {
      lines.push(`Mensagem: ${msg}`);
    }
    if (correlationId) {
      lines.push(`CorrelationId: ${correlationId}`);
    }

    // Alguns backends/proxies colocam IDs úteis nos headers
    try {
      const headers = error?.headers;
      if (headers && typeof headers.get === 'function') {
        const candidates = ['traceparent', 'request-id', 'x-request-id', 'x-correlation-id'];
        for (const key of candidates) {
          const val = String(headers.get(key) ?? '').trim();
          if (val) {
            lines.push(`${key}: ${val}`);
          }
        }
      }
    } catch {
      // ignore
    }

    const body = error?.error;
    if (body) {
      if (typeof body === 'string') {
        const text = body.trim();
        if (text) {
          // Evita alert gigantesco
          const snippet = text.length > 800 ? `${text.slice(0, 800)}...` : text;
          lines.push(`Resposta: ${snippet}`);
        }
      } else if (typeof body === 'object') {
        const title = String((body as any)?.title ?? '').trim();
        const detail = String((body as any)?.detail ?? '').trim();
        const message = String((body as any)?.message ?? '').trim();
        const traceId = String((body as any)?.traceId ?? (body as any)?.TraceId ?? '').trim();

        if (title) lines.push(`Erro: ${title}`);
        if (message && message !== title) lines.push(`Mensagem: ${message}`);
        if (detail) lines.push(`Detalhe: ${detail}`);
        if (traceId) lines.push(`TraceId: ${traceId}`);

        const errors = (body as any)?.errors;
        if (errors && typeof errors === 'object') {
          const entries = Object.entries(errors as Record<string, any>);
          if (entries.length) {
            lines.push('Erros de validação:');
            for (const [field, msgs] of entries) {
              if (Array.isArray(msgs)) {
                lines.push(`- ${field}: ${msgs.join(' | ')}`);
              } else if (msgs !== undefined && msgs !== null) {
                lines.push(`- ${field}: ${String(msgs)}`);
              }
            }
          }
        }
      }
    }

    return lines.join('\n');
  }

  onClientesOverflow(hasOverflow: boolean) {
    // Futuramente poderemos mostrar um indicador visual; por enquanto apenas log.
    if (hasOverflow) {
      console.debug('[Clientes] Tabela possui overflow vertical.');
    } else {
      console.debug('[Clientes] Tabela cabe sem scroll.');
    }
  }
  abrirModalCliente(cliente?: any): void {
    console.log('🔧 Tentando abrir modal cliente...', { cliente, template: this.modalClienteTemplate });

    if (cliente) {
      // O datepicker do Angular Material funciona melhor com Date.
      // Quando o dado vem da API normalmente chega como string.
      let dataNascimento: any = cliente?.DataNascimento;
      if (typeof dataNascimento === 'string' && dataNascimento.trim()) {
        const d = new Date(dataNascimento);
        if (!Number.isNaN(d.getTime())) {
          dataNascimento = d;
        }
      }

      this.clienteForm = { ...cliente, DataNascimento: dataNascimento };
      this.clienteEditando = true;
    } else {
      this.clienteForm = {
        ClienteId: 0,
        Nome: '',
        Telefone: '',
        Email: '',
        DataNascimento: '',
        Endereco: '',
        Observacoes: '',
        Alergias: ''
      };
      this.clienteEditando = false;
    }

    try {
      // Abre o modal usando MatDialog
      this.dialogRef = this.dialog.open(this.modalClienteTemplate, {
        width: '500px',
        disableClose: true,
        panelClass: 'custom-dialog-container'
      });
      console.log('✅ Modal aberto com sucesso!', this.dialogRef);
    } catch (error) {
      console.error('❌ Erro ao abrir modal:', error);
    }
  }  fecharModalCliente(): void {
    if (this.dialogRef) {
      this.dialogRef.close();
    }
  }

  salvarCliente(): void {
    if (this.clienteEditando) {
      // Atualizar cliente existente
      this.clientesService.atualizarCliente(this.clienteForm.ClienteId, this.clienteForm).subscribe(
        (data: Clientes) => {
          console.log('✅ Cliente atualizado:', data);
          this.snackBar.open('Cliente atualizado com sucesso!', 'Fechar', { duration: 3000 });
          this.carregarTodosClientes();
          this.fecharModalCliente();
        },
        (error: any) => {
          console.error('❌ Erro ao atualizar cliente:', error);
          alert(this.formatHttpError('Erro ao atualizar cliente!', error));
        }
      );
    } else {
      // Adicionar novo cliente
      this.clientesService.criarCliente(this.clienteForm).subscribe(
        (data: Clientes) => {
          console.log('✅ Cliente criado:', data);
          this.snackBar.open('Cliente criado com sucesso!', 'Fechar', { duration: 3000 });
          this.carregarTodosClientes();
          this.fecharModalCliente();
        },
        (error: any) => {
          console.error('❌ Erro ao adicionar cliente:', error);
          alert(this.formatHttpError('Erro ao adicionar cliente!', error));
        }
      );
    }
  }

  excluirCliente(cliente: any): void {
    if (confirm('Tem certeza que deseja excluir este cliente?')) {
      this.clientesService.excluirCliente(cliente.ClienteId).subscribe(
        () => {
          console.log('✅ Cliente excluído com sucesso');
          this.snackBar.open('Cliente excluído com sucesso!', 'Fechar', { duration: 3000 });
          this.carregarTodosClientes();
        },
        (error: any) => {
          console.error('❌ Erro ao excluir cliente:', error);
          alert('Erro ao excluir cliente!');
        }
      );
    }
  }

  aplicarFiltroNome(): void {
    this.dataSourceClientes.filterPredicate = (data: Clientes, filter: string): boolean => {
      const searchTerm = filter.toLowerCase();
      return Boolean(
        (data.Nome && data.Nome.toLowerCase().includes(searchTerm)) ||
        (data.Email && data.Email.toLowerCase().includes(searchTerm)) ||
        (data.Telefone && data.Telefone.toLowerCase().includes(searchTerm)) ||
        (data.Endereco && data.Endereco.toLowerCase().includes(searchTerm))
      );
    };
    this.dataSourceClientes.filter = this.filtroNome.trim().toLowerCase();
  }

  limparFiltroNome(): void {
    this.filtroNome = '';
    this.aplicarFiltroNome();
  }

  ngOnInit(): void {
    console.log('🚀 Componente BusinessClientes inicializado');
    this.carregarTodosClientes();
    this.carregarHistoricoServicos();

    this.userName = this.authService.getUserName();
    this.loginTime = this.authService.getSessionDuration();

    this.route.paramMap.subscribe((params) => {
      this.clienteId = +params.get('id')!;
      if (this.clienteId) {
        this.carregarDadosCliente(this.clienteId);
      }
      this.activeTabIndex = this.clienteId ? 1 : 0;
      if (!this.clienteId) {
        this.activeTabIndex = 1;
      }
    });
    this.carregarTodosClientes();
  }

  carregarDadosCliente(id: number): void {
    this.clientesService.getClienteById(id).subscribe(
      (data: Clientes) => {
        this.clienteSelecionado = data;
      },
      (error: any) => {
        console.error('Erro ao carregar dados do cliente', error);
      }
    );
  }

  carregarTodosClientes(): void {
    console.log('🔄 Iniciando carregamento de clientes via service...');
    this.clientesService.getClientes().subscribe(
      (data: Clientes[]) => {
        console.log('✅ Dados recebidos da API:', data);
        console.log('📊 Quantidade de clientes:', data.length);
        this.dataSourceClientes.data = data;
        console.log('🔗 DataSource atualizado:', this.dataSourceClientes.data);

        // Força a atualização da tabela
        if (this.paginator) {
          this.dataSourceClientes.paginator = this.paginator;
          console.log('🔄 Paginator reconectado após carregar dados');
        }
      },
      (error) => {
        console.error('❌ Erro ao carregar todos os clientes:', error);
        console.error('📋 Detalhes do erro:', {
          status: error.status,
          statusText: error.statusText,
          message: error.message,
          url: error.url
        });
      }
    );
  }

  ngAfterViewInit() {
    this.dataSourceClientes.paginator = this.paginator;
    console.log('📋 Paginator configurado:', this.paginator);
    console.log('� Modal template:', this.modalClienteTemplate);
    console.log('�🔢 Dados no DataSource após configurar paginator:', this.dataSourceClientes.data.length);
  }

  carregarHistoricoServicos(): void {
  this.http.get<Venda[]>('/api/Venda').subscribe(
      (data: Venda[]) => {
        this.dataSourceServicos.data = data;
      },
      (error: any) => {
        console.error('Erro ao carregar histórico de serviços', error);
      }
    );
  }

  adicionarCliente(): void {
    const novoCliente: Clientes = {
      ClienteId: 0,
      Nome: this.nome,
      Telefone: this.telefone,
      Email: this.email,
      DataNascimento: this.dataNascimento,
      Endereco: this.endereco,
      Observacoes: this.observacoes,
      Alergias: this.alergias,
    };

    this.clientesService.criarCliente(novoCliente).subscribe(
      (data: Clientes) => {
        alert('Cadastro realizado com sucesso!');
        this.carregarTodosClientes();
        this.limparFormulario();
      },
      (error) => {
        console.error('❌ Erro ao adicionar cliente (form antigo):', error);
        alert(this.formatHttpError('Erro ao adicionar cliente!', error));
      }
    );
  }

  limparFormulario(): void {
    this.nome = '';
    this.telefone = '';
    this.email = '';
    this.dataNascimento = '';
    this.endereco = '';
    this.observacoes = '';
    this.alergias = '';
  }

  getCurrentDate(): string {
    return new Date().toLocaleDateString('pt-BR', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    });
  }
}
