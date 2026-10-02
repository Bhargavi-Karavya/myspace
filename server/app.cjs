'use strict';

// Present for Vercel entrypoint detection. Overwritten by buildCommand with the
// bundled Express app from src/myspace-app.ts.
const express = require('express');
module.exports = express();
