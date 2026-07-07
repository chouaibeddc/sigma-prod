"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
// routes/auth.routes.ts
const authmngrController = require('./authmngr.controller');
const { Privilege_enum } = require('../../@types');
const express = require('express');
const router = express.Router();
const access = require('../../middlware/access');
// GET /api/auth/events
router.get('/events', access.accessControl(Privilege_enum.SUPER), authmngrController.getAuthEvents);
// GET /api/auth/sessions
router.get('/sessions', access.accessControl(Privilege_enum.SUPER), authmngrController.getActiveSessions);
// DELETE /api/auth/sessions/user/:userId
router.delete('/sessions/user/:userId', access.accessControl(Privilege_enum.SUPER), authmngrController.revokeUserSessions);
// DELETE /api/auth/sessions/:sessionId
router.delete('/sessions/:sessionId', access.accessControl(Privilege_enum.SUPER), authmngrController.revokeSpecificSession);
module.exports = router;
//# sourceMappingURL=authmngr.routes.js.map