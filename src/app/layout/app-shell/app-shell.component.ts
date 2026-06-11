import { Component, computed, signal, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { NavigationEnd, Router, RouterModule } from '@angular/router';
import { filter } from 'rxjs/operators';
import { Subscription } from 'rxjs';
import { BreakpointObserver, Breakpoints } from '@angular/cdk/layout';

import { MatSidenavModule } from '@angular/material/sidenav';
import { MatListModule } from '@angular/material/list';
import { MatIconModule } from '@angular/material/icon';
import { MatExpansionModule } from '@angular/material/expansion';
import { MatButtonModule } from '@angular/material/button';

import { ThemeToggleComponent } from '../../theme-toggle/theme-toggle.component';
import { FooterComponent } from '../../footer/footer.component';
import { AuthService } from '../../services/auth.service';

type NavItem = {
  label: string;
  route: string;
  icon?: string;
  exact?: boolean;
};

type NavSection = {
  label: string;
  items: NavItem[];
  expanded?: boolean;
};

@Component({
  selector: 'app-shell',
  standalone: true,
  imports: [
    CommonModule,
    RouterModule,
    MatSidenavModule,
    MatListModule,
    MatIconModule,
    MatExpansionModule,
    MatButtonModule,
    ThemeToggleComponent,
    FooterComponent,
  ],
  templateUrl: './app-shell.component.html',
  styleUrl: './app-shell.component.css',
})
export class AppShellComponent implements OnDestroy {
  private readonly currentUrl = signal<string>('');
  private readonly accessDeniedMessage = signal<string>('');
  private readonly _subs = new Subscription();

  readonly userName = signal<string>('');
  readonly loggedSince = signal<string>('');
  readonly isMobile = signal<boolean>(false);
  readonly sidenavOpened = signal<boolean>(true);

  readonly sections: NavSection[] = [
    {
      label: 'Visão geral',
      expanded: true,
      items: [{ label: 'Dashboard', route: '/businessperformance', icon: 'dashboard', exact: true }],
    },
    {
      label: 'Operação',
      expanded: true,
      items: [{ label: 'Agendamentos', route: '/businessagendamentos', icon: 'event' }],
    },
    {
      label: 'Cadastros',
      expanded: true,
      items: [
        { label: 'Clientes', route: '/businessclientes', icon: 'people' },
        { label: 'Serviços', route: '/businessservicos', icon: 'content_cut' },
        { label: 'Produtos', route: '/businessprodutos', icon: 'inventory_2' },
        { label: 'Profissionais', route: '/businessprofissionais', icon: 'badge' },
        { label: 'Usuários', route: '/businessusuarios', icon: 'manage_accounts' },
      ],
    },
    {
      label: 'Financeiro',
      expanded: true,
      items: [{ label: 'Pagamentos', route: '/businesspagamentos', icon: 'payments' }],
    },
    {
      label: 'Relatórios',
      expanded: false,
      items: [{ label: 'Relatórios', route: '/businessrelatorios', icon: 'bar_chart' }],
    },
  ];

  readonly pageTitle = computed(() => this.getTitleForUrl(this.currentUrl()));
  readonly deniedMessage = computed(() => this.accessDeniedMessage());

  constructor(
    private readonly router: Router,
    private readonly authService: AuthService,
    private readonly breakpointObserver: BreakpointObserver
  ) {
    this.currentUrl.set(this.router.url);
    this.updateDeniedFromUrl(this.router.url);
    this.refreshUserBlock();

    this._subs.add(
      this.breakpointObserver.observe([Breakpoints.Handset, Breakpoints.TabletPortrait]).subscribe(result => {
        const mobile = result.matches;
        this.isMobile.set(mobile);
        this.sidenavOpened.set(!mobile);
      })
    );

    this._subs.add(
      this.router.events
        .pipe(
          filter((event): event is NavigationEnd => event instanceof NavigationEnd)
        )
        .subscribe((event) => {
          this.currentUrl.set(event.urlAfterRedirects);
          this.updateDeniedFromUrl(event.urlAfterRedirects);
          this.refreshUserBlock();
          if (this.isMobile()) {
            this.sidenavOpened.set(false);
          }
        })
    );
  }

  ngOnDestroy(): void {
    this._subs.unsubscribe();
  }

  toggleSidenav(): void {
    this.sidenavOpened.update(v => !v);
  }

  private refreshUserBlock(): void {
    this.userName.set(this.authService.getUserName());
    this.loggedSince.set(this.authService.getLoginSinceTimeText());
  }

  private updateDeniedFromUrl(url: string): void {
    try {
      const tree = this.router.parseUrl(url);
      const msg = (tree.queryParams?.['denied'] ?? '').toString();
      this.accessDeniedMessage.set(msg);
    } catch {
      this.accessDeniedMessage.set('');
    }
  }

  private getTitleForUrl(url: string): string {
    const match = this.sections
      .flatMap((s) => s.items)
      .find((i) => url === i.route || url.startsWith(i.route + '/'));

    return match?.label ?? 'Barbearia';
  }

  onLogout(): void {
    this.authService.logout();
  }
}
