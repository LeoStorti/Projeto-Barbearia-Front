import { Component, OnInit, ViewChild, TemplateRef, AfterViewInit, ViewEncapsulation } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { MatTableDataSource, MatTableModule } from '@angular/material/table';
import { MatPaginator, MatPaginatorModule } from '@angular/material/paginator';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';

import { UsuariosService, UsuarioDto, NivelAcessoUsuario } from 'app/services/usuarios.service';
import { AuthService } from 'app/services/auth.service';

@Component({
  selector: 'app-business-usuarios',
  standalone: true,
  encapsulation: ViewEncapsulation.None,
  imports: [
    CommonModule,
    FormsModule,
    MatTableModule,
    MatPaginatorModule,
    MatButtonModule,
    MatIconModule,
    MatTooltipModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatSnackBarModule
  ],
  templateUrl: './business-usuarios.component.html',
  styleUrls: ['./business-usuarios.component.css']
})
export class BusinessUsuarios implements OnInit, AfterViewInit {
  displayedColumns: string[] = ['nomeUsuario', 'email', 'nivelAcesso', 'acoes'];
  dataSourceUsuarios = new MatTableDataSource<UsuarioDto>([]);

  filtro: string = '';

  usuarioForm: {
    usuarioId?: number;
    nomeUsuario: string;
    email: string;
    senha: string;
    nivelAcesso: NivelAcessoUsuario;
  } = {
    nomeUsuario: '',
    email: '',
    senha: '',
    nivelAcesso: 'Funcionario'
  };

  usuarioEditando: boolean = false;
  dialogRef: any;
  private senhaOriginal: string = '';
  readonly podeExcluir: boolean;

  @ViewChild(MatPaginator) paginator!: MatPaginator;
  @ViewChild('modalUsuario') modalUsuarioTemplate!: TemplateRef<any>;

  constructor(
    private usuariosService: UsuariosService,
    private authService: AuthService,
    private snackBar: MatSnackBar,
    public dialog: MatDialog
  ) {
    this.podeExcluir = this.authService.isAdmin();
  }

  ngOnInit(): void {
    this.carregarUsuarios();
  }

  ngAfterViewInit(): void {
    this.dataSourceUsuarios.paginator = this.paginator;
  }

  carregarUsuarios(): void {
    this.usuariosService.list().subscribe({
      next: (data) => {
        this.dataSourceUsuarios.data = (data ?? []).map(u => ({
          ...u,
          nomeUsuario: u.nomeUsuario ?? '',
          email: u.email ?? '',
          nivelAcesso: u.nivelAcesso ?? 'Funcionario'
        }));
        if (this.paginator) this.dataSourceUsuarios.paginator = this.paginator;
        this.aplicarFiltro();
      },
      error: (err) => {
        console.error('❌ Erro ao carregar usuários:', err);
        this.dataSourceUsuarios.data = [];
      }
    });
  }

  abrirModalUsuario(usuario?: UsuarioDto): void {
    if (usuario) {
      this.senhaOriginal = (usuario.senha ?? '').toString();
      this.usuarioForm = {
        usuarioId: usuario.usuarioId,
        nomeUsuario: usuario.nomeUsuario,
        email: usuario.email,
        senha: '', // não exibimos senha existente
        nivelAcesso: usuario.nivelAcesso
      };
      this.usuarioEditando = true;
    } else {
      this.senhaOriginal = '';
      this.usuarioForm = {
        nomeUsuario: '',
        email: '',
        senha: '',
        nivelAcesso: 'Funcionario'
      };
      this.usuarioEditando = false;
    }

    this.dialogRef = this.dialog.open(this.modalUsuarioTemplate, {
      width: '560px',
      disableClose: true,
      panelClass: 'custom-dialog-container'
    });
  }

  fecharModalUsuario(): void {
    if (this.dialogRef) this.dialogRef.close();
  }

