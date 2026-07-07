"use strict";
// api/facture.api.ts
//
// Physical-separation architecture:
//   Standard pipeline → Facture       + estPayerPar
//   MetaZZ   pipeline → FactureMetaZZ + estPayerParMetaZZ
//
// Pipeline resolution for CREATE:
//   • Inspect the linked Service's ID ('SRVN…' → MetaZZ pipeline).
//   • If no service is linked, Standard pipeline is the default.
//
// Pipeline resolution for READ / UPDATE / DELETE:
//   • Inferred from the FactureID itself ('FACN…' → MetaZZ pipeline).
//   • For getAll/search/status/dates: accept an explicit `metaZZ` boolean.
//
// Both Facture and FactureMetaZZ share identical columns, so the allowlist
// and all SQL projections apply to either table unchanged.
//
// ── PRICE-LOCKING LOGIC ───────────────────────────────────────────────────
// FactureTVARate and FactureReductionPourcentage are SNAPSHOTS taken at
// creation time so a facture's totals never change retroactively if the
// global TVA rate changes or the linked Reduction's percentage is edited
// later. createFacture() resolves and stores both; nothing downstream
// should re-derive them from the live Reduction row or a TVA constant.
Object.defineProperty(exports, "__esModule", { value: true });
const { dbClient } = require('../database/connection');
// Default TVA rate applied to a facture when none is explicitly provided.
// Mirrors the FactureTVARate column's DB default (see sqlProcessedVersion15.sql).
const DEFAULT_TVA_RATE = 20;
// ── Pipeline helpers ─────────────────────────────────────────────────────────
/**
 * Returns 'FactureMetaZZ' or 'Facture' based on the pipeline flag.
 */
function factureTable(isMetaZZ) {
    return isMetaZZ ? 'FactureMetaZZ' : 'Facture';
}
/**
 * Returns the junction table that links a Facture to its Transactions.
 */
function junctionTable(isMetaZZ) {
    return isMetaZZ ? 'estPayerParMetaZZ' : 'estPayerPar';
}
/**
 * Returns the Transaction table for the given pipeline.
 */
function transactionTable(isMetaZZ) {
    return isMetaZZ ? 'TransactionMetaZZ' : 'Transaction_';
}
/**
 * Infers the pipeline from a FactureID string.
 * "FACN0000000001" → the 4th character is 'N' → MetaZZ pipeline.
 */
function isMetaZZFromFactureId(factureId) {
    return factureId.charAt(3) === 'N';
}
/**
 * Infers the pipeline from a ServiceID string.
 * "SRVN0000000001" → the 4th character is 'N' → MetaZZ pipeline.
 */
