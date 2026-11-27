import { defineConfig } from "@neon/config/v1";

// PostgreSQL only. Keep the existing Node/Vercel backend and pg driver.
// No auth, Data API, serverless functions or automatic branch expiry are added.
export default defineConfig({ auth: false });
