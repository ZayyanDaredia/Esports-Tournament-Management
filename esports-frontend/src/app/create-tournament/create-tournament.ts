import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { ApiService } from '../api';

@Component({
  selector: 'app-create-tournament',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './create-tournament.html'
})
export class CreateTournamentComponent {
  http = inject(HttpClient);
  router = inject(Router);
  api = inject(ApiService);

  adminTourneyName: string = '';
  adminTourneyGame: string = '';
  adminTourneySubmitAttempt: boolean = false;

  goBack() {
    this.router.navigate(['/dashboard']);
  }

  submitAdminTournament() {
    this.adminTourneySubmitAttempt = true;
    if (!this.adminTourneyName || !this.adminTourneyName.trim() || !this.adminTourneyGame) return; 

    this.http.post('/api/tournaments', { 
      name: this.adminTourneyName.trim(), 
      game_title: this.adminTourneyGame 
    }, this.api.getAuthHeaders()).subscribe({
      next: () => { 
        this.adminTourneySubmitAttempt = false;
        this.api.showToast('Tournament created successfully!', 'success');
        this.router.navigate(['/dashboard']); // Send them back to dashboard after creating
      },
      error: (err) => this.api.showToast(err.error?.error || 'Failed to create tournament', 'error')
    });
  }
}