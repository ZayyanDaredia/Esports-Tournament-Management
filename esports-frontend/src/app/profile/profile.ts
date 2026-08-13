import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { ApiService } from '../api';

@Component({
  selector: 'app-profile',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './profile.html'
})
export class ProfileComponent implements OnInit {
  profile: any = { username: '', email: '', full_name: '', profile_picture: '' };
  
  newEmail: string = '';
  emailCode: string = '';
  showEmailCodeInput: boolean = false;

  constructor(public api: ApiService, private http: HttpClient) {}

  ngOnInit() {
    this.fetchProfile();
  }

  fetchProfile() {
    // Added this.api.getAuthHeaders() to authenticate the request
    this.http.get('/api/profile', this.api.getAuthHeaders()).subscribe({
      next: (res: any) => { 
        this.profile = res; 
      },
      error: (err: any) => { 
        console.error('Failed to load profile', err);
        this.api.showToast('Failed to load profile data', 'error');
      }
    });
  }

  onFileSelected(event: any) {
    const file = event.target.files[0];
    if (file) {
      if (file.size > 2 * 1024 * 1024) {
        // Upgraded to your custom Toast UI
        this.api.showToast('File is too large. Please select an image under 2MB.', 'error');
        return;
      }
      
      const reader = new FileReader();
      reader.onload = (e: any) => {
        this.profile.profile_picture = e.target.result; 
      };
      reader.readAsDataURL(file);
    }
  }

  saveProfileDetails() {
    // Added auth headers as the third argument
    this.http.put('/api/profile', {
      full_name: this.profile.full_name,
      profile_picture: this.profile.profile_picture
    }, this.api.getAuthHeaders()).subscribe({
      next: () => { 
        this.api.showToast('Profile details saved successfully!', 'success'); 
      },
      error: (err: any) => { 
        console.error(err);
        this.api.showToast('Error saving profile.', 'error'); 
      }
    });
  }

  requestEmailChange() {
    if (!this.newEmail) {
      return this.api.showToast('Please enter an email address.', 'error');
    }
    
    // Added auth headers
    this.http.post('/api/auth/send-verification', { email: this.newEmail }, this.api.getAuthHeaders()).subscribe({
      next: () => {
        this.showEmailCodeInput = true;
        this.api.showToast(`Verification code sent to ${this.newEmail}`, 'success');
      },
      error: (err: any) => { 
        console.error(err);
        this.api.showToast('Failed to send verification code.', 'error'); 
      }
    });
  }

  verifyEmailChange() {
    if (!this.emailCode) {
      return this.api.showToast('Please enter the verification code.', 'error');
    }

    // Added auth headers
    this.http.post('/api/profile/verify-email-change', {
      email: this.newEmail,
      code: this.emailCode
    }, this.api.getAuthHeaders()).subscribe({
      next: () => {
        this.api.showToast('Email updated successfully!', 'success');
        this.profile.email = this.newEmail;
        this.showEmailCodeInput = false;
        this.newEmail = '';
        this.emailCode = '';
      },
      error: (err: any) => { 
        this.api.showToast(err.error?.error || 'Invalid code.', 'error'); 
      }
    });
  }
}