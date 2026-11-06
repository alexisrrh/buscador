export type BV01VisualState = "IDLE" | "LISTENING" | "SAVING" | "SEARCHING" | "SEARCH_READY" | "SEARCH_RESULTS" | "ERROR";

export const bv01VisualStateMap = {
  IDLE: {
    status: "EN ESPERA", activity: "Esperando una preferencia", primary: "#65ddff", accent: "#9a84ff",
    ringOpacity: 0.58, rotationSpeed: 0.035, pulseAmount: 0.008, pulseSpeed: 0.45, lightIntensity: 0.48,
    globeOpacity: 0.24, globeLight: 0.16, globeSpeed: 0.035, ambient: 1, key: 1, fill: 1, rim: 1,
  },
  LISTENING: {
    status: "ESCUCHANDO", activity: "Preferencia introducida", primary: "#7be8ff", accent: "#8f91ff",
    ringOpacity: 0.7, rotationSpeed: 0.05, pulseAmount: 0.016, pulseSpeed: 0.7, lightIntensity: 0.62,
    globeOpacity: 0.34, globeLight: 0.24, globeSpeed: 0.05, ambient: 1.04, key: 1.05, fill: 1.08, rim: 1.06,
  },
  SAVING: {
    status: "GUARDANDO", activity: "Guardando preferencia", primary: "#66dfff", accent: "#8793ff",
    ringOpacity: 0.82, rotationSpeed: 0.075, pulseAmount: 0.028, pulseSpeed: 1.15, lightIntensity: 0.78,
    globeOpacity: 0.38, globeLight: 0.28, globeSpeed: 0.065, ambient: 1.06, key: 1.08, fill: 1.1, rim: 1.18,
  },
  SEARCHING: {
    status: "BUSCANDO", activity: "Buscando oportunidades", primary: "#5ce4ff", accent: "#7c9dff",
    ringOpacity: 0.88, rotationSpeed: 0.09, pulseAmount: 0.03, pulseSpeed: 1.05, lightIntensity: 0.84,
    globeOpacity: 0.46, globeLight: 0.36, globeSpeed: 0.075, ambient: 1.08, key: 1.1, fill: 1.13, rim: 1.24,
  },
  SEARCH_READY: {
    status: "LISTO", activity: "Busqueda preparada", primary: "#75e8d0", accent: "#76bfff",
    ringOpacity: 0.86, rotationSpeed: 0.025, pulseAmount: 0.01, pulseSpeed: 0.4, lightIntensity: 0.76,
    globeOpacity: 0.44, globeLight: 0.32, globeSpeed: 0.04, ambient: 1.1, key: 1.1, fill: 1.12, rim: 1.12,
  },
  SEARCH_RESULTS: {
    status: "RESULTADOS LISTOS", activity: "Oportunidades encontradas", primary: "#75e8d0", accent: "#76bfff",
    ringOpacity: 0.72, rotationSpeed: 0.02, pulseAmount: 0.006, pulseSpeed: 0.35, lightIntensity: 0.68,
    globeOpacity: 0.38, globeLight: 0.26, globeSpeed: 0.03, ambient: 1.06, key: 1.08, fill: 1.08, rim: 1.08,
  },
  ERROR: {
    status: "ERROR", activity: "Error al guardar la preferencia", primary: "#ff9a91", accent: "#ffb08d",
    ringOpacity: 0.54, rotationSpeed: 0.02, pulseAmount: 0.012, pulseSpeed: 0.85, lightIntensity: 0.42,
    globeOpacity: 0.16, globeLight: 0.1, globeSpeed: 0.018, ambient: 0.92, key: 0.94, fill: 0.9, rim: 0.92,
  },
} as const satisfies Record<BV01VisualState, {
  status: string; activity: string; primary: string; accent: string;
  ringOpacity: number; rotationSpeed: number; pulseAmount: number; pulseSpeed: number; lightIntensity: number;
  globeOpacity: number; globeLight: number; globeSpeed: number; ambient: number; key: number; fill: number; rim: number;
}>;
