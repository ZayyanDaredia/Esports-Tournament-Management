import { Component, OnInit, OnDestroy, inject, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
// 1. ADDED RouterLink TO THIS IMPORT
import { RouterOutlet, Router, RouterLink } from '@angular/router'; 
import { ApiService } from './api'; // Connects to the vault we made in Phase 1

@Component({
  selector: 'app-root',
  standalone: true,
  // 2. ADDED RouterLink TO THIS ARRAY
  imports: [CommonModule, RouterOutlet, RouterLink],
  templateUrl: './app.html'
})
export class App implements OnInit, OnDestroy {
  api = inject(ApiService);
  router = inject(Router);
  cdr = inject(ChangeDetectorRef);

  userRole: string | null = null;
  username: string | null = null;
  toastMessage: string | null = null;
  toastType: 'success' | 'error' | null = null;

  private subs: any[] = [];

  ngOnInit() {
    // Listen to the Vault for changes across any page
    this.subs.push(this.api.userRole.subscribe(role => { this.userRole = role; this.cdr.detectChanges(); }));
    this.subs.push(this.api.username.subscribe(name => { this.username = name; this.cdr.detectChanges(); }));
    this.subs.push(this.api.toastMessage.subscribe(msg => { this.toastMessage = msg; this.cdr.detectChanges(); }));
    this.subs.push(this.api.toastType.subscribe(type => { this.toastType = type; this.cdr.detectChanges(); }));
  }

  ngOnDestroy() {
    this.subs.forEach(s => s.unsubscribe());
  }

  logout() {
    this.api.logout();
    this.api.showToast('Logged out successfully', 'success');
    this.router.navigate(['/login']); // Send them back to the login room
  }
}