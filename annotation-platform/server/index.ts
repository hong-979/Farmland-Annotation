import { createApp } from './app.js';
import { loadServerConfig } from './config.js';

const serverConfig = loadServerConfig();
const app = createApp();

app.listen(serverConfig.port, serverConfig.host, () => {
  console.log(`Annotation server listening on http://${serverConfig.host}:${serverConfig.port}`);
});
