import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { throwError } from 'rxjs';

export type PublicService = {
  id: number;
  nome: string;
  duracaoMinutos: number;
};

export type PublicCatalogResponse = {
  shopSlug: string;
  services: PublicService[];
};

export type PublicAvailabilityResponse = {
  date: string; // YYYY-MM-DD
  serviceId: number;
  slots: string[]; // HH:mm
  blocked?: boolean;
  reason?: string | null;
};

export type PublicCreateAppointmentRequest = {
  serviceId: number;
  date: string; // YYYY-MM-DD
  time: string; // HH:mm
  customerName: string;
  customerWhatsapp: string;
};

export type PublicCreateAppointmentResponse = {
  appointmentId: string;
  customerId: string;
  customerWhatsapp: string;
  status: 'pending' | 'confirmed';
};

export type PublicCancelAppointmentRequest = {
  customerId?: string;
  customerWhatsapp?: string;
  reason?: string;
};

export type PublicCancelAppointmentResponse = {
  status?: 'cancelled' | 'canceled' | 'ok';
};

@Injectable({ providedIn: 'root' })
export class PublicAgendamentosService {
  private readonly http = inject(HttpClient);

  getCatalog(shopSlug: string): Observable<PublicCatalogResponse> {
    const url = `/api/public/shops/${encodeURIComponent(shopSlug)}/catalog`;
    return this.http.get<PublicCatalogResponse>(url);
  }

  getAvailability(shopSlug: string, serviceId: number, date: string): Observable<PublicAvailabilityResponse> {
    const url = `/api/public/shops/${encodeURIComponent(shopSlug)}/availability`;
    const params = new HttpParams().set('serviceId', String(serviceId)).set('date', date);
    return this.http.get<PublicAvailabilityResponse>(url, { params });
  }

  createAppointment(shopSlug: string, request: PublicCreateAppointmentRequest): Observable<PublicCreateAppointmentResponse> {
    const url = `/api/public/shops/${encodeURIComponent(shopSlug)}/appointments`;
    return this.http.post<PublicCreateAppointmentResponse>(url, request);
  }

  cancelAppointment(
    shopSlug: string,
    appointmentId: string,
    request: PublicCancelAppointmentRequest
  ): Observable<PublicCancelAppointmentResponse> {
    const base = `/api/public/shops/${encodeURIComponent(shopSlug)}/appointments/${encodeURIComponent(appointmentId)}`;
    const urlPostCancel = `${base}/cancel`;

    // Tenta POST /cancel (mais comum); se o backend estiver usando DELETE no recurso, faz fallback.
    return this.http.post<PublicCancelAppointmentResponse>(urlPostCancel, request).pipe(
      catchError((err: any) => {
        const status = Number(err?.status ?? 0);
        if (status === 404 || status === 405) {
          return this.http.request<PublicCancelAppointmentResponse>('delete', base, { body: request });
        }
        return throwError(() => err);
      })
    );
  }
}
