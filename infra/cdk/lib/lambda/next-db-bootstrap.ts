import { SecretsManagerClient, GetSecretValueCommand } from "@aws-sdk/client-secrets-manager";
import { Client } from "pg";

type CfnRequestType = "Create" | "Update" | "Delete";

interface CfnEvent {
  RequestType: CfnRequestType;
  ResourceProperties: {
    DbHost: string;
    DbPort: string | number;
    AdminSecretArn: string;
    NextjsSecretArn: string;
    NextjsDbName: string;
    NextjsUsername: string;
  };
}

interface SecretShape {
  username?: string;
  password?: string;
}

const secrets = new SecretsManagerClient({});

function quoteIdent(value: string): string {
  return `"${value.replace(/"/g, "\"\"")}"`;
}

function quoteLiteral(value: string): string {
  if (value.includes("\u0000")) {
    throw new Error("SQL string literals cannot contain null bytes");
  }
  return `'${value.replace(/'/g, "''")}'`;
}

async function getSecret(secretArn: string): Promise<SecretShape> {
  const out = await secrets.send(new GetSecretValueCommand({ SecretId: secretArn }));
  if (!out.SecretString) {
    throw new Error(`Secret ${secretArn} has no SecretString`);
  }

  try {
    return JSON.parse(out.SecretString) as SecretShape;
  } catch (err) {
    throw new Error(`Failed to parse secret ${secretArn}: ${(err as Error).message}`);
  }
}

async function ensureRoleAndDatabase(params: {
  host: string;
  port: number;
  adminUsername: string;
  adminPassword: string;
  nextjsDbName: string;
  nextjsUsername: string;
  nextjsPassword: string;
}): Promise<void> {
  const {
    host,
    port,
    adminUsername,
    adminPassword,
    nextjsDbName,
    nextjsUsername,
    nextjsPassword,
  } = params;

  const adminClient = new Client({
    host,
    port,
    user: adminUsername,
    password: adminPassword,
    database: "postgres",
    ssl: { rejectUnauthorized: false },
  });

  await adminClient.connect();

  try {
    // 1) Create or update role
    const roleCheck = await adminClient.query("SELECT 1 FROM pg_roles WHERE rolname = $1", [
      nextjsUsername,
    ]);

    if (roleCheck.rowCount === 0) {
      await adminClient.query(
        `CREATE ROLE ${quoteIdent(nextjsUsername)} LOGIN PASSWORD ${quoteLiteral(nextjsPassword)}`
      );
    } else {
      await adminClient.query(
        `ALTER ROLE ${quoteIdent(nextjsUsername)} WITH LOGIN PASSWORD ${quoteLiteral(nextjsPassword)}`
      );
    }

    // 2) Create database if it doesn't exist
    const dbCheck = await adminClient.query("SELECT 1 FROM pg_database WHERE datname = $1", [
      nextjsDbName,
    ]);

    if (dbCheck.rowCount === 0) {
      await adminClient.query(
        `CREATE DATABASE ${quoteIdent(nextjsDbName)} OWNER ${quoteIdent(nextjsUsername)}`
      );
    }

    // 3) Ensure database-level grants
    await adminClient.query(
      `GRANT ALL PRIVILEGES ON DATABASE ${quoteIdent(nextjsDbName)} TO ${quoteIdent(
        nextjsUsername
      )}`
    );
    await adminClient.query(
      `GRANT CONNECT, TEMP ON DATABASE ${quoteIdent(nextjsDbName)} TO ${quoteIdent(
        nextjsUsername
      )}`
    );
  } finally {
    await adminClient.end();
  }

  // 4) Ensure schema-level/default privileges in nextjs_db
  const dbClient = new Client({
    host,
    port,
    user: adminUsername,
    password: adminPassword,
    database: nextjsDbName,
    ssl: { rejectUnauthorized: false },
  });

  await dbClient.connect();

  try {
    await dbClient.query(
      `GRANT USAGE, CREATE ON SCHEMA public TO ${quoteIdent(nextjsUsername)}`
    );
    await dbClient.query(
      `ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO ${quoteIdent(
        nextjsUsername
      )}`
    );
    await dbClient.query(
      `ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO ${quoteIdent(
        nextjsUsername
      )}`
    );
    await dbClient.query(
      `ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON FUNCTIONS TO ${quoteIdent(
        nextjsUsername
      )}`
    );
  } finally {
    await dbClient.end();
  }
}

export const handler = async (event: CfnEvent) => {
  console.log("Nextjs DB bootstrap event:", JSON.stringify(event));

  const props = event.ResourceProperties ?? {};
  const host = props.DbHost;
  const port = Number(props.DbPort);
  const adminSecretArn = props.AdminSecretArn;
  const nextjsSecretArn = props.NextjsSecretArn;
  const nextjsDbName = props.NextjsDbName;
  const nextjsUsername = props.NextjsUsername;

  if (event.RequestType === "Delete") {
    // Fresh-slate plan intentionally does not drop DB/user on delete.
    return {
      PhysicalResourceId: `NextjsDbBootstrap-${nextjsDbName}`,
    };
  }

  if (!host || !port || !adminSecretArn || !nextjsSecretArn || !nextjsDbName || !nextjsUsername) {
    throw new Error("Missing required resource properties for Nextjs DB bootstrap");
  }

  const adminSecret = await getSecret(adminSecretArn);
  const nextjsSecret = await getSecret(nextjsSecretArn);

  const adminUsername = adminSecret.username;
  const adminPassword = adminSecret.password;
  const nextjsPassword = nextjsSecret.password;

  if (!adminUsername || !adminPassword) {
    throw new Error("Admin secret must contain username and password");
  }

  if (!nextjsPassword) {
    throw new Error("Nextjs secret must contain password");
  }

  await ensureRoleAndDatabase({
    host,
    port,
    adminUsername,
    adminPassword,
    nextjsDbName,
    nextjsUsername,
    nextjsPassword,
  });

  return {
    PhysicalResourceId: `NextjsDbBootstrap-${nextjsDbName}`,
    Data: {
      NextjsDatabase: nextjsDbName,
      NextjsUser: nextjsUsername,
    },
  };
};
