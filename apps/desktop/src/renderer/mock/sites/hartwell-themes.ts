// Looks for the mock Hartwell site: the playful "now" and three calmer directions.

export interface Theme {
  label: string;
  bg: string;
  ink: string;
  body: string;
  accent: string;
  accentText: string;
  block: string;
  font: string;
  headingWeight: number;
  radius: number;
  pill: boolean;
}

const BOUNCY = "ui-rounded, 'Arial Rounded MT Bold', 'Comic Sans MS', system-ui, sans-serif";

export const HARTWELL_THEMES: Record<string, Theme> = {
  now: {
    label: 'NOW',
    bg: '#FFF1F7',
    ink: '#E0187A',
    body: '#4A2440',
    accent: '#FFD60A',
    accentText: '#4A2440',
    block: '#FFC9E4',
    font: BOUNCY,
    headingWeight: 800,
    radius: 22,
    pill: true,
  },
  quiet: {
    label: 'QUIET & DIGNIFIED',
    bg: '#F4F1EC',
    ink: '#1F2A44',
    body: '#3F4658',
    accent: '#1F2A44',
    accentText: '#FFFFFF',
    block: '#DDD6CB',
    font: "'Fraunces', Georgia, serif",
    headingWeight: 600,
    radius: 6,
    pill: false,
  },
  warm: {
    label: 'WARM & PERSONAL',
    bg: '#FBF3E8',
    ink: '#5B4636',
    body: '#5E4A3B',
    accent: '#5B4636',
    accentText: '#FFFFFF',
    block: '#E8D2B8',
    font: "Georgia, 'Times New Roman', serif",
    headingWeight: 600,
    radius: 14,
    pill: false,
  },
  classic: {
    label: 'CLASSIC & FORMAL',
    bg: '#FFFFFF',
    ink: '#111111',
    body: '#444444',
    accent: '#111111',
    accentText: '#FFFFFF',
    block: '#E5E5E5',
    font: "'Times New Roman', Times, serif",
    headingWeight: 700,
    radius: 0,
    pill: false,
  },
};
