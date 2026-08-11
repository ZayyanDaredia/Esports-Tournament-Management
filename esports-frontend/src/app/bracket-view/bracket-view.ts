import { Component, OnInit, OnDestroy, inject, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { ActivatedRoute, Router } from '@angular/router';
import { Subscription, timer } from 'rxjs';
import { ApiService } from '../api';

@Component({
  selector: 'app-bracket-view',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './bracket-view.html'
})
export class BracketViewComponent implements OnInit, OnDestroy {
  http = inject(HttpClient);
  route = inject(ActivatedRoute);
  router = inject(Router);
  api = inject(ApiService);
  cdr = inject(ChangeDetectorRef);

  activeTournament: any = null;
  matches: any[] = [];
  rounds: any[] = [];
  filteredTeams: any[] = [];
  
  isManualBracketMode: boolean = false;
  manualMatchups: { team_a_id: number | null, team_b_id: number | null }[] = [];

  isLoadingMatches: boolean = true;
  private pollSub?: Subscription;

  // Registration Modal State
  showRegistrationModal: boolean = false;
  regTeamName: string = '';
  regCap: string = '';
  regP2: string = '';
  regP3: string = '';
  regP4: string = '';
  regP5: string = '';
  regSub1: string = '';
  regSub2: string = '';
  submittedAttempt: boolean = false;

  // Team Modal State
  selectedTeamRoster: any = null;

  ngOnInit() {
    if (!this.api.userRole.value) {
      this.router.navigate(['/login']);
      return;
    }

    this.route.paramMap.subscribe(params => {
      const id = Number(params.get('id'));
      if (id) {
        this.loadTournamentDetails(id);
      }
    });

    this.pollSub = timer(4000, 4000).subscribe(() => {
      if (!this.isManualBracketMode && this.activeTournament) {
        this.pollActiveTournamentMatchesQuietly();
      }
    });
  }

  ngOnDestroy() {
    if (this.pollSub) this.pollSub.unsubscribe();
  }

  loadTournamentDetails(id: number) {
    this.http.get<any[]>('/api/tournaments').subscribe({
      next: (tourneys) => {
        this.activeTournament = tourneys.find(t => t.tournament_id === id);
        if (!this.activeTournament) {
          this.api.showToast('Tournament not found', 'error');
          this.router.navigate(['/dashboard']);
          return;
        }
        this.fetchTeamsAndMatches(id);
      }
    });
  }

  fetchTeamsAndMatches(id: number) {
    this.http.get<any[]>('/api/teams').subscribe(teamsData => {
      this.filteredTeams = teamsData.filter(t => t.tournament_id === id);
      
      this.http.get<any[]>(`/api/tournaments/${id}/matches`).subscribe({
        next: (matchesData) => { 
          this.matches = matchesData.map(m => ({
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
    });
  }

  pollActiveTournamentMatchesQuietly() {
    this.http.get<any[]>(`/api/tournaments/${this.activeTournament.tournament_id}/matches`).subscribe({
      next: (data) => {
        this.matches = data.map(m => {
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
      if (distanceFromEnd === 0) title = '👑 FINALS';
      else if (distanceFromEnd === 1) title = 'SEMI-FINALS';
      else if (distanceFromEnd === 2) title = 'QUARTER-FINALS';
      else if (distanceFromEnd === 3) title = 'ROUND OF 16';
      else if (distanceFromEnd === 4) title = 'ROUND OF 32';

      return { roundNumber: r, title: title, matches: roundMap.get(r)! };
    });
  }

  getMatchStatus(match: any): { label: string, color: string, bg: string } {
    if (match.winner_id) return { label: 'COMPLETED', color: '#10b981', bg: 'rgba(16, 185, 129, 0.1)' };
    if (match.team_a_id && match.team_b_id) return { label: 'LIVE', color: '#f59e0b', bg: 'rgba(245, 158, 11, 0.1)' };
    return { label: 'UPCOMING', color: '#64748b', bg: 'rgba(100, 116, 139, 0.1)' };
  }

  getWrapperHeight(roundNumber: number): number { return 240 * Math.pow(2, roundNumber - 1); }
  getVerticalLineHeight(roundNumber: number): number { return this.getWrapperHeight(roundNumber); }

  goBack() { this.router.navigate(['/dashboard']); }

  generateBracket() {
    this.http.post(`/api/tournaments/${this.activeTournament.tournament_id}/generate-bracket`, {}, this.api.getAuthHeaders()).subscribe({
      next: () => { 
        this.fetchTeamsAndMatches(this.activeTournament.tournament_id);
        this.api.showToast('Tournament bracket generated!', 'success');
      },
      error: (err) => this.api.showToast(err.error?.error || 'Error generating bracket.', 'error')
    });
  }

  openManualBracketBuilder() {
    if (!this.filteredTeams || this.filteredTeams.length < 2) {
      this.api.showToast('At least 2 registered teams are required to build a bracket.', 'error');
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
    for (let m of this.manualMatchups) {
      if (!m.team_a_id) {
        this.api.showToast('Every match must have at least a Team A assigned.', 'error');
        return;
      }
    }
    this.http.post(`/api/tournaments/${this.activeTournament.tournament_id}/generate-manual-bracket`, { matchups: this.manualMatchups }, this.api.getAuthHeaders()).subscribe({
      next: () => {
        this.isManualBracketMode = false;
        this.fetchTeamsAndMatches(this.activeTournament.tournament_id);
        this.api.showToast('Manual bracket generated successfully!', 'success');
      },
      error: (err) => this.api.showToast(err.error?.error || 'Failed to generate manual bracket', 'error')
    });
  }

  resetBracket() {
    if (confirm('Are you sure you want to reset the bracket?')) {
      this.http.delete(`/api/tournaments/${this.activeTournament.tournament_id}/bracket`, this.api.getAuthHeaders()).subscribe({
        next: () => {
          this.fetchTeamsAndMatches(this.activeTournament.tournament_id);
          this.api.showToast('Bracket reset successfully', 'success');
        },
        error: (err) => this.api.showToast(err.error?.error || 'Failed to reset bracket', 'error')
      });
    }
  }

  enableEditScore(match: any) { 
    if (!match.team_a_id || !match.team_b_id) {
      this.api.showToast('Cannot edit score until both teams are determined.', 'error');
      return;
    }
    match.isEditing = true; 
  }

  updateScore(match: any) {
    const a = parseInt(match.tempScoreA), b = parseInt(match.tempScoreB);
    if (isNaN(a) || isNaN(b)) return;
    
    let winnerId = null;
    if (!match.team_b_id) winnerId = match.team_a_id;
    else {
      if (a > b) winnerId = match.team_a_id;
      else if (b > a) winnerId = match.team_b_id;
      else winnerId = match.team_a_id;
    }

    this.http.put(`/api/matches/${match.match_id}`, { score_a: a, score_b: b, winner_id: winnerId }, this.api.getAuthHeaders()).subscribe({
      next: () => {
        match.isEditing = false;
        this.fetchTeamsAndMatches(this.activeTournament.tournament_id);
        this.api.showToast('Match score updated successfully!', 'success');
      },
      error: (err) => this.api.showToast(err.error?.error || 'Failed to update score', 'error')
    });
  }

  openRegistration() { this.showRegistrationModal = true; }
  closeRegistration() { this.showRegistrationModal = false; this.submittedAttempt = false; }

  registerFullTeam() {
    this.submittedAttempt = true;
    if (!this.regTeamName.trim() || !this.regCap.trim() || !this.regP2.trim() || !this.regP3.trim() || !this.regP4.trim() || !this.regP5.trim()) return; 

    const payload = {
      tournament_id: this.activeTournament.tournament_id,
      team_name: this.regTeamName.trim(),
      captain: this.regCap.trim(),
      members: [this.regP2.trim(), this.regP3.trim(), this.regP4.trim(), this.regP5.trim()],
      subs: [this.regSub1, this.regSub2].filter(s => s && s.trim() !== '').map(s => s.trim())
    };

    this.http.post('/api/teams/bulk', payload, this.api.getAuthHeaders()).subscribe({
      next: () => { 
        this.closeRegistration();
        this.regTeamName = ''; this.regCap = ''; this.regP2 = ''; this.regP3 = ''; this.regP4 = ''; this.regP5 = ''; this.regSub1 = ''; this.regSub2 = '';
        this.fetchTeamsAndMatches(this.activeTournament.tournament_id); 
        this.api.showToast('Team registered successfully!', 'success');
      },
      error: (err) => this.api.showToast(err.error?.error || 'Failed to register', 'error')
    });
  }

  deleteTeam(id: number) {
    if (confirm('Delete this team?')) {
      this.http.delete(`/api/teams/${id}`, this.api.getAuthHeaders()).subscribe({
        next: () => {
          this.fetchTeamsAndMatches(this.activeTournament.tournament_id);
          this.api.showToast('Team removed successfully', 'success');
        },
        error: (err) => this.api.showToast(err.error?.error || 'Failed', 'error')
      });
    }
  }

  // --- TEAM ROSTER MODAL ---
  openTeamModal(team: any) {
    // Set initial state to loading so partial data isn't flashed
    this.selectedTeamRoster = {
      team_name: team.team_name || team.name || 'Team Roster',
      captain: '',
      members: [],
      subs: [],
      loading: true
    };
    this.cdr.detectChanges();

    // Fetch the complete roster data from the server
    this.http.get<any>(`/api/teams/${team.team_id}/roster`).subscribe({
      next: (data) => {
        if (data) {
          this.selectedTeamRoster = {
            team_name: data.team_name || team.team_name || team.name || 'Team Roster',
            captain: data.captain || team.captain || 'Not Listed',
            members: data.members || [],
            subs: data.subs || [],
            loading: false
          };
        }
        this.cdr.detectChanges();
      },
      error: () => {
        // Fallback if request fails
        this.selectedTeamRoster = {
          team_name: team.team_name || team.name || 'Team Roster',
          captain: team.captain || team.captain_riot_id || 'Not Listed',
          members: [],
          subs: [],
          loading: false
        };
        this.cdr.detectChanges();
      }
    });
  }

  closeTeamModal() { 
    this.selectedTeamRoster = null; 
  }

  trackByTeam(index: number, item: any) { return item.team_id; }
  trackByRound(index: number, item: any) { return item.roundNumber; }
  trackByMatch(index: number, item: any) { return item.match_id; }
  trackByIndex(index: number, item: any) { return index; }
}