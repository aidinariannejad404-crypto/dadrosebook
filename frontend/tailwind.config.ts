import type { Config } from "tailwindcss";

/** Colours come only from CSS variables in src/styles/tokens.css. */
const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: "var(--color-primary)",
          hover: "var(--color-primary-hover)",
          soft: "var(--color-primary-soft)",
          tint: "var(--color-primary-tint)",
        },
        accent: {
          DEFAULT: "var(--color-accent)",
          soft: "var(--color-accent-soft)",
          strong: "var(--color-accent-strong)",
          ink: "var(--color-accent-ink)",
        },
        bg: "var(--color-bg)",
        surface: {
          DEFAULT: "var(--color-surface)",
          muted: "var(--color-surface-muted)",
        },
        ink: {
          DEFAULT: "var(--color-text)",
          muted: "var(--color-text-muted)",
        },
        line: {
          DEFAULT: "var(--color-border)",
          strong: "var(--color-border-strong)",
        },
        success: { DEFAULT: "var(--color-success)", soft: "var(--color-success-soft)" },
        danger: { DEFAULT: "var(--color-danger)", soft: "var(--color-danger-soft)" },
        warning: { DEFAULT: "var(--color-warning)", soft: "var(--color-warning-soft)" },
        info: { DEFAULT: "var(--color-info)", soft: "var(--color-info-soft)" },
        neutral: { soft: "var(--color-neutral-soft)" },
        focus: "var(--color-focus)",
      },
      fontFamily: {
        sans: ["var(--font-vazirmatn)", "Tahoma", "sans-serif"],
      },
      borderRadius: {
        card: "var(--radius-card)",
        control: "var(--radius-control)",
      },
      boxShadow: {
        card: "var(--shadow-card)",
        raised: "var(--shadow-raised)",
      },
      maxWidth: {
        site: "80rem",
      },
    },
  },
  plugins: [],
};

export default config;
