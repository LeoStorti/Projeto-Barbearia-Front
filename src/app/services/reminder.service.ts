import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';

export interface ReminderPayload {
  agendamentoId: number;
  clienteId: number;
  channels: ('email'|'sms'|'whatsapp'|'push')[];
  minutesBefore: number;
  enabled: boolean;
}

@Injectable({ providedIn: 'root' })
export class ReminderService {
  private base = '/api/notifications';
  constructor(private http: HttpClient) {}

  schedule(payload: ReminderPayload): Observable<any> {
    return this.http.post(`${this.base}/schedule`, payload);
  }

  sendNow(payload: ReminderPayload) {
    return this.http.post(`${this.base}/send`, payload);
  }

  cancel(agendamentoId: number) {
    return this.http.post(`${this.base}/cancel`, { agendamentoId });
  }
}