  salvarUsuario(): void {
    const nomeUsuario = (this.usuarioForm.nomeUsuario ?? '').trim();
    const email = (this.usuarioForm.email ?? '').trim();
    if (!nomeUsuario) {
      alert('Nome é obrigatório');
      return;
    }

    if (!email) {
      alert('Email é obrigatório');
      return;
    }

    if (!this.usuarioEditando) {
      const senha = (this.usuarioForm.senha ?? '').trim();
      if (!senha) {
        alert('Senha é obrigatória para criar usuário');
        return;
      }

      this.usuariosService.create({
        nomeUsuario,
        email,
        senha,
        nivelAcesso: this.usuarioForm.nivelAcesso
      }).subscribe({
        next: () => {
          this.snackBar.open('Usuario criado com sucesso!', 'Fechar', {
            duration: 3000,
            horizontalPosition: 'right',
            verticalPosition: 'top'
          });
          this.fecharModalUsuario();
          this.carregarUsuarios();
        },
        error: (err) => {
          console.error('❌ Erro ao criar usuário:', err);
          alert('Não foi possível criar o usuário.');
        }
      });
      return;
    }

    const usuarioId = this.usuarioForm.usuarioId;
    if (!usuarioId && usuarioId !== 0) {
      alert('Usuário inválido');
      return;
    }

    const payload: any = {
      nomeUsuario,
      email,
      nivelAcesso: this.usuarioForm.nivelAcesso
    };

    const senhaDigitada = (this.usuarioForm.senha ?? '').trim();
    const senhaParaEnviar = senhaDigitada || (this.senhaOriginal ?? '').trim();
    if (!senhaParaEnviar) {
      alert('Senha é obrigatória para atualizar usuário');
      return;
    }
    payload.senha = senhaParaEnviar;

    this.usuariosService.update(usuarioId, payload).subscribe({
      next: () => {
        this.fecharModalUsuario();
        this.carregarUsuarios();
      },
      error: (err) => {
        console.error('❌ Erro ao atualizar usuário:', err);
        alert('Não foi possível atualizar o usuário.');
      }
    });
  }

  aplicarFiltro(): void {
    this.dataSourceUsuarios.filterPredicate = (data: UsuarioDto, filter: string): boolean => {
      const term = (filter ?? '').toLowerCase();
      return (
        (data.nomeUsuario ?? '').toLowerCase().includes(term) ||
        (data.email ?? '').toLowerCase().includes(term) ||
        this.getNivelAcessoLabel(data.nivelAcesso).toLowerCase().includes(term)
      );
    };

    this.dataSourceUsuarios.filter = (this.filtro ?? '').trim().toLowerCase();
  }

  usuariosVisiveisMobile(): UsuarioDto[] {
    const source = this.dataSourceUsuarios.filteredData ?? this.dataSourceUsuarios.data;
    if (!this.paginator) return source;
    const pageSize = Number(this.paginator.pageSize || 10);
    const pageIndex = Number(this.paginator.pageIndex || 0);
    const start = pageIndex * pageSize;
    return source.slice(start, start + pageSize);
  }

  trackByUsuarioId(_index: number, usuario: UsuarioDto): number {
    return Number(usuario?.usuarioId ?? 0);
  }

  getCurrentDate(): string {
    return new Date().toLocaleDateString('pt-BR', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    });
  }

  getNivelAcessoLabel(nivel: NivelAcessoUsuario): string {
    return nivel === 'Admin' ? 'Admin' : 'Funcionário';
  }

  excluirUsuario(usuario: UsuarioDto): void {
    if (!this.podeExcluir) return;

    if (!confirm(`Tem certeza que deseja excluir o usuário ${usuario.email}?`)) return;

    this.usuariosService.delete(usuario.usuarioId).subscribe({
      next: () => this.carregarUsuarios(),
      error: (err) => {
        console.error('❌ Erro ao excluir usuário:', err);
        alert('Não foi possível excluir o usuário.');
      }
    });
  }
}
