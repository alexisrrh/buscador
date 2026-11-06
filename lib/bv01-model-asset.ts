export const BV01_MODEL_PATH = "/models/bv-01/BV01_clean_blue_visor_base.glb";
export const BV01_POSTER_PATH = "/models/bv-01/BV01_runtime_poster_lit.webp";

// Change this token whenever the public runtime copy changes. It makes the
// immutable cache policy safe without modifying the source GLB itself.
export const BV01_MODEL_VERSION = "20260915";
export const BV01_POSTER_VERSION = "20260916-static-lit-v2";
export const BV01_MODEL_URL = `${BV01_MODEL_PATH}?v=${BV01_MODEL_VERSION}`;
export const BV01_POSTER_URL = `${BV01_POSTER_PATH}?v=${BV01_POSTER_VERSION}`;
