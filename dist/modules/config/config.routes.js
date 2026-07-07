"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
// config.routes.ts
const express = require('express');
const router = express.Router();
const ctrl = require('./config.controller');
router.get('/dtom/:key', ctrl.getDatatypeMappingObject);
router.get('/', ctrl.getAll);
router.put('/:key', ctrl.updateOne);
router.patch('/bulk', ctrl.bulkUpdate);
router.post('/', ctrl.createOne);
router.delete('/:key', ctrl.deleteOne);
module.exports = router;
// Mount in app:  app.use('/config/settings', require('./config.routes'));
//# sourceMappingURL=config.routes.js.map