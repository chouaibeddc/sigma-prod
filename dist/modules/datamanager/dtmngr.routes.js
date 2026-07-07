"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
// routes/dtmngr/dtmngr.routes.ts
//
// Mount this in your app entrypoint with:
//   app.use('/api/dtmngr', require('./routes/dtmngr/dtmngr.routes'));
//
// NOTE: add `MANAGE_DATA` to Privilege_enum in ../../@types and grant it
// only to the admin role — everything in this router can read or destroy
// the entire database.
//
// NOTE: the SGMX import body and bulk-import can be large for big datasets.
// Make sure the express.json() middleware mounted ahead of this router in
// your main app.ts/server.ts has a generous limit, e.g.:
// app.use(express.json({ limit: '500mb' })).
const dtmngrController = require('./dtmngr.controller');
const { Privilege_enum } = require('../../@types');
const express = require('express');
const router = express.Router();
const access = require('../../middlware/access');
// ─────────────────────────────────────────────────────────────────────────────
// OVERVIEW
// GET /api/dtmngr/overview   — dashboard stats (counts, DB size, alerts)
// GET /api/dtmngr/entities   — manageable-entity field metadata (CSV builder)
// ─────────────────────────────────────────────────────────────────────────────
router.get('/overview', access.accessControl(Privilege_enum.SUPER), dtmngrController.getOverview);
router.get('/entities', access.accessControl(Privilege_enum.SUPER), dtmngrController.getManageableEntities);
// ─────────────────────────────────────────────────────────────────────────────
// BULK CSV IMPORT — goes through EntityAPI only, 8 entities only.
// POST /api/dtmngr/bulk-import   body: { rows: [...] }
// ─────────────────────────────────────────────────────────────────────────────
router.post('/bulk-import', express.json({ limit: '500mb' }), // Route-specific limit override
access.accessControl(Privilege_enum.SUPER), dtmngrController.bulkImport);
// ─────────────────────────────────────────────────────────────────────────────
// SGMX — full system state, direct dbClient access.
// GET  /api/dtmngr/sgmx/export
// POST /api/dtmngr/sgmx/import   body: parsed .sgmx file
// ─────────────────────────────────────────────────────────────────────────────
router.get('/sgmx/export', access.accessControl(Privilege_enum.SUPER), dtmngrController.exportSgmx);
router.post('/sgmx/import', access.accessControl(Privilege_enum.SUPER), dtmngrController.importSgmx);
// ─────────────────────────────────────────────────────────────────────────────
// DANGER ZONE
// POST /api/dtmngr/reset      body: { confirm: true, includeUsers?: boolean }
// POST /api/dtmngr/recreate   body: { confirm: "RECREATE" }
// ─────────────────────────────────────────────────────────────────────────────
router.post('/reset', access.accessControl(Privilege_enum.SUPER), dtmngrController.resetData);
router.post('/recreate', access.accessControl(Privilege_enum.SUPER), dtmngrController.recreateDatabase);
module.exports = router;
//# sourceMappingURL=dtmngr.routes.js.map