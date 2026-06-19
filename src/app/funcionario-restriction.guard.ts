import { Injectable } from '@angular/core';
import { ActivatedRouteSnapshot, CanActivate, Router, RouterStateSnapshot } from '@angular/router';
import { catchError, map, of } from 'rxjs';
import { AuthService } from './services/auth.service';
import { UsuariosService } from './services/usuarios.service';

@Injectable({
  providedIn: 'root',
})
export class FuncionarioRestrictionGuard implements CanActivate {
  constructor(
    private readonly auth: AuthService,
    private readonly usuarios: UsuariosService,
    private readonly router: Router
  ) {}

  canActivate(route: ActivatedRouteSnapshot, state: RouterStateSnapshot): boolean | any {
    // Admin pode tudo
    if (this.auth.isAdmin()) return true;

    const roleHint = this.auth.getRoleHint();
    if (roleHint) {
      const isAdminRole = roleHint === 'admin' || roleHint === 'gerente' || roleHint === '1';
      this.auth.setCachedRole(isAdminRole ? 'Admin' : 'Funcionario');
      if (isAdminRole) return true;
      return this.deny(route, state);
    }

    // Se não conseguimos determinar via token/cache, consultamos a API (sincroniza com o backend real)
    const loginEmail = (this.auth.getLogin() ?? '').trim().toLowerCase();
    if (!loginEmail) {
      return this.deny(route, state);
    }

    // NOTE: CanActivate aceita Observable<boolean> também; TS permite retorno union.
    return this.usuarios.list().pipe(
      map((users: any[]) => {
        const u = (users ?? []).find((x: any) => (x?.email ?? '').toString().trim().toLowerCase() === loginEmail);
        const isAdmin = u?.nivelAcesso === 'Admin';
        this.auth.setCachedRole(isAdmin ? 'Admin' : 'Funcionario');
        if (isAdmin) return true;
        this.deny(route, state);
        return false;
      }),
      catchError(() => {
        // Em erro, assume não-admin
        this.auth.setCachedRole('Funcionario');
        this.deny(route, state);
        return of(false);
      })
    );
  }

  private deny(route: ActivatedRouteSnapshot, state: RouterStateSnapshot): boolean {
    const message =
      (route.data?.['denyMessage'] as string | undefined) ??
      'Acesso restrito: seu perfil não tem permissão para acessar esta página.';

    this.router.navigate(['/businessagendamentos'], {
      queryParams: {
        denied: message,
        from: state.url,
      },
    });

    return false;
  }
}
