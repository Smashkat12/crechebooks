/**
 * Skip Link Component Tests
 * TASK-UI-007: Accessibility Skip Links
 */

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SkipLink, SkipLinks, DefaultSkipLinks } from '../ui/skip-link';

describe('SkipLink', () => {
  describe('Rendering', () => {
    it('renders as a link element', () => {
      render(<SkipLink href="#main">Skip to main</SkipLink>);
      const link = screen.getByRole('link', { name: 'Skip to main' });
      expect(link).toBeInTheDocument();
    });

    it('has correct href attribute', () => {
      render(<SkipLink href="#main-content">Skip to content</SkipLink>);
      const link = screen.getByRole('link', { name: 'Skip to content' });
      expect(link).toHaveAttribute('href', '#main-content');
    });

    it('renders children text correctly', () => {
      render(<SkipLink href="#nav">Skip to navigation</SkipLink>);
      expect(screen.getByText('Skip to navigation')).toBeInTheDocument();
    });

    it('applies custom className', () => {
      render(
        <SkipLink href="#main" className="custom-class">
          Skip
        </SkipLink>
      );
      const link = screen.getByRole('link', { name: 'Skip' });
      expect(link).toHaveClass('custom-class');
    });
  });

  describe('Accessibility', () => {
    it('is hidden by default with sr-only class', () => {
      render(<SkipLink href="#main">Skip to main</SkipLink>);
      const link = screen.getByRole('link', { name: 'Skip to main' });
      expect(link).toHaveClass('sr-only');
    });

    it('has focus:not-sr-only class for visibility on focus', () => {
      render(<SkipLink href="#main">Skip to main</SkipLink>);
      const link = screen.getByRole('link', { name: 'Skip to main' });
      expect(link).toHaveClass('focus:not-sr-only');
    });

    it('has proper focus styling classes', () => {
      render(<SkipLink href="#main">Skip to main</SkipLink>);
      const link = screen.getByRole('link', { name: 'Skip to main' });
      expect(link).toHaveClass('focus:ring-2');
      expect(link).toHaveClass('focus:outline-none');
    });

    it('is reachable via keyboard navigation', async () => {
      const user = userEvent.setup();
      render(
        <div>
          <SkipLink href="#main">Skip to main</SkipLink>
          <button>Other button</button>
        </div>
      );

      await user.tab();
      const link = screen.getByRole('link', { name: 'Skip to main' });
      expect(link).toHaveFocus();
    });
  });

  describe('Focus behavior', () => {
    it('receives focus on first tab press when first element', async () => {
      const user = userEvent.setup();
      render(
        <div>
          <SkipLink href="#main">Skip link</SkipLink>
          <button>Button</button>
          <a href="/page">Link</a>
        </div>
      );

      await user.tab();
      expect(screen.getByRole('link', { name: 'Skip link' })).toHaveFocus();
    });

    it('allows navigation to next element on second tab', async () => {
      const user = userEvent.setup();
      render(
        <div>
          <SkipLink href="#main">Skip link</SkipLink>
          <button>Button</button>
        </div>
      );

      await user.tab(); // Focus skip link
      await user.tab(); // Focus button
      expect(screen.getByRole('button', { name: 'Button' })).toHaveFocus();
    });
  });
});

describe('SkipLinks', () => {
  it('renders children', () => {
    render(
      <SkipLinks>
        <SkipLink href="#main">Skip 1</SkipLink>
        <SkipLink href="#nav">Skip 2</SkipLink>
      </SkipLinks>
    );
    expect(screen.getByRole('link', { name: 'Skip 1' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Skip 2' })).toBeInTheDocument();
  });

  it('has navigation role', () => {
    render(
      <SkipLinks>
        <SkipLink href="#main">Skip</SkipLink>
      </SkipLinks>
    );
    expect(screen.getByRole('navigation', { name: 'Skip links' })).toBeInTheDocument();
  });

  it('has proper aria-label', () => {
    render(
      <SkipLinks>
        <SkipLink href="#main">Skip</SkipLink>
      </SkipLinks>
    );
    const nav = screen.getByRole('navigation');
    expect(nav).toHaveAttribute('aria-label', 'Skip links');
  });
});

describe('DefaultSkipLinks', () => {
  it('renders skip to main content link', () => {
    render(<DefaultSkipLinks />);
    const mainLink = screen.getByRole('link', { name: 'Skip to main content' });
    expect(mainLink).toBeInTheDocument();
    expect(mainLink).toHaveAttribute('href', '#main-content');
  });

  it('renders skip to navigation link', () => {
    render(<DefaultSkipLinks />);
    const navLink = screen.getByRole('link', { name: 'Skip to navigation' });
    expect(navLink).toBeInTheDocument();
    expect(navLink).toHaveAttribute('href', '#main-navigation');
  });

  it('wraps links in SkipLinks container', () => {
    render(<DefaultSkipLinks />);
    expect(screen.getByRole('navigation', { name: 'Skip links' })).toBeInTheDocument();
  });

  it('allows tabbing through all skip links', async () => {
    const user = userEvent.setup();
    render(<DefaultSkipLinks />);

    await user.tab();
    expect(screen.getByRole('link', { name: 'Skip to main content' })).toHaveFocus();

    await user.tab();
    expect(screen.getByRole('link', { name: 'Skip to navigation' })).toHaveFocus();
  });
});
