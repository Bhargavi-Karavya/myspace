import { env } from './config/env.js';
import { app } from './myspace-app.js';

app.listen(env.PORT, () => {
  console.log(`MySpace API is running at http://localhost:${env.PORT}`);
});
