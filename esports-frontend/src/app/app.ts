import { Component, OnInit, inject, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './app.html',
  styleUrl: './app.css'
})
export class App implements OnInit {
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

  // Filter & Search state
  searchQuery: string = '';
  selectedGame: string = 'ALL';
  selectedStatus: string = 'ALL';
  tournamentView: 'all' | 'my' = 'all';

  // Roster form model properties & validation flag
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
  }

  getAuthHeaders() {
    const token = localStorage.getItem('authToken');
    return { headers: new HttpHeaders({ 'Authorization': `Bearer ${token}` }) };
  }

  login(user: string, pass: string) {
    this.http.post('http://localhost:3000/api/login', { username: user, password: pass }).subscribe({
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
        this.cdr.detectChanges();
      },
      error: (err) => alert(err.error.error || 'Invalid credentials')
    });
  }

  signup(user: string, pass: string) {
    this.http.post('http://localhost:3000/api/signup', { username: user, password: pass }).subscribe({
      next: () => {
        this.authMode = 'login';
        this.cdr.detectChanges();
      },
      error: (err) => alert(err.error.error || 'Signup failed')
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
  }

  fetchTeams() {
    this.http.get<any[]>('http://localhost:3000/api/teams').subscribe({
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
    this.http.get<any[]>('http://localhost:3000/api/tournaments').subscribe({
      next: (data) => { 
        this.tournaments = data as any[]; 
        this.updateVisibleTournaments();
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

  selectTournament(tourney: any) {
    this.activeTournament = tourney;
    this.filteredTeams = this.teams.filter(t => t.tournament_id === tourney.tournament_id);
    
    this.http.get<any[]>(`http://localhost:3000/api/tournaments/${tourney.tournament_id}/matches`).subscribe({
      next: (data) => { 
        this.matches = (data as any[]).map(m => ({
          ...m,
          tempScoreA: m.score_a !== null ? m.score_a : 0,
          tempScoreB: m.score_b !== null ? m.score_b : 0
        }));

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
            title = 'Finals';
          } else if (distanceFromEnd === 1) {
            title = 'Semi-finals';
          } else if (distanceFromEnd === 2) {
            title = 'Quarter-finals';
          } else if (distanceFromEnd === 3) {
            title = 'Round of 16';
          } else if (distanceFromEnd === 4) {
            title = 'Round of 32';
          }

          return {
            roundNumber: r,
            title: title,
            matches: roundMap.get(r)!
          };
        });

        this.cdr.detectChanges(); 
      }
    });
  }

  createTournament(name: string, game: string) {
    this.http.post('http://localhost:3000/api/tournaments', { name, game_title: game }, this.getAuthHeaders()).subscribe({
      next: () => { this.fetchTournaments(); },
      error: (err) => alert(err.error.error || 'Failed')
    });
  }

  generateBracket() {
    if (!this.activeTournament) return;
    this.http.post(`http://localhost:3000/api/tournaments/${this.activeTournament.tournament_id}/generate-bracket`, {}, this.getAuthHeaders()).subscribe({
      next: () => { 
        this.selectTournament(this.activeTournament); 
        this.fetchTournaments();
      },
      error: (err) => alert(err.error.error || 'Error generating bracket.')
    });
  }

  resetBracket() {
    if (!this.activeTournament) return;
    if (confirm('Are you sure you want to reset the bracket?')) {
      this.http.delete(`http://localhost:3000/api/tournaments/${this.activeTournament.tournament_id}/bracket`, this.getAuthHeaders()).subscribe({
        next: () => {
          this.selectTournament(this.activeTournament);
          this.fetchTournaments();
        },
        error: (err) => alert(err.error.error || 'Failed to reset bracket')
      });
    }
  }

  updateScore(matchId: number, scoreA: any, scoreB: any, teamAId: number, teamBId: number) {
    const a = parseInt(scoreA), b = parseInt(scoreB);
    if (isNaN(a) || isNaN(b)) return;
    
    this.http.put(`http://localhost:3000/api/matches/${matchId}`, { score_a: a, score_b: b, winner_id: a > b ? teamAId : teamBId }, this.getAuthHeaders()).subscribe({
      next: () => {
        this.selectTournament(this.activeTournament);
        this.fetchTournaments();
      },
      error: (err) => alert(err.error.error || 'Failed to update score')
    });
  }

  deleteTeam(id: number) {
    if (confirm('Delete this team?')) {
      this.http.delete(`http://localhost:3000/api/teams/${id}`, this.getAuthHeaders()).subscribe({
        next: () => this.fetchTeams(),
        error: (err) => alert(err.error.error || 'Failed')
      });
    }
  }

  deleteTournament(id: number) {
    if (confirm('Delete this tournament?')) {
      this.http.delete(`http://localhost:3000/api/tournaments/${id}`, this.getAuthHeaders()).subscribe({
        next: () => {
          this.activeTournament = null;
          this.matches = [];
          this.rounds = [];
          this.filteredTeams = [];
          this.fetchTournaments();
          this.fetchTeams();
        },
        error: (err) => alert(err.error.error || 'Failed')
      });
    }
  }

  registerFullTeam() {
    this.submittedAttempt = true;

    if (!this.regTourneyId || !this.regTeamName || !this.regTeamName.trim() || !this.regCap || !this.regCap.trim() || !this.regP2 || !this.regP2.trim() || !this.regP3 || !this.regP3.trim() || !this.regP4 || !this.regP4.trim() || !this.regP5 || !this.regP5.trim()) {
      return; 
    }

    const payload = {
      tournament_id: parseInt(this.regTourneyId),
      team_name: this.regTeamName.trim(),
      captain: this.regCap.trim(),
      members: [this.regP2.trim(), this.regP3.trim(), this.regP4.trim(), this.regP5.trim()],
      subs: [this.regSub1, this.regSub2].filter(s => s && s.trim() !== '').map(s => s.trim())
    };

    this.http.post('http://localhost:3000/api/teams/bulk', payload, this.getAuthHeaders()).subscribe({
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
      },
      error: (err) => alert(err.error.error || 'Failed to register')
    });
  }

  openTeamModal(teamId: number) {
    this.http.get<any>(`http://localhost:3000/api/teams/${teamId}/roster`).subscribe({
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
}