export const config = {
  region: process.env.CDK_DEFAULT_REGION ?? "us-east-1",
  clusterName: "my-monorepo-eks",
  ecrRepoName: "hello-express",
  namespace: "apps",
  databaseSecretName: "express-server-db",
  postgres: {
    dbName: "express_server",
    username: "express_admin",
    port: 5432,
    allocatedStorage: 20,
    maxAllocatedStorage: 100,
    instanceType: "t3.micro",
    multiAz: false,
    backupRetentionDays: 7
  },
  github: {
    owner: "Christopher-Stevers",
    repo: "hello-any-world",
    branch: "main"
  }
};
