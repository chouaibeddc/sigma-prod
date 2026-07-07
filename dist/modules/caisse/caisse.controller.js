"use strict";
// controllers/caisse.controller.ts
Object.defineProperty(exports, "__esModule", { value: true });
const CaisseAPI = require('../../api/caisse.api');
const { verifyMetaZZ } = require('../../util/meta.zz.verify');
function parseMetaZZQuery(raw) {
    return raw === 'true' || raw === '1';
}
// =====================================================
// CONTROLLERS
// =====================================================
/**
 * GET /api/caisse
 *
 * Get current balance of the Main Caisse (HT - Hors Taxe)
 *
 * Query Parameters:
 *   - metaZZ {boolean} (optional, default: true)
 *     - true: Access regular MainCaisse
 *     - false: Access MetaZZCaisse (requires MetaZZ privilege)
 *
 * Responses:
 *   200: Success - Returns current balance
 *   401: Unauthorized - User not authenticated
 *   403: Access Denied - User lacks MetaZZ privilege for metaZZ=false
 *   404: Caisse not found
 *   500: Server error
 *
 * Example Requests:
 *   GET /api/caisse
 *   GET /api/caisse?metaZZ=true
 *   GET /api/caisse?metaZZ=false
 *
 * Example Response:
 *   {
 *     "success": true,
 *     "data": {
 *       "caisse": "MainCaisse",
 *       "balanceInCents": 1050,
 *       "balanceInDH": "10.50",
 *       "metaZZ": true
 *     }
 *   }
 */
exports.getCurrentSolde = async (req, res, next) => {
    try {
        // Extract and validate metaZZ parameter (defaults to true)
        const metaZZ = parseMetaZZQuery(req?.query?.metaZZ);
        // Get balance from the API
        const balance = await CaisseAPI.getMainCaisseBalance(verifyMetaZZ(req), metaZZ);
        // Determine which caisse name was accessed
        const caisseName = metaZZ ? 'MetaZZCaisse' : 'MainCaisse';
        // Send success response
        res.status(200).json({
            success: true,
            caisse: caisseName,
            balance: balance,
        });
    }
    catch (error) {
        // Pass error to express error handler
        next(error);
    }
};
/**
 * GET /api/caisse/tva
 *
 * Get current balance of the TVA Caisse (Taxe sur la Valeur Ajoutée)
 *
 * Query Parameters:
 *   - metaZZ {boolean} (optional, default: true)
 *     - true: Access regular TVACaisse
 *     - false: Access TVAZZCaisse (requires MetaZZ privilege)
 *
 * Responses:
 *   200: Success - Returns current TVA balance
 *   401: Unauthorized - User not authenticated
 *   403: Access Denied - User lacks MetaZZ privilege for metaZZ=false
 *   404: Caisse not found
 *   500: Server error
 *
 * Example Requests:
 *   GET /api/caisse/tva
 *   GET /api/caisse/tva?metaZZ=true
 *   GET /api/caisse/tva?metaZZ=false
 *
 * Example Response:
 *   {
 *     "success": true,
 *     "data": {
 *       "caisse": "TVACaisse",
 *       "balanceInCents": 210,
 *       "balanceInDH": "2.10",
 *       "metaZZ": true
 *     }
 *   }
 *
 * Error Response (Access Denied):
 *   {
 *     "success": false,
 *     "error": "Access denied: MetaZZ privilege is required to operate on MetaZZ caisses."
 *   }
 */
exports.getCurrentTVA = async (req, res, next) => {
    try {
        // Extract and validate metaZZ parameter (defaults to true)
        const metaZZ = parseMetaZZQuery(req?.query?.metaZZ);
        // Get TVA balance from the API
        const balance = await CaisseAPI.getTVACaisseBalance(verifyMetaZZ(req), metaZZ);
        // Determine which caisse name was accessed
        const caisseName = metaZZ ? 'TVAMetaZZCaisse' : 'TVACaisse';
        // Send success response
        res.status(200).json({
            success: true,
            caisse: caisseName,
            balance: balance,
        });
    }
    catch (error) {
        // Pass error to express error handler
        next(error);
    }
};
//# sourceMappingURL=caisse.controller.js.map