"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const console = require("node:console");
// api/caisse.api.ts
const dbClient = require('../database/connection').dbClient;
// =====================================================
// META ZZ GUARD
// Stub — replace with real privilege check.
// Returns true  → access granted (user has MetaZZ privilege)
// Returns false → access denied
// =====================================================
// =====================================================
// HELPERS
// =====================================================
/**
 * Resolves the canonical CaisseName for the *main* caisse
 * (holds HT amounts) based on the MetaZZ scope flag.
 */
function mainCaisseName(metaZZ) {
    return metaZZ ? 'MetaZZCaisse' : 'MainCaisse';
}
/**
 * Resolves the canonical CaisseName for the *TVA* caisse
 * based on the MetaZZ scope flag.
 */
function tvaCaisseName(metaZZ) {
    return metaZZ ? 'TVAMetaZZCaisse' : 'TVACaisse';
}
/**
 * Throws if the caller does not have MetaZZ privilege and is
 * attempting to operate on a MetaZZ-scoped caisse (metaZZ = false).
 *
 * Rule:
 *   metaZZ = true  → regular caisse → no privilege check needed
 *   metaZZ = false → MetaZZ caisse  → verifyMetaZZ(req) must return true
 */
function guardMetaZZ(metaZZ, metaZZverification) {
    if (metaZZ) {
        if (!metaZZverification) {
            throw new Error('Access denied: MetaZZ privilege is required to operate on MetaZZ caisses.');
        }
    }
}
/**
 * Fetches a single Caisse row by name.
 * Throws if the caisse does not exist.
 */
async function fetchCaisseByName(name, client) {
    const result = await dbClient.query(`SELECT * FROM Caisse WHERE CaisseName = $1`, [name]);
    if (result.rows.length === 0) {
        throw new Error(`Caisse "${name}" not found.`);
    }
    return result.rows[0];
}
// =====================================================
// CAISSE API
// =====================================================
class CaisseAPI {
    // =================================================
    // ─────────────── MAIN CAISSE ────────────────────
    // =================================================
    /**
     * Returns the current balance (in cents) of the Main caisse
     * for the given MetaZZ scope.
     */
    static async getMainCaisseBalance(metaZZverification, metaZZ) {
        guardMetaZZ(metaZZ, metaZZverification);
        const name = mainCaisseName(metaZZ);
        console.log(name);
        const row = await fetchCaisseByName(name);
        console.log(row);
        // DB stores the amount; we return it as-is (cents).
        return row.caissemountant;
    }
    /**
     * Adds `amountCents` (positive integer, in cents) to the Main caisse.
     */
    static async addToMainCaisse(metaZZverification, amountCents, metaZZ, editedByUserId = null) {
        guardMetaZZ(metaZZ, metaZZverification);
        if (amountCents <= 0)
            throw new Error('amountCents must be a positive integer.');
        const name = mainCaisseName(metaZZ);
        return _adjustCaisse(name, amountCents, editedByUserId);
    }
    /**
     * Subtracts `amountCents` (positive integer, in cents) from the Main caisse.
     */
    static async subtractFromMainCaisse(metaZZverification, amountCents, metaZZ, editedByUserId = null) {
        guardMetaZZ(metaZZ, metaZZverification);
        if (amountCents <= 0)
            throw new Error('amountCents must be a positive integer.');
        const name = mainCaisseName(metaZZ);
        return _adjustCaisse(name, -amountCents, editedByUserId);
    }
    /**
     * Sets the Main caisse balance to an exact value (in cents).
     * Useful for manual corrections / reconciliation.
     */
    static async setMainCaisseBalance(metaZZverification, amountCents, metaZZ, editedByUserId = null) {
        guardMetaZZ(metaZZ, metaZZverification);
        const name = mainCaisseName(metaZZ);
        return _setCaisse(name, amountCents, editedByUserId);
    }
    // =================================================
    // ─────────────── TVA CAISSE ─────────────────────
    // =================================================
    /**
     * Returns the current balance (in cents) of the TVA caisse
     * for the given MetaZZ scope.
     */
    static async getTVACaisseBalance(metaZZverification, metaZZ) {
        guardMetaZZ(metaZZ, metaZZverification);
        const name = tvaCaisseName(metaZZ);
        const row = await fetchCaisseByName(name);
        return row.caissemountant;
    }
    /**
     * Adds `amountCents` (positive integer, in cents) to the TVA caisse.
     */
    static async addToTVACaisse(metaZZverification, amountCents, metaZZ, editedByUserId = null) {
        guardMetaZZ(metaZZ, metaZZverification);
        if (amountCents <= 0)
            throw new Error('amountCents must be a positive integer.');
        const name = tvaCaisseName(metaZZ);
        return _adjustCaisse(name, amountCents, editedByUserId);
    }
    /**
     * Subtracts `amountCents` (positive integer, in cents) from the TVA caisse.
     */
    static async subtractFromTVACaisse(metaZZverification, amountCents, metaZZ, editedByUserId = null) {
        guardMetaZZ(metaZZ, metaZZverification);
        if (amountCents <= 0)
            throw new Error('amountCents must be a positive integer.');
        const name = tvaCaisseName(metaZZ);
        return _adjustCaisse(name, -amountCents, editedByUserId);
    }
    /**
     * Sets the TVA caisse balance to an exact value (in cents).
     */
    static async setTVACaisseBalance(metaZZverification, amountCents, metaZZ, editedByUserId = null) {
        guardMetaZZ(metaZZ, metaZZverification);
        const name = tvaCaisseName(metaZZ);
        return _setCaisse(name, amountCents, editedByUserId);
    }
    // =================================================
    // ─────────────── GLOBAL (both) ──────────────────
    // =================================================
    /**
     * Returns { main, tva, total } in cents for the given MetaZZ scope.
     * Convenient single-call summary used by dashboards / reports.
     */
    static async getGlobalSolde(metaZZverification, metaZZ) {
        guardMetaZZ(metaZZ, metaZZverification);
        const [mainRow, tvaRow] = await Promise.all([
            fetchCaisseByName(mainCaisseName(metaZZ)),
            fetchCaisseByName(tvaCaisseName(metaZZ)),
        ]);
        const main = mainRow.caissemountant;
        const tva = tvaRow.caissemountant;
        return { main, tva, total: main + tva };
    }
}
// =====================================================
// PRIVATE HELPERS  (module-scoped, not exported)
// =====================================================
/**
 * Applies a signed delta (in cents) to the named caisse and returns
 * the new balance.  Uses a dedicated pool client so the UPDATE is
 * atomic and the returned balance is always consistent.
 */
