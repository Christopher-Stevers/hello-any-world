export const config = {
  region: process.env.CDK_DEFAULT_REGION ?? "us-east-1",
  clusterName: "my-monorepo-eks",
  ecrRepoName: "hello-express",
  namespace: "apps",
	expressDbSecretName: "express-server-db",
	pythonDbSecretName: "python-server-db",
  nextjsDbSecretName: "nextjs-server-db",
  postgres: {
    // Instance-level/admin settings (shared)
    dbName: "postgres",
    username: "postgres_admin",
    port: 5432,
    allocatedStorage: 20,
    maxAllocatedStorage: 100,
    instanceType: "t3.micro",
    multiAz: false,
    backupRetentionDays: 7,

    // Service-owned logical DB settings
    express: {
      dbName: "express_db",
      username: "express_user",
		},
		python: {
      dbName: "python_db",
      username: "python_user",
    },
    nextjs: {
      dbName: "nextjs_db",
      username: "nextjs_user",
    },
  },
  github: {
    owner: "Christopher-Stevers",
    repo: "hello-any-world",
    branch: "main",
  },
};
