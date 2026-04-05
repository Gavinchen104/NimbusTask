export interface AppConfig {
  nodeEnv: string;
  awsRegion: string;
  postgresSecretArn: string | undefined;
  mongoSecretArn: string | undefined;
  mongoDbName: string;
  devLocalAuth: boolean;
  changeStreamCheckpointTable: string | undefined;
}

export function loadConfig(): AppConfig {
  return {
    nodeEnv: process.env.NODE_ENV ?? "development",
    awsRegion: process.env.AWS_REGION ?? process.env.AWS_DEFAULT_REGION ?? "us-east-1",
    postgresSecretArn: process.env.POSTGRES_SECRET_ARN,
    mongoSecretArn: process.env.MONGO_SECRET_ARN,
    mongoDbName: process.env.MONGO_DB_NAME ?? "nimbustask",
    devLocalAuth: process.env.DEV_LOCAL_AUTH === "true",
    changeStreamCheckpointTable: process.env.CHANGE_STREAM_CHECKPOINT_TABLE,
  };
}
