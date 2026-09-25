// Generated from tokens.json. Colors per theme; everything else theme-free.
export const themes = ["light", "night"] as const;
export const color = {
  "ground": { light: "#F3F2EE", night: "#14120F" },
  "surface": { light: "#FFFFFF", night: "#211E1A" },
  "surface-sunken": { light: "#E6E4DE", night: "#2A2621" },
  "line": { light: "#DAD8D2", night: "#3A342D" },
  "control-line": { light: "#7F7D78", night: "#80796E" },
  "ink": { light: "#1B1A18", night: "#ECE6DA" },
  "ink-muted": { light: "#5C5B57", night: "#A39C8F" },
  "ai-surface": { light: "#FFFFFF", night: "#1B1F23" },
  "ai-line": { light: "#C8D2DC", night: "#3A4652" },
  "ai-ink": { light: "#3A6795", night: "#A3B8CC" },
  "on-ai": { light: "#FFFFFF", night: "#14120F" },
  "maya-surface": { light: "#1C1B19", night: "#2B211A" },
  "maya-line": { light: "#1C1B19", night: "#5A3F2C" },
  "on-maya": { light: "#F4F1EA", night: "#ECE6DA" },
  "on-maya-muted": { light: "#ABA8A1", night: "#B3A99A" },
  "maya-accent": { light: "#EE8D5F", night: "#E89A6E" },
  "on-maya-accent": { light: "#1C1B19", night: "#14120F" },
  "maya-ink": { light: "#7E2E12", night: "#E89A6E" },
  "team-surface": { light: "#ECEAE5", night: "#24221F" },
  "team-ink": { light: "#5C5B57", night: "#A39C8F" },
  "alert": { light: "#B42318", night: "#FF8A7A" },
  "focus": { light: "var(--ink)", night: "var(--ink)" },
  "focus-on-maya": { light: "var(--maya-accent)", night: "var(--maya-accent)" },
} as const;
export const spacing = {
  "space-1": "4px",
  "space-2": "8px",
  "space-3": "12px",
  "space-4": "16px",
  "space-5": "20px",
  "space-6": "24px",
  "space-8": "32px",
  "space-12": "48px",
} as const;
export const radius = {
  "radius-tail": "4px",
  "radius-sm": "8px",
  "radius-md": "12px",
  "radius-lg": "14px",
  "radius-xl": "20px",
  "radius-pill": "999px",
} as const;
export const zIndex = {
  "z-strip": "10",
  "z-composer": "20",
  "z-sheet": "40",
} as const;
export const fontFamily = {
  "sans": "Geist, \"Helvetica Neue\", Arial, sans-serif",
  "serif": "Newsreader, Georgia, \"Times New Roman\", serif",
  "mono": "\"Geist Mono\", ui-monospace, Menlo, monospace"
} as const;
export const textStyle = {
  "display-xl": {
    "fontSize": "64px",
    "lineHeight": "60px",
    "fontWeight": 400,
    "letterSpacing": "-0.03em",
    "family": "serif"
  },
  "display-lg": {
    "fontSize": "34px",
    "lineHeight": "36px",
    "fontWeight": 400,
    "letterSpacing": "-0.02em",
    "family": "serif"
  },
  "display-md": {
    "fontSize": "26px",
    "lineHeight": "30px",
    "fontWeight": 400,
    "letterSpacing": "-0.015em",
    "family": "serif"
  },
  "voice-lg": {
    "fontSize": "18px",
    "lineHeight": "28px",
    "fontWeight": 400,
    "family": "serif"
  },
  "voice-md": {
    "fontSize": "16px",
    "lineHeight": "24px",
    "fontWeight": 400,
    "family": "serif"
  },
  "title": {
    "fontSize": "17px",
    "lineHeight": "22px",
    "fontWeight": 600,
    "letterSpacing": "-0.015em",
    "family": "sans"
  },
  "body": {
    "fontSize": "15px",
    "lineHeight": "22px",
    "fontWeight": 400,
    "family": "sans"
  },
  "body-strong": {
    "fontSize": "15px",
    "lineHeight": "22px",
    "fontWeight": 600,
    "family": "sans"
  },
  "label": {
    "fontSize": "13px",
    "lineHeight": "18px",
    "fontWeight": 600,
    "family": "sans"
  },
  "caption": {
    "fontSize": "12px",
    "lineHeight": "17px",
    "fontWeight": 400,
    "family": "sans"
  },
  "data-lg": {
    "fontSize": "24px",
    "lineHeight": "28px",
    "fontWeight": 400,
    "family": "mono"
  },
  "data-md": {
    "fontSize": "15px",
    "lineHeight": "20px",
    "fontWeight": 400,
    "family": "mono"
  },
  "data-sm": {
    "fontSize": "11px",
    "lineHeight": "14px",
    "fontWeight": 400,
    "letterSpacing": "0.05em",
    "family": "mono"
  }
} as const;
