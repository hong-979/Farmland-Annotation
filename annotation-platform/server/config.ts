export type ServerConfig = {
  host: string;
  port: number;
};

const DEFAULT_HOST = '127.0.0.1';
const DEFAULT_PORT = 3001;

function parsePort(portValue: string | undefined) {
  if (!portValue) {
    return DEFAULT_PORT;
  }

  const parsedPort = Number.parseInt(portValue, 10);

  if (!Number.isInteger(parsedPort) || parsedPort <= 0) {
    throw new Error(`Invalid server port: ${portValue}`);
  }

  return parsedPort;
}

export function loadServerConfig(environment: NodeJS.ProcessEnv = process.env): ServerConfig {
  return {
    host: environment.ANNOTATION_SERVER_HOST ?? DEFAULT_HOST,
    port: parsePort(environment.ANNOTATION_SERVER_PORT),
  };
}
