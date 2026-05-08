import { ComponentFixture, TestBed } from '@angular/core/testing';
import { AuthService } from '../../services/auth.service';
import { TelaDeLoginComponent } from './tela-de-login.component';

describe('TelaDeLoginComponent', () => {
  let component: TelaDeLoginComponent;
  let fixture: ComponentFixture<TelaDeLoginComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TelaDeLoginComponent],
      providers: [
        {
          provide: AuthService,
          useValue: {
            login: () => ({ subscribe: () => ({}) }),
            logout: () => undefined,
            isLoggedIn: () => false
          }
        }
      ]
    })
    .compileComponents();

    fixture = TestBed.createComponent(TelaDeLoginComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
