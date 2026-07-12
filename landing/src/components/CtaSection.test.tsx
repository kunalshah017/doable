import { render, screen } from '@testing-library/react';
import { ChatPanel } from './CtaSection';

describe('ChatPanel', () => {
  it('shows the Wispr Flow voice composer instead of a text input', () => {
    render(<ChatPanel initialScroll="top" />);

    expect(screen.getByText('Wispr Flow')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Start voice request' })).toBeInTheDocument();
    expect(screen.queryByPlaceholderText('Describe the change you need...')).not.toBeInTheDocument();
  });
});