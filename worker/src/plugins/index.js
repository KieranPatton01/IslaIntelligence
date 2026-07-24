/**
 * plugins/index.js
 * Central registry for all backend tools/plugins.
 */

import * as weather from './weather.js';
import * as calculator from './calculator.js';
import * as uv from './uv.js';

export const plugins = {
  get_weather: weather,
  calculate_expression: calculator,
  get_uv_forecast: uv
};

// Export tool schemas in the format Gemini API expects
export const toolDefinitions = Object.values(plugins).map(p => p.definition);
