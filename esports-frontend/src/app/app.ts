import { Component, OnInit, OnDestroy, inject, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { Subscription, timer } from 'rxjs';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './app.html',
  styleUrl: './app.css'
})
export class App implements OnInit, OnDestroy {
  http = inject(HttpClient);
  cdr = inject(ChangeDetectorRef);
  
  userRole: string | null = null; 
  username: string | null = null;
  userId: number | null = null;
  authMode: 'login' | 'signup' = 'login';
  
  teams: any[] = [];
  filteredTeams: any[] = [];
  matches: any[] = [];
  rounds: any[] = [];

  tournaments: any[] = [];
  visibleTournaments: any[] = [];
  activeTournament: any = null;
  selectedTeamRoster: any = null;

  isManualBracketMode: boolean = false;
  manualMatchups: { team_a_id: number | null, team_b_id: number | null }[] = [];

  searchQuery: string = '';
  selectedGame: string = 'ALL';
  selectedStatus: string = 'ALL';
  tournamentView: 'all' | 'my' = 'all';

  // Loading and Toast states
  isLoadingTournaments: boolean = false;
  isLoadingMatches: boolean = false;
  toastMessage: string | null = null;
  toastType: 'success' | 'error' | null = null;
  private toastTimer: any = null;

  regTourneyId: string = '';
  regTeamName: string = '';
  regCap: string = '';
  regP2: string = '';
  regP3: string = '';
  regP4: string = '';
  regP5: string = '';
  regSub1: string = '';
  regSub2: string = '';
  submittedAttempt: boolean = false;

  adminTourneyName: string = '';
  adminTourneyGame: string = '';
  adminTourneySubmitAttempt: boolean = false;

  private pollSub?: Subscription;

  ngOnInit() {
    const savedRole = localStorage.getItem('userRole');
    const savedToken = localStorage.getItem('authToken');
    const savedUser = localStorage.getItem('username');
    const savedUserId = localStorage.getItem('userId');
    
    if (savedRole && savedToken) {
      this.userRole = savedRole;
      this.username = savedUser;
      this.userId = savedUserId ? parseInt(savedUserId) : null;
    }
    
    this.fetchTournaments();
    this.fetchTeams();

    this.pollSub = timer(4000, 4000).subscribe(() => {
      if (this.isManualBracketMode) return;
      
      this.http.get<any[]>('/api/tournaments').subscribe({
        next: (tournamentsData) => {
          this.tournaments = tournamentsData;
          this.updateVisibleTournaments();

          this.http.get<any[]>('/api/teams').subscribe(teamsData => {
            this.teams = teamsData;
            if (this.activeTournament) {
              this.filteredTeams = this.teams.filter(t => t.tournament_id === this.activeTournament.tournament_id);
              this.pollActiveTournamentMatchesQuietly();
            }
            this.updateVisibleTournaments();
            this.cdr.detectChanges();
          });
        },
        error: (err) => console.error('Polling error:', err)
      });
    });
  }

  ngOnDestroy() {
    if (this.pollSub) this.pollSub.unsubscribe();
  }

