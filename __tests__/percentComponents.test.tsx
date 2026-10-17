import { render, screen } from '@testing-library/react-native';
import React from 'react';
import { PercentBar, PercentDial } from '../src/components/PercentStat';
import { ProgressIndicator } from '../src/components/ProgressIndicator';

describe('pc_info-style percentage components', () => {
  it('PercentBar shows "NN% label", bar and footnote', () => {
    render(<PercentBar percentage={42.4} label="of food budget" footnote="$42 of $100" />);
    expect(screen.getByText(/42%/)).toBeTruthy();
    expect(screen.getByText(/of food budget/)).toBeTruthy();
    expect(screen.getByText('$42 of $100')).toBeTruthy();
    expect(screen.getByRole('progressbar').props.accessibilityValue.now).toBe(42);
  });

  it('PercentDial uppercases its caption like pc_info', () => {
    render(<PercentDial percentage={80} caption="Income spent" />);
    expect(screen.getByText('INCOME SPENT')).toBeTruthy();
    expect(screen.getByText('80%')).toBeTruthy();
  });

  it('clamps out-of-range and NaN values', () => {
    const { rerender } = render(<ProgressIndicator percentage={150} />);
    expect(screen.getByText('100%')).toBeTruthy();
    rerender(<ProgressIndicator percentage={NaN} />);
    expect(screen.getByText('0%')).toBeTruthy();
  });
});
