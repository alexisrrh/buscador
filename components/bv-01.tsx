"use client";

export type RobotState = "IDLE" | "LISTENING" | "SAVING" | "UNDERSTOOD" | "NEEDS_INPUT" | "SEARCH_READY" | "ERROR";

export function BV01({ state }: { state: RobotState }) {
  const label = {
    IDLE: "BV-01 en espera",
    LISTENING: "BV-01 escuchando tu respuesta",
    SAVING: "BV-01 guardando la señal",
    UNDERSTOOD: "BV-01 ha entendido la señal",
    NEEDS_INPUT: "BV-01 necesita una señal",
    SEARCH_READY: "BV-01 listo para buscar oportunidades",
    ERROR: "BV-01 no pudo guardar la señal",
  }[state];

  return <div className={`bv-01 bv-01--${state.toLowerCase()}`} role="img" aria-label={label}>
    <svg viewBox="0 0 300 320" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id="bv-shell" x1="0" x2="1" y1="0" y2="1"><stop stopColor="#3a526e" /><stop offset=".4" stopColor="#17293f" /><stop offset="1" stopColor="#070e18" /></linearGradient>
        <linearGradient id="bv-panel" x1="0" x2="0" y1="0" y2="1"><stop stopColor="#425f7e" /><stop offset="1" stopColor="#111f32" /></linearGradient>
        <linearGradient id="bv-core" x1="0" x2="1"><stop stopColor="#61d7ff" /><stop offset="1" stopColor="#8068ff" /></linearGradient>
        <filter id="bv-glow"><feGaussianBlur stdDeviation="5" /></filter><filter id="bv-shadow"><feDropShadow dx="0" dy="7" stdDeviation="5" floodOpacity=".45" /></filter>
      </defs>
      <g className="bv-01__orbit"><path d="M82 58c21-43 113-43 144 3" fill="none" stroke="url(#bv-core)" strokeWidth="4" strokeLinecap="round" /><path d="M218 36l16-4-5 16" fill="#61d7ff" /><circle cx="82" cy="58" r="5" fill="#8068ff" /></g>
      <g className="bv-01__arm bv-01__arm--left"><path d="M97 174l-27 25 11 16-31 23" fill="none" stroke="#0a1422" strokeWidth="20" strokeLinecap="round" /><path d="M97 174l-27 25 11 16-31 23" fill="none" stroke="url(#bv-panel)" strokeWidth="13" strokeLinecap="round" /><circle cx="70" cy="199" r="9" fill="#0b1727" stroke="#61d7ff" strokeWidth="3" /><path className="bv-01__hand" d="M42 239l-13 9m16-6-5 14m8-17 8 10" fill="none" stroke="#78d7ff" strokeWidth="3" strokeLinecap="round" /></g>
      <g className="bv-01__arm bv-01__arm--right"><path d="M203 174l28 23-9 19 29 21" fill="none" stroke="#0a1422" strokeWidth="20" strokeLinecap="round" /><path d="M203 174l28 23-9 19 29 21" fill="none" stroke="url(#bv-panel)" strokeWidth="13" strokeLinecap="round" /><circle cx="231" cy="197" r="9" fill="#0b1727" stroke="#8068ff" strokeWidth="3" /><path className="bv-01__hand" d="M258 238l13 9m-16-6 5 14m-8-17-8 10" fill="none" stroke="#a899ff" strokeWidth="3" strokeLinecap="round" /></g>
      <g className="bv-01__head" filter="url(#bv-shadow)"><path d="M82 79c0-28 25-48 68-48s68 20 68 48v42c0 29-30 48-68 48s-68-19-68-48V79Z" fill="url(#bv-shell)" stroke="#6d89a9" strokeWidth="3" /><path d="M98 83c15-17 90-17 104 0v29c-14 16-89 16-104 0V83Z" fill="#050d18" stroke="#3e5f7d" strokeWidth="2" /><path className="bv-01__visor" d="M117 99h24m18 0h24" fill="none" stroke="url(#bv-core)" strokeWidth="8" strokeLinecap="round" /><path d="M98 132h104" stroke="#708ba8" strokeOpacity=".35" /><path d="M109 58c20-10 56-11 79 0" fill="none" stroke="#93bcdd" strokeOpacity=".38" strokeWidth="3" strokeLinecap="round" /></g>
      <g className="bv-01__body" filter="url(#bv-shadow)"><path d="M95 160c14-13 96-13 110 0l15 76c-18 27-122 27-140 0l15-76Z" fill="url(#bv-shell)" stroke="#6987a6" strokeWidth="3" /><path d="M108 168c13-6 71-6 84 0l8 51c-16 14-68 14-84 0l-8-51Z" fill="#0d1a2b" stroke="#36536f" strokeWidth="2" /><path d="M101 231c30 13 69 13 98 0" fill="none" stroke="#8db6d4" strokeOpacity=".24" strokeWidth="3" /><circle className="bv-01__core-glow" cx="150" cy="197" r="34" fill="#61d7ff" opacity=".28" filter="url(#bv-glow)" /><circle cx="150" cy="197" r="24" fill="#081423" stroke="url(#bv-core)" strokeWidth="4" /><circle cx="150" cy="197" r="17" fill="none" stroke="#98e3ff" strokeOpacity=".3" /><path className="bv-01__mark" d="M142 181h15c14 0 15 19 1 19h-16m0 0h17c14 0 13 19-2 19h-15" fill="none" stroke="url(#bv-core)" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" /></g>
      <g className="bv-01__feet"><path d="M112 246v20c-13 2-18 9-19 17h38c-1-11-7-16-19-17m76-20v20c13 2 18 9 19 17h-38c1-11 7-16 19-17" fill="#112035" stroke="#5b7895" strokeWidth="3" strokeLinejoin="round" /><path d="M97 283h32m42 0h32" stroke="#61d7ff" strokeOpacity=".45" strokeWidth="3" strokeLinecap="round" /></g>
    </svg>
  </div>;
}
