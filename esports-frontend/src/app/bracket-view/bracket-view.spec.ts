import { ComponentFixture, TestBed } from '@angular/core/testing';

import { BracketView } from './bracket-view';

describe('BracketView', () => {
  let component: BracketView;
  let fixture: ComponentFixture<BracketView>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [BracketView],
    }).compileComponents();

    fixture = TestBed.createComponent(BracketView);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
