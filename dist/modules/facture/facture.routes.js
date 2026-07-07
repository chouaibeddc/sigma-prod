"use strict";
// routes/factureRoutes.ts
Object.defineProperty(exports, "__esModule", { value: true });
const factureController = require('./facture.controller');
const { Privilege_enum } = require('../../@types');
const express = require('express');
const router = express.Router();
const access = require('../../middlware/access'); // Adjust path if your middleware folder is named differently
// ─────────────────────────────────────────────────────────────────────────────
// FACTURE AMOUNTS
// GET /api/facture/:id/amounts
// Calculates Total HT, TVA, and TTC for a given facture.
// ─────────────────────────────────────────────────────────────────────────────
router.get('/:id/amounts', access.accessControl(Privilege_enum.GET_SERVICES), factureController.getFactureAmounts);
// ─────────────────────────────────────────────────────────────────────────────
// FACTURE PAYMENTS
// GET /api/facture/:id/payments?details=true
// Calculates amount paid and lists transactions.
// ─────────────────────────────────────────────────────────────────────────────
router.get('/:id/payments', access.accessControl(Privilege_enum.GET_SERVICES), factureController.getFacturePayments);
module.exports = router;
//# sourceMappingURL=facture.routes.js.map