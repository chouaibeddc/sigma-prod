"use strict";
// routes/serviceRoutes.ts
Object.defineProperty(exports, "__esModule", { value: true });
const serviceController = require('./service.controller');
const { Privilege_enum } = require('../../@types');
const express = require('express');
const router = express.Router();
const access = require('../../middlware/access');
// ─────────────────────────────────────────────────────────────────────────────
// SERVICE ARTICLES
// GET    /api/service/service-articles       — all active service articles
// ─────────────────────────────────────────────────────────────────────────────
router.get('/service-articles', access.accessControl(Privilege_enum.CREAT_ORDER), serviceController.getServiceArticles);
// ─────────────────────────────────────────────────────────────────────────────
// PRODUCTS
// GET    /api/service/produits               — all products
// GET    /api/service/produits?inStock=true  — only products with stock > 0
// ─────────────────────────────────────────────────────────────────────────────
router.get('/produits', access.accessControl(Privilege_enum.CREAT_ORDER), serviceController.getProducts);
// ─────────────────────────────────────────────────────────────────────────────
// SERVICES
// POST   /api/service               — create a new service order
// GET    /api/service/get/:id       — fetch a service order with all its details
// GET    /api/service              — all services (filter: ?scope=mine, ?pwd=master)
// ─────────────────────────────────────────────────────────────────────────────
router.post('/', access.accessControl(Privilege_enum.CREAT_ORDER), serviceController.createService);
router.get('/get/:id', access.accessControl(Privilege_enum.GET_SERVICES), serviceController.getServiceById);
router.get('/', access.accessControl(Privilege_enum.GET_SERVICES), serviceController.getAllServices);
// ─────────────────────────────────────────────────────────────────────────────
// CLIENTS
// GET    /api/service/clients                — all active (non-blocked) clients
// GET    /api/service/client/:id/vehicles   — vehicles belonging to a client
// ─────────────────────────────────────────────────────────────────────────────
router.get('/clients', access.accessControl(Privilege_enum.CREAT_ORDER), serviceController.getClients);
router.get('/client/:id/vehicles', access.accessControl(Privilege_enum.CREAT_ORDER), serviceController.getClientVehicles);
// ─────────────────────────────────────────────────────────────────────────────
// REDUCTIONS
// GET    /api/reductions             — all reductions with full info
// ─────────────────────────────────────────────────────────────────────────────
router.get('/reductions', access.accessControl(Privilege_enum.CREAT_ORDER), serviceController.getReductions);
// ─────────────────────────────────────────────────────────────────────────────
// Complete Service
// GET    /api/service/:id/complete           — all reductions with full info
// ─────────────────────────────────────────────────────────────────────────────
router.put('/:id/complete', access.accessControl(Privilege_enum.CREAT_ORDER), serviceController.completeService);
module.exports = router;
//# sourceMappingURL=service.routes.js.map