  showToast(message: string, type: 'success' | 'error') {
    this.toastMessage = message;
    this.toastType = type;
    if (this.toastTimer) clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => {
      this.toastMessage = null;
      this.toastType = null;
      this.cdr.detectChanges();
    }, 3500);
    this.cdr.detectChanges();
  }

  getAuthHeaders() {
    const token = localStorage.getItem('authToken');
    return { headers: new HttpHeaders({ 'Authorization': `Bearer ${token}` }) };
  }

  login(user: string, pass: string) {
    this.http.post('/api/login', { username: user, password: pass }).subscribe({
      next: (res: any) => {
        this.userRole = res.role;
        this.username = res.username;
        this.userId = res.userId;
        localStorage.setItem('userRole', res.role);
        localStorage.setItem('authToken', res.token);
        localStorage.setItem('username', res.username);
        localStorage.setItem('userId', res.userId.toString());
        this.fetchTeams();
        this.fetchTournaments();
        this.showToast('Successfully logged in!', 'success');
        this.cdr.detectChanges();
      },
      error: (err) => this.showToast(err.error.error || 'Invalid credentials', 'error')
    });
  }

  signup(user: string, pass: string) {
    this.http.post('/api/signup', { username: user, password: pass }).subscribe({
      next: () => { 
        this.authMode = 'login'; 
        this.showToast('Account created successfully! Please log in.', 'success');
        this.cdr.detectChanges(); 
      },
      error: (err) => this.showToast(err.error.error || 'Signup failed', 'error')
    });
  }

  logout() {
    this.userRole = null;
    this.username = null;
    this.userId = null;
    this.activeTournament = null;
    this.matches = [];
    this.rounds = [];
    this.filteredTeams = [];
    localStorage.removeItem('userRole');
    localStorage.removeItem('authToken');
    localStorage.removeItem('username');
    localStorage.removeItem('userId');
    this.fetchTournaments();
    this.showToast('Logged out successfully', 'success');
  }

  fetchTeams() {
    this.http.get<any[]>('/api/teams').subscribe({
      next: (data) => { 
        this.teams = data as any[]; 
        if (this.activeTournament) {
          this.filteredTeams = this.teams.filter(t => t.tournament_id === this.activeTournament.tournament_id);
        }
        this.updateVisibleTournaments();
        this.cdr.detectChanges(); 
      }
    });
  }

  fetchTournaments() {
    this.isLoadingTournaments = true;
    this.http.get<any[]>('/api/tournaments').subscribe({
      next: (data) => { 
        this.tournaments = data as any[]; 
        this.updateVisibleTournaments();
        this.isLoadingTournaments = false;
        this.cdr.detectChanges(); 
      },
      error: () => {
        this.isLoadingTournaments = false;
        this.cdr.detectChanges();
      }
    });
  }

  updateVisibleTournaments() {
    if (this.userRole === 'admin') {
      this.visibleTournaments = this.tournaments;
    } else {
      const registeredTournamentIds = this.teams.map(t => t.tournament_id);
      this.visibleTournaments = this.tournaments.filter(t => registeredTournamentIds.includes(t.tournament_id));
    }
  }

  get openTournaments() {
    return this.tournaments.filter(t => t.status === 'REGISTRATION_OPEN');
  }

  get filteredTournaments() {
    return this.tournaments.filter(t => {
      const matchesSearch = t.name.toLowerCase().includes(this.searchQuery.toLowerCase());
      const matchesGame = this.selectedGame === 'ALL' || t.game_title.toLowerCase() === this.selectedGame.toLowerCase();
      const matchesStatus = this.selectedStatus === 'ALL' || (t.status || 'REGISTRATION_OPEN') === this.selectedStatus;

      let matchesMyTourney = true;
      if (this.tournamentView === 'my' && this.userId) {
        const myRegisteredTourneyIds = this.teams.filter(team => team.user_id === this.userId).map(team => team.tournament_id);
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

  toggleTournament(tourney: any) {
    if (this.activeTournament && this.activeTournament.tournament_id === tourney.tournament_id) {
      this.activeTournament = null;
      this.isManualBracketMode = false;
    } else {
      this.selectTournament(tourney);
    }
  }

  selectTournament(tourney: any) {
    this.activeTournament = tourney;
    this.filteredTeams = this.teams.filter(t => t.tournament_id === tourney.tournament_id);
    this.isManualBracketMode = false;
    this.isLoadingMatches = true;
    
    this.http.get<any[]>(`/api/tournaments/${tourney.tournament_id}/matches`).subscribe({
      next: (data) => { 
        this.matches = (data as any[]).map(m => ({
          ...m,
          tempScoreA: m.score_a !== null ? m.score_a : 0,
          tempScoreB: m.score_b !== null ? m.score_b : 0,
          isEditing: m.winner_id === null
        }));

        this.processRoundsData();
        this.isLoadingMatches = false;
        this.cdr.detectChanges(); 
      },
      error: () => {
        this.isLoadingMatches = false;
        this.cdr.detectChanges();
      }
    });
  }

  pollActiveTournamentMatchesQuietly() {
    if (!this.activeTournament) return;
    this.http.get<any[]>(`/api/tournaments/${this.activeTournament.tournament_id}/matches`).subscribe({
      next: (data) => {
        this.matches = (data as any[]).map(m => {
          const existing = this.matches.find(ex => ex.match_id === m.match_id);
          return {
            ...m,
            tempScoreA: existing && existing.tempScoreA !== undefined ? existing.tempScoreA : (m.score_a !== null ? m.score_a : 0),
            tempScoreB: existing && existing.tempScoreB !== undefined ? existing.tempScoreB : (m.score_b !== null ? m.score_b : 0),
            isEditing: existing ? existing.isEditing : (m.winner_id === null)
          };
        });

        this.processRoundsData();
        this.cdr.detectChanges();
      }
    });
  }

  getMatchStatus(match: any): { label: string, color: string, bg: string } {
    if (match.winner_id) {
      return { label: 'COMPLETED', color: '#10b981', bg: 'rgba(16, 185, 129, 0.1)' };
    }
    if (match.team_a_id && match.team_b_id) {
      return { label: 'LIVE', color: '#f59e0b', bg: 'rgba(245, 158, 11, 0.1)' };
    }
    return { label: 'UPCOMING', color: '#64748b', bg: 'rgba(100, 116, 139, 0.1)' };
  }

  processRoundsData() {
    const roundMap = new Map<number, any[]>();
    this.matches.forEach(m => {
      const r = m.round_number || 1;
      if (!roundMap.has(r)) roundMap.set(r, []);
      roundMap.get(r)!.push(m);
    });

    const totalRounds = roundMap.size;
    this.rounds = Array.from(roundMap.keys()).sort((a, b) => a - b).map(r => {
      const distanceFromEnd = totalRounds - r;
      let title = `Round ${r}`;
      if (distanceFromEnd === 0) {
        title = '👑 FINALS';
      } else if (distanceFromEnd === 1) {
        title = 'SEMI-FINALS';
      } else if (distanceFromEnd === 2) {
        title = 'QUARTER-FINALS';
      } else if (distanceFromEnd === 3) {
        title = 'ROUND OF 16';
      } else if (distanceFromEnd === 4) {
        title = 'ROUND OF 32';
      }

      return {
        roundNumber: r,
        title: title,
        matches: roundMap.get(r)!
      };
    });
  }

  submitAdminTournament() {
    this.adminTourneySubmitAttempt = true;
    if (!this.adminTourneyName || !this.adminTourneyName.trim() || !this.adminTourneyGame) return; 

    this.http.post('/api/tournaments', { 
      name: this.adminTourneyName.trim(), 
      game_title: this.adminTourneyGame 
    }, this.getAuthHeaders()).subscribe({
      next: () => { 
        this.adminTourneySubmitAttempt = false;
        this.adminTourneyName = '';
        this.adminTourneyGame = '';
        this.fetchTournaments(); 
        this.showToast('Tournament created successfully!', 'success');
      },
      error: (err) => this.showToast(err.error.error || 'Failed to create tournament', 'error')
    });
  }

  generateBracket() {
    if (!this.activeTournament) return;
    this.http.post(`/api/tournaments/${this.activeTournament.tournament_id}/generate-bracket`, {}, this.getAuthHeaders()).subscribe({
      next: () => { 
        this.selectTournament(this.activeTournament); 
        this.fetchTournaments();
        this.showToast('Tournament bracket generated!', 'success');
      },
      error: (err) => this.showToast(err.error.error || 'Error generating bracket.', 'error')
    });
  }

  openManualBracketBuilder() {
    if (!this.filteredTeams || this.filteredTeams.length < 2) {
      this.showToast('At least 2 registered teams are required to build a bracket.', 'error');
      return;
    }
    this.isManualBracketMode = true;
    this.manualMatchups = [];
    
    const teamsCopy = [...this.filteredTeams];
    for (let i = 0; i < teamsCopy.length; i += 2) {
      this.manualMatchups.push({
        team_a_id: teamsCopy[i] ? teamsCopy[i].team_id : null,
        team_b_id: teamsCopy[i + 1] ? teamsCopy[i + 1].team_id : null
      });
    }
  }

  cancelManualBracket() {
    this.isManualBracketMode = false;
    this.manualMatchups = [];
  }

  submitManualBracket() {
    if (!this.activeTournament) return;
    for (let m of this.manualMatchups) {
      if (!m.team_a_id) {
        this.showToast('Every match must have at least a Team A assigned.', 'error');
        return;
      }
    }

    this.http.post(`/api/tournaments/${this.activeTournament.tournament_id}/generate-manual-bracket`, {
      matchups: this.manualMatchups
    }, this.getAuthHeaders()).subscribe({
      next: () => {
        this.isManualBracketMode = false;
        this.selectTournament(this.activeTournament);
        this.fetchTournaments();
        this.showToast('Manual bracket generated successfully!', 'success');
      },
      error: (err) => this.showToast(err.error.error || 'Failed to generate manual bracket', 'error')
    });
  }

  resetBracket() {
    if (!this.activeTournament) return;
    if (confirm('Are you sure you want to reset the bracket?')) {
      this.http.delete(`/api/tournaments/${this.activeTournament.tournament_id}/bracket`, this.getAuthHeaders()).subscribe({
        next: () => {
          this.selectTournament(this.activeTournament);
          this.fetchTournaments();
          this.showToast('Bracket reset successfully', 'success');
        },
        error: (err) => this.showToast(err.error.error || 'Failed to reset bracket', 'error')
      });
    }
  }

  updateScore(match: any) {
    const a = parseInt(match.tempScoreA), b = parseInt(match.tempScoreB);
    if (isNaN(a) || isNaN(b)) return;
    
    let winnerId = null;
    if (!match.team_b_id) {
      winnerId = match.team_a_id;
    } else {
      if (a > b) winnerId = match.team_a_id;
      else if (b > a) winnerId = match.team_b_id;
      else winnerId = match.team_a_id;
    }

    this.http.put(`/api/matches/${match.match_id}`, { score_a: a, score_b: b, winner_id: winnerId }, this.getAuthHeaders()).subscribe({
      next: () => {
        match.isEditing = false;
        this.selectTournament(this.activeTournament);
        this.fetchTournaments();
        this.showToast('Match score updated successfully!', 'success');
      },
      error: (err) => this.showToast(err.error.error || 'Failed to update score', 'error')
    });
  }

  enableEditScore(match: any) {
    match.isEditing = true;
  }

  deleteTeam(id: number) {
    if (confirm('Delete this team?')) {
      this.http.delete(`/api/teams/${id}`, this.getAuthHeaders()).subscribe({
        next: () => {
          this.fetchTeams();
          this.showToast('Team removed successfully', 'success');
        },
        error: (err) => this.showToast(err.error.error || 'Failed', 'error')
      });
    }
  }

  deleteTournament(id: number) {
    if (confirm('Delete this tournament?')) {
      this.http.delete(`/api/tournaments/${id}`, this.getAuthHeaders()).subscribe({
        next: () => {
          this.activeTournament = null;
          this.matches = [];
          this.rounds = [];
          this.filteredTeams = [];
          this.fetchTournaments();
          this.fetchTeams();
          this.showToast('Tournament deleted successfully', 'success');
        },
        error: (err) => this.showToast(err.error.error || 'Failed', 'error')
      });
    }
  }

  registerFullTeam() {
    this.submittedAttempt = true;
    if (!this.regTourneyId || !this.regTeamName || !this.regTeamName.trim() || !this.regCap || !this.regCap.trim() || !this.regP2 || !this.regP2.trim() || !this.regP3 || !this.regP3.trim() || !this.regP4 || !this.regP4.trim() || !this.regP5 || !this.regP5.trim()) return; 

    const payload = {
      tournament_id: parseInt(this.regTourneyId),
      team_name: this.regTeamName.trim(),
      captain: this.regCap.trim(),
      members: [this.regP2.trim(), this.regP3.trim(), this.regP4.trim(), this.regP5.trim()],
      subs: [this.regSub1, this.regSub2].filter(s => s && s.trim() !== '').map(s => s.trim())
    };

    this.http.post('/api/teams/bulk', payload, this.getAuthHeaders()).subscribe({
      next: () => { 
        this.submittedAttempt = false; 
        this.regTourneyId = '';
        this.regTeamName = '';
        this.regCap = '';
        this.regP2 = '';
        this.regP3 = '';
        this.regP4 = '';
        this.regP5 = '';
        this.regSub1 = '';
        this.regSub2 = '';
        this.fetchTeams(); 
        this.fetchTournaments();
        this.showToast('Team roster registered successfully!', 'success');
      },
      error: (err) => this.showToast(err.error.error || 'Failed to register', 'error')
    });
  }

  openTeamModal(teamId: number) {
    this.http.get<any>(`/api/teams/${teamId}/roster`).subscribe({
      next: (data) => {
        this.selectedTeamRoster = data;
        this.cdr.detectChanges();
      },
      error: () => {}
    });
  }

  closeTeamModal() {
    this.selectedTeamRoster = null;
  }

  trackByTourney(index: number, item: any) { return item.tournament_id; }
  trackByTeam(index: number, item: any) { return item.team_id; }
  trackByRound(index: number, item: any) { return item.roundNumber; }
  trackByMatch(index: number, item: any) { return item.match_id; }
  trackByIndex(index: number, item: any) { return index; }
}