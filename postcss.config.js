// Queue Quest uses plain CSS (src/styles.css). No PostCSS transforms needed.
// This local config exists solely to prevent Vite from walking up to the
// parent directory's postcss.config.js (which loads Tailwind for a
// different project). Without it, `npm run build` emits a spurious
// "Tailwind CSS content option is missing" warning.
export default {
    plugins: {},
};
