import { Component, OnInit } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatInputModule } from '@angular/material/input';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-tela-de-login',
  standalone: true,
  imports: [
    MatButtonModule,
    MatInputModule,
    MatFormFieldModule,
    MatIconModule,
    CommonModule,
    ReactiveFormsModule
  ],
  templateUrl: './tela-de-login.component.html',
  styleUrls: ['./tela-de-login.component.css']
})
export class TelaDeLoginComponent implements OnInit {
  loginForm: FormGroup;
  errorMessage: string | null = null;
  isSubmitting = false;

  constructor(private authService: AuthService, private fb: FormBuilder) {
    this.loginForm = this.fb.group({
      login: ['', [Validators.required, Validators.email]],
      senha: ['', [Validators.required]]
    });

    // Impede que o navegador/autofill preencha credenciais (caso venha preenchendo ao abrir o link).
    // Também evita manter qualquer valor residual caso exista em memória.
    this.loginForm.patchValue({ login: '', senha: '' }, { emitEvent: false });
  }

  ngOnInit(): void {
    this.authService.warmupBackend();
  }

  onLogin() {
    console.log('=== BOTÃO LOGIN CLICADO ===');
    console.log('Form valid:', this.loginForm.valid);
    console.log('Form values:', this.loginForm.value);

    this.errorMessage = null;

    if (this.loginForm.valid) {
      const login = (this.loginForm.get('login')?.value ?? '').toString().trim();
      const senha = (this.loginForm.get('senha')?.value ?? '').toString();
      const loginData = { login, senha };
      console.log('📤 Enviando dados de login:', loginData);

      this.isSubmitting = true;
      this.authService.login(loginData).subscribe({
        next: (response) => {
          console.log('✅ Login successful response:', response);
          this.isSubmitting = false;
        },
        error: (error) => {
          console.error('❌ Login failed response:', error);
          this.isSubmitting = false;

          if (error?.status === 404) {
            this.errorMessage = 'Usuário não existe';
            return;
          }

          const err = error?.error;
          if (err?.message) {
            this.errorMessage = err.message;
            return;
          }

          // Suporte a ProblemDetails (application/problem+json)
          const pdErrors = err?.errors;
          if (pdErrors && typeof pdErrors === 'object') {
            const firstKey = Object.keys(pdErrors)[0];
            const firstVal = pdErrors[firstKey];
            const firstMsg = Array.isArray(firstVal) ? firstVal[0] : String(firstVal);
            this.errorMessage = firstMsg || err?.title || 'Erro de validação';
            return;
          }

          this.errorMessage = error?.message || 'Erro desconhecido';
        }
      });
    } else {
      console.error('❌ Formulário inválido!');
      this.errorMessage = 'Por favor, preencha todos os campos corretamente.';
    }
  }

  onLogout() {
    this.authService.logout();
  }

  isLoggedIn(): boolean {
    return this.authService.isLoggedIn();
  }
}
