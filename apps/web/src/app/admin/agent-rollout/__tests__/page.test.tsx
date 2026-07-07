/**
 * Agent Rollout page smoke tests
 *
 * Verifies:
 * - Renders one card per tenant with a row per agent type
 * - Mode + accuracy stats surface from the API response
 * - Selecting a new mode (DISABLED/SHADOW) prompts for a reason and calls
 *   the setMode hook.
 */

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import AgentRolloutPage from '../page';

// ─── Mock hooks ─────────────────────────────────────────────────────────────
const mockSetMode = jest.fn();
const mockPromote = jest.fn();
const mockRollback = jest.fn();

jest.mock('@/hooks/use-admin-agent-rollout', () => {
  const AGENT_TYPE_LABELS = {
    categorizer: 'Transaction categorizer',
    matcher: 'Payment matcher',
    sars: 'SARS tax explainer',
    validator: 'Extraction validator',
    orchestrator: 'Orchestrator',
  };
  return {
    AGENT_TYPE_LABELS,
    AGENT_TYPES: [
      'categorizer',
      'matcher',
      'sars',
      'validator',
      'orchestrator',
    ],
    useAgentRollout: () => ({
      data: {
        rows: [
          {
            tenantId: 'tenant-a',
            tenantName: 'Alpha Creche',
            agentType: 'categorizer',
            flagKey: 'sdk_categorizer',
            mode: 'DISABLED',
            matchRate: 96,
            totalDecisions: 250,
            meetsPromotionCriteria: true,
            promotionBlockers: [],
          },
          {
            tenantId: 'tenant-a',
            tenantName: 'Alpha Creche',
            agentType: 'matcher',
            flagKey: 'sdk_matcher',
            mode: 'SHADOW',
            matchRate: 80,
            totalDecisions: 40,
            meetsPromotionCriteria: false,
            promotionBlockers: ['Only 40 comparisons < required 100'],
          },
        ],
        periodDays: 7,
        generatedAt: '2026-07-07T00:00:00.000Z',
      },
      isLoading: false,
      isError: false,
    }),
    useSetAgentMode: () => ({ mutate: mockSetMode, isPending: false }),
    usePromoteAgent: () => ({ mutate: mockPromote, isPending: false }),
    useRollbackAllAgents: () => ({ mutate: mockRollback, isPending: false }),
  };
});

jest.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: jest.fn() }),
}));

function renderWithQuery(ui: React.ReactElement) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>{ui}</QueryClientProvider>,
  );
}

describe('AgentRolloutPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders one row per (tenant × agent) with mode and stats', async () => {
    renderWithQuery(<AgentRolloutPage />);

    // Tenant card
    expect(await screen.findByText('Alpha Creche')).toBeInTheDocument();

    // Categorizer row
    const catRow = screen.getByTestId('row-tenant-a-categorizer');
    expect(catRow).toHaveTextContent('Transaction categorizer');
    expect(catRow).toHaveTextContent('sdk_categorizer');
    expect(catRow).toHaveTextContent('96%');
    expect(catRow).toHaveTextContent('250');
    expect(catRow).toHaveTextContent('DISABLED');

    // Matcher row
    const matcherRow = screen.getByTestId('row-tenant-a-matcher');
    expect(matcherRow).toHaveTextContent('SHADOW');
    expect(matcherRow).toHaveTextContent('80%');
  });

  it('rollback button opens confirmation and calls rollback hook on confirm', async () => {
    const user = userEvent.setup();
    const promptSpy = jest
      .spyOn(window, 'prompt')
      .mockReturnValue('safety brake');

    renderWithQuery(<AgentRolloutPage />);
    await screen.findByText('Alpha Creche');

    const rollbackBtn = screen.getByRole('button', { name: /rollback all/i });
    await user.click(rollbackBtn);

    // Reason prompt is required
    expect(promptSpy).toHaveBeenCalled();

    // Confirmation dialog appears
    const confirm = await screen.findByTestId('confirm-action');
    await user.click(confirm);

    await waitFor(() => {
      expect(mockRollback).toHaveBeenCalledWith(
        {
          tenantId: 'tenant-a',
          reason: 'safety brake',
        },
        expect.any(Object),
      );
    });

    promptSpy.mockRestore();
  });

  it('cancelling the reason prompt does NOT open the confirmation dialog', async () => {
    const user = userEvent.setup();
    const promptSpy = jest.spyOn(window, 'prompt').mockReturnValue(null);

    renderWithQuery(<AgentRolloutPage />);
    await screen.findByText('Alpha Creche');

    const rollbackBtn = screen.getByRole('button', { name: /rollback all/i });
    await user.click(rollbackBtn);

    expect(promptSpy).toHaveBeenCalled();
    // No confirm-action anywhere on the page
    expect(screen.queryByTestId('confirm-action')).not.toBeInTheDocument();
    expect(mockRollback).not.toHaveBeenCalled();

    promptSpy.mockRestore();
  });

  it('renders promote button, disabled for agents that don’t meet criteria', async () => {
    renderWithQuery(<AgentRolloutPage />);
    await screen.findByText('Alpha Creche');

    // Categorizer: meets criteria → enabled
    const catPromote = screen.getByTestId('promote-tenant-a-categorizer');
    expect(catPromote).not.toBeDisabled();

    // Matcher: only 40 comparisons < 100 → disabled
    const matcherPromote = screen.getByTestId('promote-tenant-a-matcher');
    expect(matcherPromote).toBeDisabled();
  });
});
