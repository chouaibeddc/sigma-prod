"use strict";
// routes/transaction.router.ts
Object.defineProperty(exports, "__esModule", { value: true });
const transactionController = require('./transaction.controller');
const { Privilege_enum } = require('../../@types');
const express = require('express');
const router = express.Router();
const access = require('../../middlware/access');
// ---------------------------------------------------------------------------
// Specific sub-routes must come BEFORE the /:id param route,
// otherwise Express will try to match "range" or "day" as an ID.
// ---------------------------------------------------------------------------
// GET /api/transaction/range?start=&end=
router.get('/range', access.accessControl(Privilege_enum.GET_TRANSACTION), transactionController.getTransactionsBetweenDates);
// GET /api/transaction/day?date=
router.get('/day', access.accessControl(Privilege_enum.GET_TRANSACTION), transactionController.getTransactionsByDay);
// GET /api/transaction/participants
router.get('/participants', access.accessControl(Privilege_enum.CREAT_TRANSACTION), transactionController.getParticipants);
// ---------------------------------------------------------------------------
// CRUD
// ---------------------------------------------------------------------------
// GET    /api/transaction
router.get('/', access.accessControl(Privilege_enum.GET_TRANSACTION), transactionController.getAllTransactions);
// POST   /api/transaction
router.post('/', access.accessControl(Privilege_enum.CREAT_TRANSACTION), transactionController.createTransaction);
// GET    /api/transaction/:id
router.get('/:id', access.accessControl(Privilege_enum.GET_TRANSACTION), transactionController.getTransactionById);
// ---------------------------------------------------------------------------
// Facture link management
// ---------------------------------------------------------------------------
// POST   /api/transaction/:id/facture          { factureId }
router.post('/:id/facture', access.accessControl(Privilege_enum.CREAT_TRANSACTION), transactionController.linkToFacture);
// DELETE /api/transaction/:id/facture/:factureId
router.delete('/:id/facture/:factureId', access.accessControl(Privilege_enum.GET_TRANSACTION), transactionController.unlinkFromFacture);
module.exports = router;
//# sourceMappingURL=transaction.routes.js.map