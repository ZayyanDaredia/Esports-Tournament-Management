import { Routes } from '@angular/router';
import { AuthComponent } from './auth/auth';
import { DashboardComponent } from './dashboard/dashboard';
import { CreateTournamentComponent } from './create-tournament/create-tournament';
import { BracketViewComponent } from './bracket-view/bracket-view';

export const routes: Routes = [
  // If the user goes to the base URL, send them to login
  { path: '', redirectTo: 'login', pathMatch: 'full' },
  
  // The different "rooms"
  { path: 'login', component: AuthComponent },
  { path: 'dashboard', component: DashboardComponent },
  { path: 'create-tournament', component: CreateTournamentComponent },
  
  // The :id creates a dynamic URL like /tournament/5
  { path: 'tournament/:id', component: BracketViewComponent },
  
  // Catch-all: If they type a weird URL, send them back to login
  { path: '**', redirectTo: 'login' }
];