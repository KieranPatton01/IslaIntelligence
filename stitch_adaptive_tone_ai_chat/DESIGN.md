---
name: Ethereal Peony
colors:
  surface: '#fcf9f8'
  surface-dim: '#dcd9d9'
  surface-bright: '#fcf9f8'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f6f3f2'
  surface-container: '#f0eded'
  surface-container-high: '#eae7e7'
  surface-container-highest: '#e5e2e1'
  on-surface: '#1c1b1b'
  on-surface-variant: '#564149'
  inverse-surface: '#313030'
  inverse-on-surface: '#f3f0ef'
  outline: '#897179'
  outline-variant: '#dcbfc9'
  surface-tint: '#ac2471'
  primary: '#ac2471'
  on-primary: '#ffffff'
  primary-container: '#ff69b4'
  on-primary-container: '#6e0044'
  inverse-primary: '#ffb0d0'
  secondary: '#81515a'
  on-secondary: '#ffffff'
  secondary-container: '#fdbec9'
  on-secondary-container: '#7a4a54'
  tertiary: '#7212ff'
  on-tertiary: '#ffffff'
  tertiary-container: '#ae8bff'
  on-tertiary-container: '#43009f'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#ffd8e6'
  primary-fixed-dim: '#ffb0d0'
  on-primary-fixed: '#3d0024'
  on-primary-fixed-variant: '#8c0058'
  secondary-fixed: '#ffd9df'
  secondary-fixed-dim: '#f4b6c1'
  on-secondary-fixed: '#330f19'
  on-secondary-fixed-variant: '#663a43'
  tertiary-fixed: '#e9ddff'
  tertiary-fixed-dim: '#d1bcff'
  on-tertiary-fixed: '#23005b'
  on-tertiary-fixed-variant: '#5700c9'
  background: '#fcf9f8'
  on-background: '#1c1b1b'
  surface-variant: '#e5e2e1'
typography:
  display-lg:
    fontFamily: Plus Jakarta Sans
    fontSize: 48px
    fontWeight: '700'
    lineHeight: 56px
    letterSpacing: -0.02em
  display-lg-mobile:
    fontFamily: Plus Jakarta Sans
    fontSize: 32px
    fontWeight: '700'
    lineHeight: 40px
    letterSpacing: -0.01em
  headline-md:
    fontFamily: Plus Jakarta Sans
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 32px
  body-lg:
    fontFamily: Plus Jakarta Sans
    fontSize: 18px
    fontWeight: '400'
    lineHeight: 28px
  body-md:
    fontFamily: Plus Jakarta Sans
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
  label-sm:
    fontFamily: Geist
    fontSize: 12px
    fontWeight: '500'
    lineHeight: 16px
    letterSpacing: 0.05em
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  base: 4px
  xs: 8px
  sm: 16px
  md: 24px
  lg: 48px
  xl: 80px
  gutter: 24px
  margin-mobile: 16px
  margin-desktop: 64px
---

## Brand & Style
The design system focuses on a sophisticated "Pink Glass Minimalist" aesthetic. It targets a premium audience seeking a serene, high-end digital experience. The emotional response is one of calm, clarity, and modern luxury.

The style is a refined blend of **Minimalism** and **Glassmorphism**. It utilizes expansive white space, precise typography, and multi-layered translucent surfaces. Unlike standard glassmorphism, this system infuses a subtle pink warmth into the backdrop blurs to create a cohesive, ethereal atmosphere without sacrificing functional clarity.

## Colors
The palette is anchored by soft, expressive pinks. 
- **Primary (#FF69B4):** Used for high-emphasis actions and key interactive states. 
- **Secondary (#FFC0CB):** A softer tint used for decorative elements, subtle highlights, and tinted glass surfaces.
- **Tertiary (#7000FF):** A deep violet used sparingly for high-contrast accents or specialized data visualization to provide depth against the pink tones.
- **Surface Tints:** Glass surfaces should use a 5-10% opacity version of the secondary color (`rgba(255, 192, 203, 0.1)`) combined with heavy backdrop blurring.

## Typography
The system uses **Plus Jakarta Sans** for its approachable yet modern geometry, ensuring the interface feels friendly and high-end. For technical data and small metadata labels, **Geist** provides a crisp, monospaced-adjacent clarity that balances the softness of the headlines.

Hierarchy is maintained through generous line heights and tight letter-spacing on larger headings to create a "locked-in" editorial look. Mobile typography automatically scales down display sizes to maintain legibility within smaller viewports.

## Layout & Spacing
The layout follows a **fluid grid** philosophy with an 8px base unit. 
- **Desktop:** 12-column grid with 24px gutters and wide 64px margins to emphasize the minimalist feel.
- **Mobile:** 4-column grid with 16px margins.

Spacing should be used expansively; prioritize "breathing room" over information density. Components should use the `lg` (48px) spacing for vertical section separation to maintain the premium, airy aesthetic.

## Elevation & Depth
Depth is achieved through **Glassmorphism** rather than traditional shadows.
- **Glass Layers:** Surfaces use a background blur of `20px` to `40px` and a semi-transparent white or pink stroke (1px, 20% opacity) to define edges.
- **Tonal Stacking:** Higher elevation is indicated by increased transparency and more intense backdrop blurs, making the element appear closer to the user.
- **Ambient Glow:** In place of drop shadows, use a very faint, large-radius outer glow in the primary pink color (`#FF69B4` at 5-8% opacity) to suggest light passing through the glass.

## Shapes
The shape language is consistently **Rounded**. This softens the minimalist lines and complements the fluid nature of the glass surfaces. 
- Standard components (buttons, inputs) use a 0.5rem radius.
- Larger containers and cards use a 1.5rem radius (`rounded-xl`).
- Interactive states should never use sharp corners, maintaining the "soft-touch" brand promise.

## Components
- **Buttons:** Primary buttons are solid `#FF69B4` with white text. Secondary buttons use the "Glass" style: a translucent pink background with a 1px border and primary-colored text.
- **Cards:** Defined by a `24px` backdrop blur, a subtle pink tint, and a 1px white-transparent border. No heavy shadows.
- **Input Fields:** Minimalist underlines or very light glass containers. Focus states use a glowing primary pink border.
- **Chips/Labels:** Use the `label-sm` typography (Geist) with a pill-shaped, low-opacity pink background.
- **Lists:** Separated by light pink hair-line dividers (0.5px) or soft-edged glass tiles for grouped items.
- **Progress Indicators:** Use smooth, continuous gradients from `#FFC0CB` to `#FF69B4` to emphasize the fluid theme.