async function _adjustCaisse(name, deltaCents, editedByUserId) {
    try {
        await dbClient.query('BEGIN');
        const result = await dbClient.query(`
            UPDATE Caisse
            SET
                CaisseMountant         = CaisseMountant + $1,
                CaisseLastEditByUserId = $2,
                CaisseLastEditAt       = NOW()
            WHERE CaisseName = $3
            RETURNING CaisseMountant
            `, [deltaCents, editedByUserId, name]);
        if ((result.rowCount ?? 0) === 0) {
            throw new Error(`Caisse "${name}" not found. Operation aborted.`);
        }
        await dbClient.query('COMMIT');
        return result.rows[0].caissemountant;
    }
    catch (err) {
        await dbClient.query('ROLLBACK');
        throw err;
    }
}
/**
 * Overwrites the balance of the named caisse with an exact value (in cents)
 * and returns the new balance.
 */
async function _setCaisse(name, amountCents, editedByUserId) {
    try {
        await dbClient.query('BEGIN');
        const result = await dbClient.query(`
            UPDATE Caisse
            SET
                CaisseMountant         = $1,
                CaisseLastEditByUserId = $2,
                CaisseLastEditAt       = NOW()
            WHERE CaisseName = $3
            RETURNING CaisseMountant
            `, [amountCents, editedByUserId, name]);
        if ((result.rowCount ?? 0) === 0) {
            throw new Error(`Caisse "${name}" not found. Operation aborted.`);
        }
        await dbClient.query('COMMIT');
        return result.rows[0].caissemountant;
    }
    catch (err) {
        await dbClient.query('ROLLBACK');
        throw err;
    }
}
module.exports = CaisseAPI;
//# sourceMappingURL=caisse.api.js.map