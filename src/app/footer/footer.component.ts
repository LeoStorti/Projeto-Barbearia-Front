import { Component } from '@angular/core';
import { AuthService } from '../services/auth.service';

@Component({
  selector: 'app-footer',
  standalone: true,
  imports: [],
  templateUrl: './footer.component.html',
  styleUrl: './footer.component.css'
})
export class FooterComponent {

  readonly year = new Date().getFullYear();
  readonly nomeBarbearia: string;

  constructor(private readonly auth: AuthService) {
    this.nomeBarbearia = this.auth.getShopName();
  }
}
