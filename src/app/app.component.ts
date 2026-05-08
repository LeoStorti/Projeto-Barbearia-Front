import { Component } from '@angular/core';
import { NavigationEnd, Router, RouterOutlet } from '@angular/router';
import { FooterComponent } from "./footer/footer.component";
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { ThemeService } from './services/theme.service';
import { AppShellComponent } from './layout/app-shell/app-shell.component';


@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, FooterComponent, AppShellComponent, CommonModule, RouterModule],
  templateUrl: './app.component.html',
  styleUrl: './app.component.css',

})
export class AppComponent {
  isShellVisible: boolean = true;

  constructor(private router: Router, private themeService: ThemeService) {
    // O ThemeService já se inicializa automaticamente

    this.router.events.subscribe(event => {
      if (event instanceof NavigationEnd) {
        // Esconde o AppShell (sidebar/topbar) na rota de login
        const url = event.urlAfterRedirects || event.url;
        this.isShellVisible = !url.startsWith('/login') && !url.startsWith('/agendar');
      }
    });
  }
}
