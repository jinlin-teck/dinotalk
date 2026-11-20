const drizzleConfig = {
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "sqlite",
  dbCredentials: {
    url: "./data/kids.db",
  },
};

export default drizzleConfig;

