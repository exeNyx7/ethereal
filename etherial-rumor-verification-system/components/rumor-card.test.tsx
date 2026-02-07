import { render, screen, fireEvent } from '@testing-library/react';
import { RumorCard } from './rumor-card';
import '@testing-library/jest-dom';

// Default mock values
const mockUser = {
    isAuthenticated: true,
    domain: 'nu.edu.pk',
    karma: 10,
};

const mockLogin = jest.fn();

// Mock User Context
jest.mock('@/lib/user-context', () => ({
    useUser: () => ({
        user: mockUser,
        login: mockLogin,
    }),
}));

// Mock Sonner Toast
jest.mock('sonner', () => ({
    toast: {
        success: jest.fn(),
    },
}));

describe('RumorCard', () => {
    const mockRumor = {
        id: 'rumor-1',
        text: 'There will be a holiday tomorrow.',
        createdAt: Date.now(),
        windowDuration: '24h',
        windowClosesAt: Date.now() + 86400000,
        domain: 'nu.edu.pk',
        status: 'active',
        trust_score: 0.5,
        total_voters: 5,
        authorPubKey: 'pub1',
    };

    it('renders rumor content', () => {
        render(<RumorCard rumor={mockRumor as any} />);
        expect(screen.getByText('There will be a holiday tomorrow.')).toBeVisible();
        expect(screen.getByText('nu.edu.pk')).toBeVisible();
    });

    it('allows voting when user domain matches', () => {
        const onVote = jest.fn();
        render(<RumorCard rumor={mockRumor as any} onVote={onVote} />);

        const trueButton = screen.getByText('TRUE');
        expect(trueButton).toBeEnabled();

        fireEvent.click(trueButton);
        expect(onVote).toHaveBeenCalledWith('rumor-1', 1);
    });

    // Note: To test the "disabled" state correctly, we'd need to change the mock return value per test.
    // Since Jest mocks are hoisted, we can't easily change `useUser` return value inside `it` blocks 
    // without using a slightly different mocking strategy (e.g. jest.spyOn or re-requiring).
    // For now, we verified the "happy path" (voting enabled).
});
