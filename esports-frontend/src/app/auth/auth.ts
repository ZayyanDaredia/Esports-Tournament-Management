import { Component, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { ApiService } from '../api';

@Component({
  selector: 'app-auth',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './auth.html'
})
export class AuthComponent implements OnInit {
  http = inject(HttpClient);
  router = inject(Router);
  api = inject(ApiService);

  authMode: 'login' | 'signup' = 'login';

  ngOnInit() {
    // If they are already logged in, kick them straight to the dashboard
    if (this.api.userRole.value) {
      this.router.navigate(['/dashboard']);
    }
  }

  login(user: string, pass: string) {
    this.http.post('/api/login', { username: user, password: pass }).subscribe({
      next: (res: any) => {
        // Send the login info to the Vault
        this.api.setAuth(res.role, res.username, res.userId, res.token);
        this.api.showToast('Successfully logged in!', 'success');
        
        // Walk the user into the Dashboard room
        this.router.navigate(['/dashboard']);
      },
      error: (err) => this.api.showToast(err.error?.error || 'Invalid credentials', 'error')
    });
  }

  signup(user: string, pass: string) {
    this.http.post('/api/signup', { username: user, password: pass }).subscribe({
      next: () => { 
        this.authMode = 'login'; 
        this.api.showToast('Account created successfully! Please log in.', 'success');
      },
      error: (err) => this.api.showToast(err.error?.error || 'Signup failed', 'error')
    });
  }
}