"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express = require('express');
const router = express.Router();
const { Privilege_enum } = require('../../@types');
const access = require('../../middlware/access');
/* Controllers */
const entityManagerController = require('./entity.controller');
/* Routes */
router.get('/config/', access.accessEntityControl, entityManagerController.getEntityConfig);
router.get('/', access.accessEntityControl, entityManagerController.getAll);
router.get('/:id', access.accessEntityControl, entityManagerController.getById);
router.post('/', access.accessEntityControl, entityManagerController.create);
router.patch('/:id', access.accessEntityControl, entityManagerController.update);
// router.delete(
//     '/:id',
//     access.accessEntityControl,
//     entityManagerController.remove,
// );
module.exports = router;
//# sourceMappingURL=entity.routes.js.map