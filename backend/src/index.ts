import "./config/env";
import { createServer } from "http";
import app from "./server";
import { initWebsocket } from "./websocket";
import { env } from "./config/env";

const server = createServer(app);
initWebsocket(server);

server.listen(env.port, () => {
  console.log(`Backend running on port ${env.port}`);
});
