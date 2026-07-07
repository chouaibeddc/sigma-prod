"use strict";
// routes/caisse.routes.ts
Object.defineProperty(exports, "__esModule", { value: true });
const express = require('express');
const router = express.Router();
const { Privilege_enum } = require('../../@types');
const access = require('../../middlware/access');
/* Controllers */
const caisseController = require('./caisse.controller');
/* Routes */
/**
 * GET /api/caisse
 *
 * Retrieves the current balance of the Main Caisse (HT - Hors Taxe)
 *
 * Query Parameters:
 *   - metaZZ (optional, default: true) - Determines which caisse to access:
 *     * true: Regular MainCaisse (standard operations)
 *     * false: MetaZZCaisse (requires special MetaZZ privileges)
 *
 * @returns {Object} Response containing the current balance in both cents and DH
 *
 * @example
 * // Get regular MainCaisse balance
 * GET /api/caisse
 *
 * @example
 * // Get MetaZZ-scoped MainCaisse balance (requires privileges)
 * GET /api/caisse?metaZZ=false
 */
router.get('/', access.accessControl(Privilege_enum.GET_CAISSE), caisseController.getCurrentSolde);
/**
 * GET /api/caisse/tva
 *
 * Retrieves the current balance of the TVA Caisse (Taxe sur la Valeur Ajoutée)
 *
 * Query Parameters:
 *   - metaZZ (optional, default: true) - Determines which caisse to access:
 *     * true: Regular TVACaisse (standard operations)
 *     * false: TVAZZCaisse (requires special MetaZZ privileges)
 *
 * @returns {Object} Response containing the current TVA balance in both cents and DH
 *
 * @example
 * // Get regular TVACaisse balance
 * GET /api/caisse/tva
 *
 * @example
 * // Get MetaZZ-scoped TVA balance (requires privileges)
 * GET /api/caisse/tva?metaZZ=false
 */
router.get('/tva', access.accessControl(Privilege_enum.GET_CAISSE), caisseController.getCurrentTVA);
module.exports = router;
//# sourceMappingURL=caisse.routes.js.map