import { Injectable, inject, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { BehaviorSubject, Observable, timer } from 'rxjs';
import { HttpClient } from '@angular/common/http';

export interface Notification {
  id: string;
  type: 'info' | 'success' | 'warning' | 'error';
  title: string;
  message: string;
  timestamp: Date;
  read: boolean;
  action?: {
    label: string;
    url: string;
  };
}

export interface NotificationConfig {
  position: 'top-right' | 'top-left' | 'bottom-right' | 'bottom-left';
  duration: number;
  maxNotifications: number;
  sound: boolean;
}

@Injectable({
  providedIn: 'root'
})
export class NotificationService {
  private notifications = new BehaviorSubject<Notification[]>([]);
  private config: NotificationConfig = {
    position: 'top-right',
    duration: 5000,
    maxNotifications: 5,
    sound: true
  };

  private readonly platformId = inject(PLATFORM_ID);

  constructor(private http: HttpClient) {
    if (isPlatformBrowser(this.platformId)) {
      this.loadNotifications();
      this.startPolling();
    }
  }

  getNotifications(): Observable<Notification[]> {
    return this.notifications.asObservable();
  }

  getUnreadCount(): Observable<number> {
    return new BehaviorSubject(
      this.notifications.value.filter(n => !n.read).length
    ).asObservable();
  }

  showNotification(notification: Omit<Notification, 'id' | 'timestamp' | 'read'>): void {
    const newNotification: Notification = {
      ...notification,
      id: this.generateId(),
      timestamp: new Date(),
      read: false
    };

    const current = this.notifications.value;
    const updated = [newNotification, ...current].slice(0, this.config.maxNotifications);

    this.notifications.next(updated);
    this.saveNotifications(updated);

    if (this.config.sound) {
      this.playNotificationSound();
    }

    // Auto remove notification after duration
    if (this.config.duration > 0) {
      timer(this.config.duration).subscribe(() => {
        this.removeNotification(newNotification.id);
      });
    }
  }

  removeNotification(id: string): void {
    const current = this.notifications.value;
    const updated = current.filter(n => n.id !== id);
    this.notifications.next(updated);
    this.saveNotifications(updated);
  }

  markAsRead(id: string): void {
    const current = this.notifications.value;
    const updated = current.map(n =>
      n.id === id ? { ...n, read: true } : n
    );
    this.notifications.next(updated);
    this.saveNotifications(updated);
  }

  markAllAsRead(): void {
    const current = this.notifications.value;
    const updated = current.map(n => ({ ...n, read: true }));
    this.notifications.next(updated);
    this.saveNotifications(updated);
  }

  clearAll(): void {
    this.notifications.next([]);
    this.saveNotifications([]);
  }

  // Notification Templates
  showAgendamentoNotification(clienteNome: string, servico: string, horario: string): void {
    this.showNotification({
      type: 'info',
      title: 'Novo Agendamento',
      message: `${clienteNome} agendou ${servico} para ${horario}`,
      action: {
        label: 'Ver Agenda',
        url: '/businessagendamentos'
      }
    });
  }

  showCancelamentoNotification(clienteNome: string, servico: string): void {
    this.showNotification({
      type: 'warning',
      title: 'Agendamento Cancelado',
      message: `${clienteNome} cancelou o agendamento de ${servico}`,
      action: {
        label: 'Ver Agenda',
        url: '/businessagendamentos'
      }
    });
  }

  showEstoqueBaixoNotification(produto: string, quantidade: number): void {
    this.showNotification({
      type: 'warning',
      title: 'Estoque Baixo',
      message: `${produto} tem apenas ${quantidade} unidades restantes`,
      action: {
        label: 'Ver Produtos',
        url: '/businessprodutos'
      }
    });
  }

  showMetaAlcancadaNotification(meta: string, valor: number): void {
    this.showNotification({
      type: 'success',
      title: 'Meta Alcançada! 🎉',
      message: `${meta}: ${valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}`,
      action: {
        label: 'Ver Performance',
        url: '/businessperformance'
      }
    });
  }

  showAniversarioClienteNotification(clienteNome: string): void {
    this.showNotification({
      type: 'info',
      title: 'Aniversário do Cliente 🎂',
      message: `Hoje é aniversário de ${clienteNome}! Que tal enviar uma mensagem especial?`,
      action: {
        label: 'Ver Cliente',
        url: '/businessclientes'
      }
    });
  }

  private generateId(): string {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
  }

  private loadNotifications(): void {
    if (!isPlatformBrowser(this.platformId)) return;
    const stored = typeof localStorage !== 'undefined' ? localStorage.getItem('barbearia_notifications') : null;
    if (stored) {
      try {
        const notifications = JSON.parse(stored).map((n: any) => ({
          ...n,
          timestamp: new Date(n.timestamp)
        }));
        this.notifications.next(notifications);
      } catch (error) {
        console.error('Erro ao carregar notificações:', error);
      }
    }
  }

  private saveNotifications(notifications: Notification[]): void {
    if (!isPlatformBrowser(this.platformId)) return;
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem('barbearia_notifications', JSON.stringify(notifications));
  }

  private playNotificationSound(): void {
    if (!isPlatformBrowser(this.platformId)) return;
    if (typeof window !== 'undefined' && 'Audio' in window) {
      const audio = new Audio('data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a2/LDciUFLIHO8tiJNwgZaLvt559NEAxQp+PwtmMcBjiR1/LMeSwFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhCTOa2e+4aCEGJXfI8N+SQQsVYLL1675eGAg7k9n1xXUoBjCRyO/CfSoGLIHH7+CVQQ8YbrLq4qlUFAhKntT5wnUSBSaN1e7Bfz8QH2Kd1eq7VC0MIGWx5unY');
      audio.play().catch(() => {
        // Silently handle audio play errors
      });
    }
  }

  private startPolling(): void {
    if (!isPlatformBrowser(this.platformId)) return;
    // Poll for new notifications every 30 seconds
    timer(0, 30000).subscribe(() => {
      this.checkForNewNotifications();
    });
  }

  private checkForNewNotifications(): void {
    // Simulate checking for new notifications
    // In a real app, this would make HTTP requests to your backend
    this.simulateNotifications();
  }

  private simulateNotifications(): void {
    const random = Math.random();

    if (random < 0.1) { // 10% chance
      const agendamentos = [
        'João Silva agendou Corte Masculino para 14:00',
        'Maria Santos agendou Barba para 15:30',
        'Pedro Costa agendou Corte + Barba para 16:00'
      ];

      const message = agendamentos[Math.floor(Math.random() * agendamentos.length)];
      this.showNotification({
        type: 'info',
        title: 'Novo Agendamento',
        message,
        action: {
          label: 'Ver Agenda',
          url: '/businessagendamentos'
        }
      });
    }
  }
}
