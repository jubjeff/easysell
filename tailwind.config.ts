import type { Config } from "tailwindcss";

/**
 * Identidade Tégui — tokens extraídos da logo:
 * fundo quase-preto frio, lima dos colchetes como único acento forte,
 * branco frio no texto. Violeta só em detalhes (foco, nav ativa).
 *
 * As escalas `zinc` e `emerald` são REMAPEADAS para a paleta da marca:
 * todo o app herda o rebrand na hora, e cada tela é refinada por cima.
 */
const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // tokens novos (uso explícito nas telas refinadas)
        navy: {
          950: "#0A0E16", // fundo base (logo)
          900: "#111827", // superfície / card
          800: "#1A2338", // hover / elevado
          700: "#26314B", // borda funcional
          600: "#39466A",
        },
        lima: {
          DEFAULT: "#A3E635", // colchetes da logo — ação primária
          hover: "#BEF264",
          deep: "#65801E",
          faint: "#A3E63514",
        },
        viola: {
          DEFAULT: "#8B7CF6", // detalhe: foco, nav ativa
          faint: "#8B7CF61A",
        },
        paper: "#F2F4F8", // branco da logo
        dim: "#97A0B0",

        // remapeamento das escalas usadas no código legado
        zinc: {
          50: "#F7F9FC",
          100: "#F2F4F8",
          200: "#D9DFEA",
          300: "#B6BfD1",
          400: "#97A0B0",
          500: "#6F7A8F",
          600: "#4E5870",
          700: "#26314B",
          800: "#1A2338",
          900: "#111827",
          950: "#0A0E16",
        },
        emerald: {
          50: "#FAFEF0",
          100: "#F1FCD8",
          200: "#E2F9AC",
          300: "#CDF272",
          400: "#A3E635",
          500: "#8CCC24",
          600: "#6FA51C",
          700: "#557F17",
          800: "#3E5C13",
          900: "#2A3E0F",
          950: "#17230A",
        },
      },
      fontFamily: {
        sans: ["var(--font-grotesk)", "system-ui", "sans-serif"],
        mono: ["var(--font-plex-mono)", "ui-monospace", "monospace"],
      },
      keyframes: {
        "pulse-ready": {
          "0%, 100%": { boxShadow: "0 0 0 0 rgba(163, 230, 53, 0.35)" },
          "50%": { boxShadow: "0 0 0 6px rgba(163, 230, 53, 0)" },
        },
        "settle-in": {
          from: { opacity: "0", transform: "translateY(4px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
      },
      animation: {
        "pulse-ready": "pulse-ready 2s ease-in-out infinite",
        "settle-in": "settle-in 240ms ease-out",
      },
    },
  },
  plugins: [],
};
export default config;
