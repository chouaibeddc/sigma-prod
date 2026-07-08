"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv").config();
const http = require("http");
const https = require("https");
const fs = require("fs");
const app = require("./app");
const PORT = process.env.PORT || 3000;
if (process.env.NODE_ENV === "production") {
    // ==========================================
    // === RENDER / CLOUD DEPLOYMENT          ===
    // ==========================================
    // Render handles HTTPS. We run a standard HTTP server.
    // We bind to '0.0.0.0' so Render can route external traffic to it.
    const server = http.createServer(app);
    server.listen(PORT, "0.0.0.0", () => {
        console.log(`[Production] HTTP Server running on port ${PORT}`);
    });
}
else {
    // ==========================================
    // === LOCAL DEVELOPMENT                  ===
    // ==========================================
    const SSL_KEY_PATH = process.env.SSL_KEY_PATH || "./cert/key.pem";
    const SSL_CERT_PATH = process.env.SSL_CERT_PATH || "./cert/cert.pem";
    const options = {
        key: fs.readFileSync(SSL_KEY_PATH),
        cert: fs.readFileSync(SSL_CERT_PATH),
    };
    const HOST = process.env.HOST || "127.0.0.1";
    const server = https.createServer(options, app);
    server.listen(PORT, HOST, () => {
        console.log(`[Local] HTTPS Server running at https://${HOST}:${PORT}`);
    });
}
//# sourceMappingURL=server.js.map