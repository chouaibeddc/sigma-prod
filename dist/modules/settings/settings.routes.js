"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express = require('express');
const router = express.Router();
const settingsController = require('./settings.controller');
router.get('/dtom/:key', settingsController.getDatatypeMappingObject);
router.get('/', settingsController.getSettings);
router.post('/bulk', settingsController.getBulkSettings);
router.get('/:key', settingsController.getSettingsByKey);
router.put('/', settingsController.updateSettings);
module.exports = router;
//# sourceMappingURL=settings.routes.js.map