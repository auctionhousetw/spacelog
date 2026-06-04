import "dotenv/config";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: "file:./foreclosure.db", // 👉 已將路徑精準替換為您的實體資料庫檔案
  },
});