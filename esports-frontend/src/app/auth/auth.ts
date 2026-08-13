import { Component, inject, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { ApiService } from '../api';

@Component({
  selector: 'app-auth',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './auth.html',
  styleUrls: ['./auth.css']
})
export class AuthComponent implements OnInit {
  http = inject(HttpClient);
  router = inject(Router);
  api = inject(ApiService);
  cdr = inject(ChangeDetectorRef);

  authMode: 'login' | 'signup' | 'forgot' = 'login';

  // Login form models
  loginUser = '';
  loginPass = '';

  // Detailed Signup form models
  signupName = '';
  signupEmail = '';
  signupUsername = '';
  signupPassword = '';
  verificationCode = '';

  // Forgot password model
  forgotEmail = '';
  forgotSubmitted = false;

  // Verification & UI validation states
  isCodeSent = false;
  isEmailVerified = false;
  isVerifying = false;
  submittedAttempt = false;

  ngOnInit() {
    if (this.api.userRole.value) {
      this.router.navigate(['/dashboard']);
    }
  }

  // Ensures state switches cleanly and fixes the login button navigation behavior
  setAuthMode(mode: 'login' | 'signup' | 'forgot') {
    this.authMode = mode;
    this.submittedAttempt = false;
    this.cdr.detectChanges();
  }

  login() {
    if (!this.loginUser.trim() || !this.loginPass.trim()) {
      this.api.showToast('Please fill in both username and password', 'error');
      return;
    }

    this.http.post('/api/login', { username: this.loginUser, password: this.loginPass }).subscribe({
      next: (res: any) => {
        this.api.setAuth(res.role, res.username, res.userId, res.token);
        this.api.showToast('Successfully logged in!', 'success');
        this.router.navigate(['/dashboard']);
      },
      error: (err) => this.api.showToast(err.error?.error || 'Invalid credentials', 'error')
    });
  }

  sendVerificationCode() {
    if (!this.signupEmail.trim() || !this.signupEmail.includes('@')) {
      this.api.showToast('Please enter a valid email address first.', 'error');
      return;
    }

    this.isVerifying = true;
    this.http.post('/api/auth/send-verification', { email: this.signupEmail }).subscribe({
      next: () => {
        this.isVerifying = false;
        this.isCodeSent = true;
        this.api.showToast('Verification code sent to your email!', 'success');
        this.cdr.detectChanges();
      },
      error: (err) => {
        this.isVerifying = false;
        this.api.showToast(err.error?.error || 'Failed to send verification code', 'error');
        this.cdr.detectChanges();
      }
    });
  }

  verifyCode() {
    if (!this.verificationCode.trim()) {
      this.api.showToast('Please enter the verification code.', 'error');
      return;
    }

    this.http.post('/api/auth/verify-code', { email: this.signupEmail, code: this.verificationCode }).subscribe({
      next: () => {
        this.isEmailVerified = true;
        this.api.showToast('Email verified successfully!', 'success');
        this.cdr.detectChanges();
      },
      error: (err) => {
        this.api.showToast(err.error?.error || 'Invalid verification code', 'error');
      }
    });
  }

  signup() {
    this.submittedAttempt = true;
    if (!this.signupName.trim() || !this.signupEmail.trim() || !this.signupUsername.trim() || !this.signupPassword.trim()) {
      return;
    }

    if (!this.isEmailVerified) {
      this.api.showToast('Please verify your email address before registering.', 'error');
      return;
    }

    const payload = {
      name: this.signupName,
      email: this.signupEmail,
      username: this.signupUsername,
      password: this.signupPassword
    };

    this.http.post('/api/signup', payload).subscribe({
      next: () => { 
        this.authMode = 'login'; 
        this.api.showToast('Account created successfully! Please log in.', 'success');
        this.cdr.detectChanges();
      },
      error: (err) => this.api.showToast(err.error?.error || 'Signup failed', 'error')
    });
  }

  requestRecovery() {
    if (!this.forgotEmail.trim()) {
      this.api.showToast('Please enter your registered email address.', 'error');
      return;
    }

    this.http.post('/api/auth/forgot-password', { email: this.forgotEmail }).subscribe({
      next: () => {
        this.forgotSubmitted = true;
        this.api.showToast('Password reset instructions sent to your email.', 'success');
        this.cdr.detectChanges();
      },
      error: (err) => {
        this.api.showToast(err.error?.error || 'Failed to process request', 'error');
      }
    });
  }
}