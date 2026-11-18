import { render } from 'vitest-browser-react';
import { GuestSatisfactionBar } from '@/management/GuestSatisfactionBar';
import '@/index.css';

describe('the thought above a guest', () => {
  it('shows the words, and says them to a screen reader on the meter, so colour is never the only signal', async () => {
    const screen = await render(<GuestSatisfactionBar id={7} value={20} mood="unhappy" stage="waiting" thought={{ text: 'Long wait', tone: 'bad' }} />);
    await expect.element(screen.getByText('Long wait')).toBeVisible();
    await expect.element(screen.getByRole('meter', { name: 'Guest 7 satisfaction' })).toHaveAttribute('aria-valuetext', expect.stringContaining('Thinking: Long wait.'));
  });
  it('adds nothing when the guest has no thought', async () => {
    const screen = await render(<GuestSatisfactionBar id={8} value={90} mood="content" stage="waiting" />);
    expect(screen.container.querySelector('[data-thought]')).toBeNull();
    await expect.element(screen.getByRole('meter', { name: 'Guest 8 satisfaction' })).not.toHaveAttribute('aria-valuetext', expect.stringContaining('Thinking'));
  });
});