function isMetaZZFromServiceId(serviceId) {
    return serviceId.charAt(3) === 'N';
}
// ── Allowlist ────────────────────────────────────────────────────────────────
// Column names are identical on both Facture and FactureMetaZZ.
const FACTURE_ALLOWED_COLUMNS = new Set([
    'FactureID',
    'FactureDate',
    'FactureStatus',
    'FactureNotes',
    'FactureCreatedAt',
    'FactureCreatedByUserID',
    'FactureReductionID',
    // NOTE: these two are price-locking SNAPSHOTS. They're allowlisted here so
    // getFacturesWhere() can filter by them, but updateFacture() should not be
    // used to edit them after creation — that would defeat the whole point of
    // locking a facture's totals. createFacture() is the only place that
    // should ever write to them.
    'FactureTVARate',
    'FactureReductionPourcentage',
]);
function assertAllowedColumns(keys) {
    for (const key of keys) {
        if (!FACTURE_ALLOWED_COLUMNS.has(key)) {
            throw new Error(`Column "${key}" is not allowed in a dynamic query.`);
        }
    }
}
// ── FactureAPI ───────────────────────────────────────────────────────────────
class FactureAPI {
    // =====================================================
    // CREATE FACTURE
    //
    // Pipeline is derived from the serviceId (if provided):
    //   • serviceId contains 'N' at index 3 → MetaZZ pipeline
    //   • serviceId is standard / absent    → Standard pipeline (default)
    //
    // If MetaZZ pipeline is required, verifyMetaZZ(req) is enforced.
    // =====================================================
    static async createFacture(metaZZverification, data) {
        const { facturedate = null, facturestatus = 'PENDING', facturenotes = null, facturereductionid = null, createdByUserId = null, serviceId = null, } = data;
        // ── Determine pipeline from serviceId ──────────────────────────────
        const isMetaZZ = serviceId ? isMetaZZFromServiceId(serviceId) : false;
        if (isMetaZZ && !metaZZverification) {
            throw new Error('Access denied: MetaZZ privilege is required to create a MetaZZ facture.');
        }
        const table = factureTable(isMetaZZ);
        // ── Snapshot the TVA rate NOW ────────────────────────────────────────
        // If the caller supplies one, use it; otherwise fall back to the
        // system default. Once stored, this value is locked to the facture.
        const factureTvaRate = data.facturetvarate !== undefined && data.facturetvarate !== null
            ? parseFloat(String(data.facturetvarate)) || DEFAULT_TVA_RATE
            : DEFAULT_TVA_RATE;
        // ── Snapshot the reduction percentage NOW ────────────────────────────
        // Copy the Reduction's CURRENT percentage onto the facture so that
        // editing the Reduction later never changes this facture's totals.
        let factureReductionPourcentage = 0;
        if (facturereductionid) {
            const reductionRes = await dbClient.query(`SELECT ReductionPourcentage FROM Reduction WHERE ReductionID = $1`, [facturereductionid]);
            if (reductionRes.rowCount === 0) {
                throw new Error(`Reduction "${facturereductionid}" not found.`);
            }
            factureReductionPourcentage =
                parseFloat(reductionRes.rows[0].reductionpourcentage) || 0;
        }
        const result = await dbClient.query(`
            INSERT INTO ${table} (
                FactureDate,
                FactureStatus,
                FactureNotes,
                FactureTVARate,
                FactureReductionPourcentage,
                FactureCreatedAt,
                FactureCreatedByUserID,
                FactureReductionID
            )
            VALUES (
                COALESCE($1, NOW()),
                $2, $3, $4, $5,
                NOW(),
                $6, $7
            )
            RETURNING *
            `, [
            facturedate,
            facturestatus,
            facturenotes,
            factureTvaRate,
            factureReductionPourcentage,
            createdByUserId,
            facturereductionid,
        ]);
        return {
            ...result.rows[0],
            pipeline: isMetaZZ ? 'metaZZ' : 'standard',
        };
    }
    // =====================================================
    // GET ALL FACTURES
    //
    // metaZZ = false → Standard pipeline (Facture)
    // metaZZ = true  → MetaZZ   pipeline (FactureMetaZZ)
    // =====================================================
    static async getAllFactures(metaZZverification, metaZZ = false) {
        if (metaZZ && !metaZZverification) {
            throw new Error('Access denied: MetaZZ privilege is required.');
        }
        const table = factureTable(metaZZ);
        const result = await dbClient.query(`
            SELECT *
            FROM   ${table}
            ORDER  BY FactureCreatedAt DESC
            `);
        return result.rows;
    }
    // =====================================================
    // GET FACTURE BY ID
    //
    // Pipeline is auto-derived from the FactureID ('FACN…' → MetaZZ).
    // =====================================================
    static async getFactureById(metaZZverification, factureId) {
        const isMetaZZ = isMetaZZFromFactureId(factureId);
        if (isMetaZZ && !metaZZverification) {
            throw new Error('Access denied: MetaZZ privilege is required.');
        }
        const table = factureTable(isMetaZZ);
        const result = await dbClient.query(`
            SELECT *
            FROM   ${table}
            WHERE  FactureID = $1
            `, [factureId]);
        return result.rows[0] ?? null;
    }
    // =====================================================
    // FLEXIBLE FILTER SYSTEM
    //
    // metaZZ flag selects the pipeline.
    // =====================================================
    static async getFacturesWhere(metaZZverification, filters, metaZZ = false) {
        if (metaZZ && !metaZZverification) {
            throw new Error('Access denied: MetaZZ privilege is required.');
        }
        const keys = Object.keys(filters);
        if (keys.length === 0) {
            return this.getAllFactures(metaZZ, metaZZverification);
        }
        assertAllowedColumns(keys);
        const conditions = [];
        const values = [];
        keys.forEach((key, index) => {
            values.push(filters[key]);
            conditions.push(`${key} = $${index + 1}`);
        });
        const table = factureTable(metaZZ);
        const result = await dbClient.query(`
            SELECT *
            FROM   ${table}
            WHERE  ${conditions.join(' AND ')}
            ORDER  BY FactureCreatedAt DESC
            `, values);
        return result.rows;
    }
    // =====================================================
    // UPDATE FACTURE
    //
    // Pipeline is auto-derived from the FactureID.
    // =====================================================
    static async updateFacture(metaZZverification, factureId, updates) {
        const isMetaZZ = isMetaZZFromFactureId(factureId);
        if (isMetaZZ && !metaZZverification) {
            throw new Error('Access denied: MetaZZ privilege is required.');
        }
        const keys = Object.keys(updates);
        if (keys.length === 0) {
            return this.getFactureById(metaZZverification, factureId);
        }
        assertAllowedColumns(keys);
        const values = [];
        const setParts = [];
        keys.forEach((key, index) => {
            values.push(updates[key]);
            setParts.push(`${key} = $${index + 1}`);
        });
        values.push(factureId);
        const table = factureTable(isMetaZZ);
        const result = await dbClient.query(`
            UPDATE ${table}
            SET    ${setParts.join(', ')}
            WHERE  FactureID = $${values.length}
            RETURNING *
            `, values);
        return result.rows[0] ?? null;
    }
    // =====================================================
    // DELETE FACTURE
    //
    // Pipeline is auto-derived from the FactureID.
    // =====================================================
    static async deleteFacture(metaZZverification, factureId) {
        const isMetaZZ = isMetaZZFromFactureId(factureId);
        if (isMetaZZ && !metaZZverification) {
            throw new Error('Access denied: MetaZZ privilege is required.');
        }
        const table = factureTable(isMetaZZ);
        const result = await dbClient.query(`
            DELETE FROM ${table}
            WHERE  FactureID = $1
            `, [factureId]);
        return (result.rowCount ?? 0) > 0;
    }
    // =====================================================
    // ATTACH TRANSACTION TO FACTURE
    //
    // Pipeline is derived from the FactureID.
    // The Transaction must belong to the same pipeline:
    //   "TRXN…" (4th char = 'N') → MetaZZ
    // A cross-pipeline attach is rejected.
    // =====================================================
    static async attachTransaction(metaZZverification, factureId, transactionId) {
        const facIsMetaZZ = isMetaZZFromFactureId(factureId);
        const trxIsMetaZZ = transactionId.charAt(3) === 'N';
        if (facIsMetaZZ !== trxIsMetaZZ) {
            throw new Error('Pipeline mismatch: cannot attach a MetaZZ transaction to a Standard facture (or vice-versa).');
        }
        if (facIsMetaZZ && !metaZZverification) {
            throw new Error('Access denied: MetaZZ privilege is required.');
        }
        const jct = junctionTable(facIsMetaZZ);
        await dbClient.query(`
            INSERT INTO ${jct} (FactureID, TransactionID)
            VALUES ($1, $2)
            ON CONFLICT DO NOTHING
            `, [factureId, transactionId]);
        return true;
    }
    // =====================================================
    // GET FACTURE TRANSACTIONS
    //
    // Pipeline is auto-derived from the FactureID.
    // =====================================================
    static async getFactureTransactions(metaZZverification, factureId) {
        const isMetaZZ = isMetaZZFromFactureId(factureId);
        if (isMetaZZ && !metaZZverification) {
            throw new Error('Access denied: MetaZZ privilege is required.');
        }
        const trxTable = transactionTable(isMetaZZ);
        const jct = junctionTable(isMetaZZ);
        const result = await dbClient.query(`
            SELECT T.*
            FROM   ${trxTable} T
            INNER JOIN ${jct} EP ON T.TransactionID = EP.TransactionID
            WHERE  EP.FactureID = $1
            `, [factureId]);
        return result.rows;
    }
    // =====================================================
    // MARK FACTURE PAID
    //
    // Pipeline is auto-derived from the FactureID.
    // =====================================================
    static async markFactureAsPaid(metaZZverification, factureId) {
        return this.updateFacture(metaZZverification, factureId, {
            FactureStatus: 'PAID',
        });
    }
    // =====================================================
    // GET FACTURES BETWEEN DATES
    //
    // metaZZ flag selects the pipeline.
    // =====================================================
    static async getFacturesBetweenDates(metaZZverification, startDate, endDate, metaZZ = false) {
        if (metaZZ && !metaZZverification) {
            throw new Error('Access denied: MetaZZ privilege is required.');
        }
        const table = factureTable(metaZZ);
        const result = await dbClient.query(`
            SELECT *
            FROM   ${table}
            WHERE  FactureCreatedAt >= $1
              AND  FactureCreatedAt <  $2::date + INTERVAL '1 day'
            ORDER  BY FactureCreatedAt DESC
            `, [startDate, endDate]);
        return result.rows;
    }
    // =====================================================
    // GET FACTURES BY STATUS
    //
    // metaZZ flag selects the pipeline.
    // =====================================================
    static async getFacturesByStatus(metaZZverification, status, metaZZ = false) {
        if (metaZZ && !metaZZverification) {
            throw new Error('Access denied: MetaZZ privilege is required.');
        }
        const table = factureTable(metaZZ);
        const result = await dbClient.query(`
            SELECT *
            FROM   ${table}
            WHERE  FactureStatus = $1
            ORDER  BY FactureCreatedAt DESC
            `, [status]);
        return result.rows;
    }
}
module.exports = FactureAPI;
//# sourceMappingURL=facture.api.js.map