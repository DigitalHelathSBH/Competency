import sql from "mssql";

let poolPromise: Promise<sql.ConnectionPool> | null = null;

function readBool(value: string | undefined, defaultValue: boolean) {
  if (value === undefined) return defaultValue;
  return ["1", "true", "yes", "y"].includes(value.toLowerCase());
}

export function getSsbDatabaseName() {
  return process.env.SSB_DATABASE || "SSBDatabase";
}

export function quoteSqlName(name: string) {
  return `[${name.replace(/]/g, "]]" )}]`;
}

export function getDbPool() {
  if (!poolPromise) {
    const server = process.env.DB_SERVER;
    const database = process.env.DB_DATABASE || "Saraburi";
    const user = process.env.DB_USER;
    const password = process.env.DB_PASSWORD;
    const port = Number(process.env.DB_PORT || 1433);

    if (!server || !user || !password) {
      throw new Error("Missing DB_SERVER, DB_USER, or DB_PASSWORD in .env.local");
    }

    poolPromise = new sql.ConnectionPool({
      server,
      database,
      user,
      password,
      port,
      options: {
        encrypt: readBool(process.env.DB_ENCRYPT, false),
        trustServerCertificate: readBool(process.env.DB_TRUST_SERVER_CERTIFICATE, true),
        enableArithAbort: true,
      },
      pool: {
        max: Number(process.env.DB_POOL_MAX || 10),
        min: 0,
        idleTimeoutMillis: 30000,
      },
      requestTimeout: Number(process.env.DB_REQUEST_TIMEOUT || 30000),
    }).connect();
  }

  return poolPromise;
}

export { sql };
