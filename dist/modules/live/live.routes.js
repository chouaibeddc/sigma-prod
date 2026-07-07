"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
// routes/dashboardRoutes.ts
const liveController = require('./live.controller');
const express = require('express');
const router = express.Router();
// Note: You can add your access control middleware here if needed,
// similar to how it's done in serviceRoutes.ts.
// const access = require('../../middlware/access');
// const { Privilege_enum } = require('../../@types');
// ─────────────────────────────────────────────────────────────────────────────
// DASHBOARD STATS
// GET    /api/live/dashboard/stats
// ─────────────────────────────────────────────────────────────────────────────
router.get('/stats', liveController.getDashboardStats);
// ─────────────────────────────────────────────────────────────────────────────
// RECENT SERVICES
// GET    /api/live/dashboard/recent-services
// ─────────────────────────────────────────────────────────────────────────────
router.get('/recent-services', liveController.getRecentServices);
// ─────────────────────────────────────────────────────────────────────────────
// LOW STOCK ALERTS
// GET    /api/live/dashboard/low-stock
// ─────────────────────────────────────────────────────────────────────────────
router.get('/low-stock', liveController.getLowStock);
module.exports = router;
//# sourceMappingURL=live.routes.js.map