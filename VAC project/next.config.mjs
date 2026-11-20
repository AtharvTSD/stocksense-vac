import { PHASE_DEVELOPMENT_SERVER } from 'next/constants.js';
// Keep a running local dev preview intact while production verification builds run.
export default function config(phase) { return { distDir: phase === PHASE_DEVELOPMENT_SERVER ? '.next-dev' : '.next' }; }
