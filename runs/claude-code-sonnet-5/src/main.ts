import './style.css';
import { loadConfig } from './config';
import { startApp } from './app';

/**
 * Bootstrap only - no simulation or rendering logic lives here. Reads
 * configuration (URL params / defaults), finds the full-viewport mount
 * point, and starts the autonomous demo. There is deliberately no UI wiring:
 * this file never attaches a button, slider or event listener for user
 * control - the demo is meant to run untouched for social-media recordings.
 */
const container = document.querySelector<HTMLDivElement>('#app');
if (!container) {
  throw new Error('Missing #app mount element');
}

const config = loadConfig();
startApp(container, config);
