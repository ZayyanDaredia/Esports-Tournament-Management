import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { BehaviorSubject } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class ApiService {
  http = inject(HttpClient);

  // Global User State
  userRole = new BehaviorSubject<string | null>(localStorage.getItem('userRole'));
  username = new BehaviorSubject<string | null>(localStorage.getItem('username'));
  userId = new BehaviorSubject<number | null>(localStorage.getItem('userId') ? parseInt(localStorage.getItem('userId')!) : null);

  // Global Toast State
  toastMessage = new BehaviorSubject<string | null>(null);
  toastType = new BehaviorSubject<'success' | 'error' | null>(null);
  private toastTimer: any;

  getAuthHeaders() {
    const token = localStorage.getItem('authToken');
    return { headers: new HttpHeaders({ 'Authorization': `Bearer ${token}` }) };
  }

  setAuth(role: string, user: string, id: number, token: string) {
    localStorage.setItem('userRole', role);
    localStorage.setItem('username', user);
    localStorage.setItem('userId', id.toString());
    localStorage.setItem('authToken', token);
    
    // Broadcast the new login state to all pages
    this.userRole.next(role);
    this.username.next(user);
    this.userId.next(id);
  }

  logout() {
    localStorage.removeItem('userRole');
    localStorage.removeItem('username');
    localStorage.removeItem('userId');
    localStorage.removeItem('authToken');
    
    // Broadcast the logout state to all pages
    this.userRole.next(null);
    this.username.next(null);
    this.userId.next(null);
  }

  showToast(message: string, type: 'success' | 'error') {
    this.toastMessage.next(message);
    this.toastType.next(type);
    if (this.toastTimer) clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => {
      this.toastMessage.next(null);
      this.toastType.next(null);
    }, 3500);
  }
}