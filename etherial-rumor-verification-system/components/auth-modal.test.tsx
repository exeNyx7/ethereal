import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { AuthModal } from './auth-modal';
import '@testing-library/jest-dom';

// Mock User Context
jest.mock('@/lib/user-context', () => ({
    useUser: () => ({
        login: jest.fn().mockResolvedValue(true),
        user: null,
    }),
}));

describe('AuthModal', () => {
    it('does not render when closed', () => {
        render(<AuthModal isOpen={false} onOpenChange={jest.fn()} />);
        expect(screen.queryByText('Join ethereal')).not.toBeInTheDocument();
    });

    it('renders correctly when open', () => {
        render(<AuthModal isOpen={true} onOpenChange={jest.fn()} />);
        expect(screen.getByText('Join ethereal')).toBeVisible();
        expect(screen.getByLabelText('University Email')).toBeVisible();
        expect(screen.getByLabelText('Passphrase')).toBeVisible();
    });

    it('updates input fields', () => {
        render(<AuthModal isOpen={true} onOpenChange={jest.fn()} />);
        const emailInput = screen.getByLabelText('University Email');
        const passInput = screen.getByLabelText('Passphrase');

        fireEvent.change(emailInput, { target: { value: 'test@nu.edu.pk' } });
        fireEvent.change(passInput, { target: { value: 'secret123' } });

        expect(emailInput).toHaveValue('test@nu.edu.pk');
        expect(passInput).toHaveValue('secret123');
    });
});
