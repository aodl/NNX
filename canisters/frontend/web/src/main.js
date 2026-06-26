import { bootstrap } from './app/bootstrap.js';

bootstrap().catch((error) => {
  console.error('NNX bootstrap failed', error);
});
