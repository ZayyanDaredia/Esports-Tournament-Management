import { Component, OnInit, OnDestroy, inject, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { Subscription, timer } from 'rxjs';
import { ApiService } from '../api';

@Component({
  selector: 'app-bracket-view',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './bracket-view.html'
})
export class BracketViewComponent implements OnInit, OnDestroy {
  route = inject(ActivatedRoute);
  router = inject(Router);
  http = inject(HttpClient);
  api = inject(ApiService);
  cdr = inject(ChangeDetectorRef);

  tournamentId: number = 0;
  activeTournament: any = null;
  filteredTeams: any[] = [];
  rounds: any[] = [];
  
  isManualBracketMode: boolean = false;
  manualMatchups: any[] = [];
  showRegistrationModal: boolean = false;
  selectedTeamRoster: any = null;
  isLoadingMatches: boolean = false;

  regTeamName = '';
  regCap = '';
  regP2 = '';
  regP3 = '';
  regP4 = '';
  regP5 = '';
  regSub1 = '';
  regSub2 = '';
  submittedAttempt = false;

  private pollSub?: Subscription;

  ngOnInit() {
    this.route.paramMap.subscribe(params => {
      const id = params.get('id');
      if (id) {
        this.tournamentId = +id;
        this.loadTournamentDetails();
        this.loadTeams();
        this.loadBracket();
      }
    });

    this.pollSub = timer(4000, 4000).subscribe(() => {
      if (this.tournamentId) {
        this.loadBracketQuietly();
        this.loadTeamsQuietly();
      }
    });
  }

  ngOnDestroy() {
    if (this.pollSub) {
      this.pollSub.unsubscribe();
    }
  }

  loadTournamentDetails() {
    this.http.get<any>(`/api/tournaments/${this.tournamentId}`).subscribe({
      next: (data) => {
        this.activeTournament = data;
        this.cdr.detectChanges();
      }
    });
  }

  loadTeams() {
    this.http.get<any[]>(`/api/tournaments/${this.tournamentId}/teams`).subscribe({
      next: (data) => {
        this.filteredTeams = data;
        this.cdr.detectChanges();
      }
    });
  }

  loadTeamsQuietly() {
    this.http.get<any[]>(`/api/tournaments/${this.tournamentId}/teams`).subscribe({
      next: (data) => {
        this.filteredTeams = data;
        this.cdr.detectChanges();
      }
    });
  }

  loadBracket() {
    this.isLoadingMatches = true;
    this.http.get<any>(`/api/tournaments/${this.tournamentId}/bracket`).subscribe({
      next: (data) => {
        this.processRounds(data.rounds || data);
        this.isLoadingMatches = false;
        this.cdr.detectChanges();
      },
      error: () => {
        this.isLoadingMatches = false;
        this.cdr.detectChanges();
      }
    });
  }

  loadBracketQuietly() {
    this.http.get<any>(`/api/tournaments/${this.tournamentId}/bracket`).subscribe({
      next: (data) => {
        this.processRounds(data.rounds || data);
        this.cdr.detectChanges();
      }
    });
  }

  processRounds(rawRounds: any[]) {
    const editingMap = new Map();
    this.rounds.forEach(r => {
      r.matches.forEach((m: any) => {
        if (m.isEditing) {
          editingMap.set(m.match_id, { tempA: m.tempScoreA, tempB: m.tempScoreB });
        }
      });
    });

    this.rounds = rawRounds.map(round => ({
      roundNumber: round.round_number || round.roundNumber,
      title: round.title || `Round ${round.round_number || round.roundNumber}`,
      matches: (round.matches || []).map((m: any) => {
        const editingState = editingMap.get(m.match_id);
        return {
          ...m,
          isEditing: !!editingState,
          tempScoreA: editingState ? editingState.tempA : (m.score_a ?? 0),
          tempScoreB: editingState ? editingState.tempB : (m.score_b ?? 0)
        };
      })
    }));
  }

  getWrapperHeight(roundNumber: number): number {
    const baseHeight = 160;
    return baseHeight * Math.pow(2, roundNumber - 1);
  }

  getMatchStatus(match: any) {
    if (match.winner_id) return { label: 'COMPLETED', color: '#10b981', bg: 'rgba(16, 185, 129, 0.1)' };
    if (this.isMatchReady(match)) return { label: 'LIVE', color: '#38bdf8', bg: 'rgba(56, 189, 248, 0.1)' };
    return { label: 'UPCOMING', color: '#94a3b8', bg: 'rgba(148, 163, 184, 0.1)' };
  }

  isMatchReady(match: any): boolean {
    if (match.team_a_id && match.team_b_id) return true;
    if (match.round_number === 1 && match.team_a_id) return true;

    // If Team A is present but Team B is missing, check if Feeder B is finished or permanently empty
    if (match.team_a_id && !match.team_b_id) {
      if (!match.feederB) return true;
      if (match.feederB.winner_id !== null || (match.feederB.team_a_id === null && match.feederB.team_b_id === null)) {
        return true;
      }
    }

    // If Team B is present but Team A is missing, check if Feeder A is finished or permanently empty
    if (match.team_b_id && !match.team_a_id) {
      if (!match.feederA) return true;
      if (match.feederA.winner_id !== null || (match.feederA.team_a_id === null && match.feederA.team_b_id === null)) {
        return true;
      }
    }

    return false;
  }

  enableEditScore(match: any) {
    if (!this.isMatchReady(match)) {
      this.api.showToast('Cannot edit score until opponent is determined.', 'error');
      return;
    }
    match.isEditing = true;
  }

  updateScore(match: any) {
    const scoreA = Number(match.tempScoreA);
    const scoreB = Number(match.tempScoreB);

    if (isNaN(scoreA) || isNaN(scoreB)) {
      this.api.showToast('Please enter valid numeric scores.', 'error');
      return;
    }

    let winnerId = null;
    if (!match.team_b_id && match.round_number === 1) {
      winnerId = match.team_a_id;
    } else {
      if (scoreA > scoreB) winnerId = match.team_a_id;
      else if (scoreB > scoreA) winnerId = match.team_b_id;
      else {
        this.api.showToast('Scores cannot be tied in single elimination.', 'error');
        return;
      }
    }

    this.http.put(`/api/matches/${match.match_id}`, {
      score_a: scoreA,
      score_b: scoreB,
      winner_id: winnerId
    }, this.api.getAuthHeaders()).subscribe({
      next: () => {
        match.isEditing = false;
        this.loadBracket();
        this.loadTournamentDetails();
        this.api.showToast('Match result saved successfully!', 'success');
      },
      error: (err) => {
        this.api.showToast(err.error?.error || 'Failed to save result', 'error');
      }
    });
  }

  generateBracket() {
    this.http.post(`/api/tournaments/${this.tournamentId}/generate-bracket`, {}, this.api.getAuthHeaders()).subscribe({
      next: () => {
        this.loadBracket();
        this.loadTournamentDetails();
        this.api.showToast('Balanced bracket generated successfully!', 'success');
      },
      error: (err) => {
        this.api.showToast(err.error?.error || 'Failed to generate bracket', 'error');
      }
    });
  }

  resetBracket() {
    if (confirm('Are you sure you want to reset the bracket? All progress will be lost.')) {
      this.http.delete(`/api/tournaments/${this.tournamentId}/bracket`, this.api.getAuthHeaders()).subscribe({
        next: () => {
          this.loadBracket();
          this.loadTournamentDetails();
          this.api.showToast('Bracket reset successfully', 'success');
        },
        error: (err) => {
          this.api.showToast(err.error?.error || 'Failed to reset bracket', 'error');
        }
      });
    }
  }

  openManualBracketBuilder() {
    this.isManualBracketMode = true;
    this.manualMatchups = [];
    const count = Math.ceil(this.filteredTeams.length / 2) * 2 || 2;
    for (let i = 0; i < count / 2; i++) {
      this.manualMatchups.push({ team_a_id: null, team_b_id: null });
    }
  }

  cancelManualBracket() {
    this.isManualBracketMode = false;
  }

  submitManualBracket() {
    this.http.post(`/api/tournaments/${this.tournamentId}/generate-manual-bracket`, { matchups: this.manualMatchups }, this.api.getAuthHeaders()).subscribe({
      next: () => {
        this.isManualBracketMode = false;
        this.loadBracket();
        this.loadTournamentDetails();
        this.api.showToast('Manual bracket created successfully!', 'success');
      },
      error: (err) => {
        this.api.showToast(err.error?.error || 'Failed to create manual bracket', 'error');
      }
    });
  }

  deleteTeam(teamId: number) {
    if (confirm('Remove this team from the tournament?')) {
      this.http.delete(`/api/teams/${teamId}`, this.api.getAuthHeaders()).subscribe({
        next: () => {
          this.loadTeams();
          this.api.showToast('Team removed successfully', 'success');
        },
        error: (err) => {
          this.api.showToast(err.error?.error || 'Failed to remove team', 'error');
        }
      });
    }
  }

  openRegistration() {
    this.showRegistrationModal = true;
    this.submittedAttempt = false;
    this.regTeamName = '';
    this.regCap = '';
    this.regP2 = '';
    this.regP3 = '';
    this.regP4 = '';
    this.regP5 = '';
    this.regSub1 = '';
    this.regSub2 = '';
  }

  closeRegistration() {
    this.showRegistrationModal = false;
  }

  registerFullTeam() {
    this.submittedAttempt = true;
    if (!this.regTeamName.trim() || !this.regCap.trim() || !this.regP2.trim() || !this.regP3.trim() || !this.regP4.trim() || !this.regP5.trim()) {
      return;
    }

    const payload = {
      tournament_id: this.tournamentId,
      team_name: this.regTeamName,
      captain: this.regCap,
      members: [this.regP2, this.regP3, this.regP4, this.regP5].filter(p => p.trim() !== ''),
      subs: [this.regSub1, this.regSub2].filter(p => p.trim() !== '')
    };

    this.http.post('/api/teams/bulk', payload, this.api.getAuthHeaders()).subscribe({
      next: () => {
        this.closeRegistration();
        this.loadTeams();
        this.api.showToast('Team registered successfully!', 'success');
      },
      error: (err) => {
        this.api.showToast(err.error?.error || 'Failed to register team', 'error');
      }
    });
  }

  openTeamModal(team: any) {
    this.selectedTeamRoster = {
      team_name: team.team_name || team.name,
      loading: true,
      captain: '',
      members: [],
      subs: []
    };

    const teamId = team.team_id;
    this.http.get<any>(`/api/teams/${teamId}/roster`).subscribe({
      next: (data) => {
        this.selectedTeamRoster.captain = data.captain;
        this.selectedTeamRoster.members = data.members;
        this.selectedTeamRoster.subs = data.subs;
        this.selectedTeamRoster.loading = false;
        this.cdr.detectChanges();
      },
      error: () => {
        this.selectedTeamRoster.loading = false;
        this.cdr.detectChanges();
      }
    });
  }

  closeTeamModal() {
    this.selectedTeamRoster = null;
  }

  goBack() {
    this.router.navigate(['/dashboard']);
  }

  trackByRound(index: number, item: any) { return item.roundNumber; }
  trackByMatch(index: number, item: any) { return item.match_id; }
  trackByTeam(index: number, item: any) { return item.team_id; }
}