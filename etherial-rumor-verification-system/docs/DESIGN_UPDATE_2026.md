# Ethereal Design System Update - 2026

## Overview
Complete redesign of the ethereal application with a modern, dark-themed aesthetic inspired by the provided reference screenshots. All functionality preserved; only visual styling and layout updated.

## Color Palette

### Core Colors
- **Background**: `#1a1a2e` (Dark Navy)
- **Darker Background**: `#0f0f1e` (Deep Black)
- **Primary Action**: `#a855f7` (Purple) / `#7c3aed` (Dark Purple)
- **Success/Truth**: `#22c55e` (Neon Green) - for TRUE votes
- **Danger/False**: `#ef4444` (Bright Red) - for FALSE votes
- **Text**: White (`#ffffff`) for headings, Gray (`#9ca3af`) for secondary

### Semantic Usage
- Purple buttons for all primary actions (Submit Rumor, Sign In, Challenge)
- Green buttons for TRUE voting (bright, high-contrast)
- Red buttons for FALSE voting (bright, high-contrast)
- White borders with transparency for form inputs
- Subtle white/10 backgrounds for cards

## Typography

### Fonts
- **Primary**: Inter (sans-serif) for all text
- **Removed**: Crimson Text serif font (no longer used)
- **Weight**: Bold (700) for headings, regular (400) for body text

### Font Sizes
- Page headings: `text-5xl font-bold`
- Modal titles: `text-2xl font-bold`
- Card titles: `text-xl font-bold`
- Labels: `text-sm font-semibold`
- Helper text: `text-xs`

## Layout Changes

### Main Dashboard
- **Centered layout**: Content centered on screen with max-width constraint
- **Header**: Domain name as H1, subtitle with stats
- **Search + Button row**: Search input + "New Rumor" button
- **Filter tabs**: Active, Facts, False, Challenged tabs with border indicators
- **Empty state**: Centered ghost icon with call-to-action

### Submit Rumor Modal
- **Icon + Title**: Bell icon + "Submit a Rumor"
- **Title input**: Max 100 characters
- **Window selector**: 3 visual buttons (Temporary/Not Urgent/Permanent) instead of dropdown
- **Submit button**: Full-width purple button with lock icon

### Vote Interface
- **TRUE button**: Bright green with white text when active
- **FALSE button**: Bright red with white text when active
- **Inactive**: Semi-transparent with colored border
- **Feedback**: Shows vote weight calculation

### Authentication
- **Clean form**: Email + Passphrase fields
- **Privacy message**: Clearly states email is never stored
- **Button text**: "Continue Anonymously" (more explicit)

## Component Updates

### Rumor Card
- Background: `app-dark` with `app-purple/20` border
- Title: Bold white text
- Vote buttons: Full-width with high contrast colors
- Opposition button: Purple outline style
- Access message: Subtle gray background

### Auth Modal
- Title: Bold white
- Form fields: White/10 backgrounds with purple borders
- Submit button: Purple with hover state
- Privacy note: Smaller, grayed text

### Opposition Modal
- Title: Bold white with shield icon
- Form: Consistent with auth modal styling
- Cost warning: Red/danger themed
- Submit button: Purple

## Spacing & Radius

- **Border radius**: `rounded-lg` for all components (slightly larger than default)
- **Padding**: Consistent use of Tailwind spacing scale
- **Gaps**: Clear spacing between elements using `gap-3`, `gap-4`

## Visual Hierarchy

1. **Highest**: Purple buttons (primary actions)
2. **High**: White text headings
3. **Medium**: Green/Red voting buttons
4. **Low**: Gray helper text, input borders
5. **Lowest**: Disabled/inactive states

## Responsive Design

- Main container: `max-w-2xl` on desktop
- Mobile-first approach with padding on all sides
- Modals: `max-w-md` for controlled width
- Buttons: Full-width for mobile, consistent sizing

## Removed Elements

- Vintage cream/charcoal color scheme (completely replaced)
- Serif font (Crimson Text removed)
- Ethereal-specific color names (all replaced with `app-*` naming)
- Light backgrounds (replaced with dark + transparency)

## New Features/Emphasis

- Higher contrast voting buttons (green/red are neon)
- Visual window selection with emoji indicators
- Purple-focused primary actions
- More prominent modals with better shadows
- Filter tabs for rumor categorization
- Empty state with emoji mascot

## Maintained Functionality

All core features remain intact:
- Anonymous authentication ✓
- P2P voting system ✓
- Reputation karma tracking ✓
- Opposition challenges ✓
- Domain-based communities ✓
- Vote blindness until resolution ✓
- √Karma weighting ✓
- Ghost rumor system ✓
- Cascading recalculation ✓

## Files Modified

1. `tailwind.config.ts` - Color system
2. `app/globals.css` - CSS variables
3. `app/layout.tsx` - Font removal
4. `app/page.tsx` - Complete layout redesign
5. `components/rumor-card.tsx` - Card styling
6. `components/auth-modal.tsx` - Auth UI
7. `components/opposition-modal.tsx` - Opposition UI

## Testing Recommendations

- Verify all buttons are clickable and styled correctly
- Check color contrast on voting buttons (should be very high)
- Test modal interactions and form submission
- Verify responsive behavior on mobile
- Check that all text is readable on dark background
- Confirm vote weight calculations still display properly

---

**Design Version**: 2.0  
**Updated**: February 2026  
**Theme**: Dark Mode with Purple Accents
