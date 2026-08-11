import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { ApiService } from '../api';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './dashboard.html'
})
export class DashboardComponent implements OnInit {
  http = inject(HttpClient);
  router = inject(Router);
  api = inject(ApiService);

  tournaments: any[] = [];
  teams: any[] = [];
  visibleTournaments: any[] = [];

  searchQuery: string = '';
  selectedGame: string = 'ALL';
  selectedStatus: string = 'ALL';
  tournamentView: 'all' | 'my' = 'all';

  isLoadingTournaments: boolean = false;

  ngOnInit() {
    // If the user isn't logged in, kick them back to login
    if (!this.api.userRole.value) {
      this.router.navigate(['/login']);
      return;
    }
    
    this.fetchTournaments();
    this.fetchTeams();
  }

  fetchTournaments() {
    this.isLoadingTournaments = true;
    this.http.get<any[]>('/api/tournaments').subscribe({
      next: (data) => { 
        this.tournaments = data; 
        this.updateVisibleTournaments();
        this.isLoadingTournaments = false;
      },
      error: () => {
        this.isLoadingTournaments = false;
        this.api.showToast('Failed to load tournaments', 'error');
      }
    });
  }

  fetchTeams() {
    this.http.get<any[]>('/api/teams').subscribe({
      next: (data) => { 
        this.teams = data; 
        this.updateVisibleTournaments();
      }
    });
  }

  updateVisibleTournaments() {
    if (this.api.userRole.value === 'admin') {
      this.visibleTournaments = this.tournaments;
    } else {
      // For users, show tournaments they are registered in OR are open/ongoing
      // (You can adjust this logic, but for the dashboard grid, we'll show all available to search)
      this.visibleTournaments = this.tournaments; 
    }
  }

  get filteredTournaments() {
    return this.visibleTournaments.filter(t => {
      const matchesSearch = t.name.toLowerCase().includes(this.searchQuery.toLowerCase());
      const matchesGame = this.selectedGame === 'ALL' || t.game_title.toLowerCase() === this.selectedGame.toLowerCase();
      const matchesStatus = this.selectedStatus === 'ALL' || (t.status || 'REGISTRATION_OPEN') === this.selectedStatus;

      let matchesMyTourney = true;
      if (this.tournamentView === 'my' && this.api.userId.value) {
        const myRegisteredTourneyIds = this.teams
          .filter(team => team.user_id === this.api.userId.value)
          .map(team => team.tournament_id);
        matchesMyTourney = myRegisteredTourneyIds.includes(t.tournament_id);
      }

      return matchesSearch && matchesGame && matchesStatus && matchesMyTourney;
    });
  }

  get activeFilteredTournaments() {
    return this.filteredTournaments.filter(t => t.status !== 'COMPLETED');
  }

  get completedFilteredTournaments() {
    return this.filteredTournaments.filter(t => t.status === 'COMPLETED');
  }

  goToCreateTournament() {
    this.router.navigate(['/create-tournament']);
  }

  goToTournament(tournamentId: number) {
    this.router.navigate(['/tournament', tournamentId]);
  }

  deleteTournament(id: number, event: Event) {
    event.stopPropagation(); // Prevents the card click from navigating to the tournament page
    if (confirm('Delete this tournament completely?')) {
      this.http.delete(`/api/tournaments/${id}`, this.api.getAuthHeaders()).subscribe({
        next: () => {
          this.fetchTournaments();
          this.fetchTeams();
          this.api.showToast('Tournament deleted successfully', 'success');
        },
        error: (err) => this.api.showToast(err.error?.error || 'Failed to delete', 'error')
      });
    }
  }

  trackByTourney(index: number, item: any) { 
    return item.tournament_id; 
  }
}