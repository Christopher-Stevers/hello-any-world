import { SecretsManagerClient, GetSecretValueCommand } from "@aws-sdk/client-secrets-manager";
import { Client } from "pg";

type CfnRequestType = "Create" | "Update" | "Delete";

interface CfnEvent {
  RequestType: CfnRequestType;
  ResourceProperties: {
    DbHost: string;
    DbPort: string | number;
    AdminSecretArn: string;
    ExpressSecretArn: string;
    ExpressDbName: string;
    ExpressUsername: string;
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
  expressDbName: string;
  expressUsername: string;
  expressPassword: string;
}): Promise<void> {
  const {
    host,
    port,
    adminUsername,
    adminPassword,
    expressDbName,
    expressUsername,
    expressPassword,
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
      expressUsername,
    ]);

    if (roleCheck.rowCount === 0) {
      await adminClient.query(
        `CREATE ROLE ${quoteIdent(expressUsername)} LOGIN PASSWORD ${quoteLiteral(expressPassword)}`
      );
    } else {
      await adminClient.query(
        `ALTER ROLE ${quoteIdent(expressUsername)} WITH LOGIN PASSWORD ${quoteLiteral(expressPassword)}`
      );
    }

    // 2) Create database if it doesn't exist
    const dbCheck = await adminClient.query("SELECT 1 FROM pg_database WHERE datname = $1", [
      expressDbName,
    ]);

    if (dbCheck.rowCount === 0) {
      await adminClient.query(
        `CREATE DATABASE ${quoteIdent(expressDbName)} OWNER ${quoteIdent(expressUsername)}`
      );
    }

    // 3) Ensure database-level grants
    await adminClient.query(
      `GRANT ALL PRIVILEGES ON DATABASE ${quoteIdent(expressDbName)} TO ${quoteIdent(
        expressUsername
      )}`
    );
    await adminClient.query(
      `GRANT CONNECT, TEMP ON DATABASE ${quoteIdent(expressDbName)} TO ${quoteIdent(
        expressUsername
      )}`
    );
  } finally {
    await adminClient.end();
  }

  // 4) Ensure schema-level/default privileges in express_db
  const dbClient = new Client({
    host,
    port,
    user: adminUsername,
    password: adminPassword,
    database: expressDbName,
    ssl: { rejectUnauthorized: false },
  });

  await dbClient.connect();

  try {
    await dbClient.query(
      `GRANT USAGE, CREATE ON SCHEMA public TO ${quoteIdent(expressUsername)}`
    );
    await dbClient.query(
      `ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO ${quoteIdent(
        expressUsername
      )}`
    );
    await dbClient.query(
      `ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO ${quoteIdent(
        expressUsername
      )}`
    );
    await dbClient.query(
      `ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON FUNCTIONS TO ${quoteIdent(
        expressUsername
      )}`
    );
  } finally {
    await dbClient.end();
  }
}

export const handler = async (event: CfnEvent) => {
  console.log("Express DB bootstrap event:", JSON.stringify(event));

  const props = event.ResourceProperties ?? {};
  const host = props.DbHost;
  const port = Number(props.DbPort);
  const adminSecretArn = props.AdminSecretArn;
  const expressSecretArn = props.ExpressSecretArn;
  const expressDbName = props.ExpressDbName;
  const expressUsername = props.ExpressUsername;

  if (event.RequestType === "Delete") {
    // Fresh-slate plan intentionally does not drop DB/user on delete.
    return {
      PhysicalResourceId: `ExpressDbBootstrap-${expressDbName}`,
    };
  }

  if (!host || !port || !adminSecretArn || !expressSecretArn || !expressDbName || !expressUsername) {
    throw new Error("Missing required resource properties for Express DB bootstrap");
  }

  const adminSecret = await getSecret(adminSecretArn);
  const expressSecret = await getSecret(expressSecretArn);

  const adminUsername = adminSecret.username;
  const adminPassword = adminSecret.password;
  const expressPassword = expressSecret.password;

  if (!adminUsername || !adminPassword) {
    throw new Error("Admin secret must contain username and password");
  }

  if (!expressPassword) {
    throw new Error("Express secret must contain password");
  }

  await ensureRoleAndDatabase({
    host,
    port,
    adminUsername,
    adminPassword,
    expressDbName,
    expressUsername,
    expressPassword,
  });

  return {
    PhysicalResourceId: `ExpressDbBootstrap-${expressDbName}`,
    Data: {
      ExpressDatabase: expressDbName,
      ExpressUser: expressUsername,
    },
  };
};
