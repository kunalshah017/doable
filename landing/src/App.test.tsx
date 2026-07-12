import { render, screen } from '@testing-library/react';
import App from './App';

describe('App', () => {
  it('opens with the Doable grass dashboard hero', () => {
    render(<App />);

    const heroHeading = screen.getByRole('heading', { name: 'Make the call. See it before it ships.' });

    expect(heroHeading.closest('section')).toHaveAttribute('id', 'top');
    expect(screen.queryByText('Website changes you can actually approve')).not.toBeInTheDocument();
    expect(screen.getByText('Request a change, review it live, then approve the pull request.')).toBeInTheDocument();
    expect(screen.queryByText(/Learn how can one go from 0 to \$11.5k/i)).not.toBeInTheDocument();
    expect(screen.getByText('Doable agency', { exact: true })).toBeInTheDocument();
    expect(screen.getByText('Create pull request')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'A decision becomes a pull request.' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Every release has a clear yes.' })).toBeInTheDocument();
    expect(screen.getByText('Decision ledger')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Pricing for the people making the call.' })).toBeInTheDocument();
    expect(screen.getAllByAltText('Dodo Payments').length).toBeGreaterThan(0);
    expect(screen.getByTestId('workflow-video')).toHaveAttribute(
      'src',
      'https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260514_102933_4e8f73b5-775a-4179-b2fb-472f59063dcd.mp4',
    );
    expect(screen.getAllByText('Join the demo').length).toBeGreaterThan(0);
  });
});