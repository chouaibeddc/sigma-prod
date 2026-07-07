"use strict";
/**
 *  Author  : EL KHYATI Bouchaib
 *  version : 1.0.0
 */
Object.defineProperty(exports, "__esModule", { value: true });
const console = require("node:console");
/* Import required depencies */
const path = require("path");
const express = require("express");
const cors = require("cors");
const cookieParser = require("cookie-parser");
const DatatypeMappingObjectAPI = require("./api/datatype.mapping.object.api");
/* Auth & Access control middlwares */
const auth = require("./middlware/auth");
/* Logging System */
const { requestContext, requestLogger, errorLogger } = require("./logger");
/* Routes */
const authRoutes = require("./modules/auth/auth.routes");
const userManagerRoutes = require("./modules/user/user.routes");
const fsRoutes = require("./modules/filesystem/fs.routes");
const entityManagerRoutes = require("./modules/entity/entity.routes");
const serviceOrderRoutes = require("./modules/service/service.routes");
const configManagerRoutes = require("./modules/config/config.routes");
const transactionRoutes = require("./modules/transaction/transaction.routes");
const caisseRoutes = require("./modules/caisse/caisse.routes");
const settingsRoutes = require("./modules/settings/settings.routes");
const factureRoutes = require("./modules/facture/facture.routes");
const curusrRoutes = require("./modules/curusr/curusr.routes"); // Adjust path
const liveRoutes = require("./modules/live/live.routes");
const dtmngrRoutes = require("./modules/datamanager/dtmngr.routes");
const authmngrRoutes = require("./modules/authmngr/authmngr.routes");
/* Init Express App */
const app = express();
const db = require("./database/connection");
db.connect();
DatatypeMappingObjectAPI.initialize();
const ORIGIN = "*";
/* --- Basic Middlewares --- */
app.use("/api/dtmngr", express.json({ limit: "500mb" }));
app.use(express.json());
app.use(cookieParser());
// app.use(
//   cors({
//     origin: function (origin: any, callback: any) {
//       // Allow requests with no origin (like mobile apps, curl, or same-origin static files)
//       if (!origin) return callback(null, true);
//       // In production, allow all origins (since frontend and backend are on the same domain)
//       // In development, only allow localhost
//       if (process.env.NODE_ENV === "production") {
//         return callback(null, true);
//       } else {
//         const allowedOrigins = [
//           "http://localhost:5173",
//           "https://localhost:1199",
//           "https://localhost:5173",
//         ];
//         if (allowedOrigins.indexOf(origin) !== -1) {
//           return callback(null, true);
//         } else {
//           return callback(new Error("Not allowed by CORS"));
//         }
//       }
//     },
//     credentials: true,
//     allowedHeaders: ["Content-Type", "Authorization"],
//   }),
// );
app.use(cors({
    origin: true, // <--- CHANGE THIS TO true (Allows all origins in production)
    credentials: true,
    allowedHeaders: ["Content-Type", "Authorization"],
}));
/* ========================================== */
/* === 2. REGISTER LOGGER MIDDLEWARES     === */
/* ========================================== */
app.use(requestContext);
app.use(requestLogger);
/* --- PUBLIC Routes --- */
app.use("/api/auth", authRoutes);
app.use("/api/config", configManagerRoutes);
/* --- Authenticated Routes --- */
app.use(auth.auth);
app.use("/api/transaction", transactionRoutes);
app.use("/api/service", serviceOrderRoutes);
app.use("/api/entity", entityManagerRoutes);
app.use("/api/admin/users", userManagerRoutes);
app.use("/api/fs", fsRoutes);
app.use("/api/caisse", caisseRoutes);
app.use("/api/settings", settingsRoutes);
app.use("/api/facture", factureRoutes);
app.use("/api/curusr", curusrRoutes);
app.use("/api/live", liveRoutes);
app.use("/api/dtmngr", dtmngrRoutes);
app.use("/api/authmngr", authmngrRoutes);
// ==========================================
// === SERVE REACT FRONTEND (PRODUCTION)  ===
// ==========================================
if (process.env.NODE_ENV === "production") {
    // __dirname is likely .../backend/dist or .../backend/src
    // ../public points to .../backend/public where we will put the React build
    const frontendDistPath = path.join(__dirname, "../public");
    // Serve the static React files
    app.use(express.static(frontendDistPath));
    // Catch-all handler: Send back React's index.html file for any unknown routes
    // This is required for React Router to work properly in production
    app.get("*", (req, res) => {
        res.sendFile(path.join(frontendDistPath, "index.html"));
    });
}
// ==========================================
app.use(errorLogger);
module.exports = app;
//# sourceMappingURL=app.js.map