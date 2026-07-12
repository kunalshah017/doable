import { render, screen } from '@testing-library/react';
import { PrimaryButton } from './landing-primitives';

describe('PrimaryButton', () => {
  it('renders a duplicate label for the animated hover treatment', () => {
    render(<PrimaryButton>Join the demo</PrimaryButton>);

    expect(screen.getAllByText('Join the demo')).toHaveLength(2);
  });
});