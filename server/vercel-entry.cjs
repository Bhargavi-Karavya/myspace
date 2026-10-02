'use strict';

// Thin CJS entry so Vercel loads CommonJS (not ESM src/app.ts).
require('express');
const bundled = require('./vercel-app.cjs');
module.exports = bundled.default || bundled.app;
