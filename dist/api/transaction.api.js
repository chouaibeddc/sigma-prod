"use strict";
// api/transaction.api.ts
//
// Physical-separation architecture:
//   Standard pipeline  → Transaction_      + estPayerPar      + MainCaisse / TVACaisse
//   MetaZZ   pipeline  → TransactionMetaZZ + estPayerParMetaZZ + MetaZZCaisse / TVAMetaZZCaisse
Object.defineProperty(exports, "__esModule", { value: true });
const dbClient = require('../database/connection').dbClient;
const CaisseAPI = require('./caisse.api');
const DEFAULT_TVA_RATE = 20;
// ── Pipeline helpers ─────────────────────────────────────────────────────────
function pipelineTables(isMetaZZ) {
    return {
        transaction: isMetaZZ ? 'TransactionMetaZZ' : 'Transaction_',
        junction: isMetaZZ ? 'estPayerParMetaZZ' : 'estPayerPar',
    };
}
function isMetaZZFromFactureId(factureId) {
    return factureId.charAt(3) === 'N';
}
function factureTableFromId(factureId) {
    return isMetaZZFromFactureId(factureId) ? 'FactureMetaZZ' : 'Facture';
}
function junctionTableFromFactureId(factureId) {
    return isMetaZZFromFactureId(factureId)
        ? 'estPayerParMetaZZ'
        : 'estPayerPar';
}
// ── Allowlisted columns ──────────────────────────────────────────────────────
const TRANSACTION_ALLOWED_COLUMNS = new Set([
    'TransactionID',
    'TransactionType',
    'TransactionPaymentMethod',
    'TransactionMountantHT',
    'TransactionTVARate',
    'TransactionFees',
    'TransactionFeesTVARate',
    'TransactionDescription',
    'TransactionCreatedAt',
    'TransactionCreatedByUserID',
    'ParticipantID',
]);
function assertAllowedColumns(keys) {
    for (const key of keys) {
        if (!TRANSACTION_ALLOWED_COLUMNS.has(key)) {
            throw new Error(`Column "${key}" is not allowed in a dynamic query.`);
        }
    }
}
// ── Shared SELECT projection ─────────────────────────────────────────────────
const SELECT_PROJECTION = `t.*, p.ParticipantName, p.ParticipantType, p.ParticipantBANK, p.ParticipantRIB, COALESCE( JSON_AGG( JSON_BUILD_OBJECT('factureId', ep.FactureID) ) FILTER (WHERE ep.FactureID IS NOT NULL), '[]' ) AS factures`;
const GROUP_BY = `t.TransactionID, p.ParticipantName, p.ParticipantType, p.ParticipantBANK, p.ParticipantRIB`;
// ── TransactionAPI ───────────────────────────────────────────────────────────
class TransactionAPI {
    // =========================================================================
    // CREATE TRANSACTION
    // =========================================================================
    static async createTransaction(metaZZverification, data) {
        const { transactiontype = null, transactionpaymentmethod = null, transactiondescription = null, createdByUserId = null, factureid = null, } = data;
        let { participantid = null } = data;
        // ── CRITICAL FOR CENTS ARCHITECTURE ──────────────────────────────────────
        // Explicitly parse all financial inputs to numbers (cents) to prevent
        // string concatenation bugs or type errors from Postgres NUMERIC returns.
        const htAmount = parseFloat(String(data.transactionmountantht ?? 0)) || 0;
        const newTransactionTvaRate = parseFloat(String(data.transactiontvarate ?? DEFAULT_TVA_RATE)) ||
            DEFAULT_TVA_RATE;
        const feesAmount = parseFloat(String(data.transactionfees ?? 0)) || 0;
        const feesTvaRate = parseFloat(String(data.transactionfeestvarate ?? 0)) || 0;
        const isMetaZZ = factureid ? isMetaZZFromFactureId(factureid) : false;
        if (isMetaZZ && !metaZZverification) {
            throw new Error('Access denied: MetaZZ privilege is required to create a MetaZZ transaction.');
        }
        const { transaction: trxTable, junction: jctTable } = pipelineTables(isMetaZZ);
        const facTable = factureid ? factureTableFromId(factureid) : null;
        const serviceTable = isMetaZZ ? 'ServiceMetaZZ' : 'Service';
        // Calculate specific TVA and Fees TVA amounts (values are in cents)
        const tvaAmount = Math.round((htAmount * newTransactionTvaRate) / 100);
        const feesTvaAmount = Math.round((feesAmount * feesTvaRate) / 100);
        // Calculate the TTC of the new transaction being created (in cents)
        const newTransactionTTC = Math.round(htAmount * (1 + newTransactionTvaRate / 100));
        // Revenue guard (Ends with '+', e.g., "SALE+")
        const isRevenu = (transactiontype ?? '').trim().endsWith('+');
        if (factureid && !isRevenu) {
            throw new Error('Invalid transaction: only revenue transactions can be linked to a facture.');
        }
        // Participant resolution
        if (factureid && facTable) {
            const serviceClientResult = await dbClient.query(`SELECT s.ServiceClientID FROM ${serviceTable} s WHERE s.ServiceFactureID = $1 LIMIT 1`, [factureid]);
            if ((serviceClientResult.rowCount ?? 0) === 0)
                throw new Error(`No service found for facture "${factureid}".`);
            const clientId = serviceClientResult.rows[0].serviceclientid;
            if (!clientId)
                throw new Error(`The service linked to facture "${factureid}" has no client assigned.`);
            participantid = await this.resolveParticipantId(clientId, true);
        }
        else {
            if (!participantid)
                throw new Error('Invalid transaction: participantid is strictly required when no factureid is provided.');
            participantid = await this.resolveParticipantId(participantid, true);
        }
        try {
            await dbClient.query('BEGIN');
            let remainingTTC = 0;
            if (factureid && facTable) {
                const factureCheck = await dbClient.query(`SELECT FactureID, FactureStatus FROM ${facTable} WHERE FactureID = $1 FOR UPDATE`, [factureid]);
                if ((factureCheck.rowCount ?? 0) === 0)
                    throw new Error(`Facture "${factureid}" not found.`);
                if ((factureCheck.rows[0].facturestatus ?? '').toUpperCase() ===
                    'PAID') {
                    throw new Error(`Facture "${factureid}" is already marked as PAID.`);
                }
                const comprendreServiceTable = isMetaZZ
                    ? 'ComprendreServiceMetaZZ'
                    : 'ComprendreService';
                const comprendreProduitTable = isMetaZZ
                    ? 'ComprendreProduitMetaZZ'
                    : 'ComprendreProduit';
                // 1. Calculate Total HT and fetch the Facture's specific TVA Rate
                const totalResult = await dbClient.query(`
                    WITH service_total AS (
                        SELECT COALESCE(SUM(cs.ServicePrixHTPrestation), 0) AS total
                        FROM   ${serviceTable}            s
                        JOIN   ${comprendreServiceTable}  cs ON s.ServiceID = cs.ServiceID
                        WHERE  s.ServiceFactureID = $1
                    ),
                    product_total AS (
                        SELECT COALESCE(SUM(cp.ProduitPrixUHTVende * cp.ProduitVenduQte_ComprendreProduit), 0) AS total
                        FROM   ${serviceTable}            s
                        JOIN   ${comprendreProduitTable}  cp ON s.ServiceID = cp.ServiceID
                        WHERE  s.ServiceFactureID = $1
                    ),
                    facture_info AS (
                        SELECT 
                            COALESCE(f.FactureReductionPourcentage, 0) AS percentage,
                            COALESCE(f.FactureTVARate, 20) AS tva_rate
                        FROM ${facTable} f
                        WHERE f.FactureID = $1
                    )
                    SELECT
                        (
                            (SELECT total FROM service_total) +
                            (SELECT total FROM product_total)
                        ) * (1 - (SELECT percentage FROM facture_info) / 100.0) AS total_ht,
                        (SELECT tva_rate FROM facture_info) AS facture_tva_rate
                    `, [factureid]);
                const totalFactureHT = parseFloat(totalResult.rows[0]?.total_ht ?? '0') || 0;
                const factureTvaRate = parseFloat(totalResult.rows[0]?.facture_tva_rate ?? '20') ||
                    20;
                // Calculate the global Facture TTC using the Facture's own TVA rate (in cents)
                const totalFactureTTC = Math.round(totalFactureHT * (1 + factureTvaRate / 100));
                // 2. Calculate Paid TTC using each linked transaction's specific TVA rate
                const paidResult = await dbClient.query(`SELECT COALESCE(SUM(t.TransactionMountantHT * (1 + t.TransactionTVARate / 100.0)), 0) AS paid_ttc 
                     FROM ${trxTable} t 
                     JOIN ${jctTable} ep ON t.TransactionID = ep.TransactionID 
                     WHERE ep.FactureID = $1`, [factureid]);
                const paidFactureTTC = Math.round(parseFloat(paidResult.rows[0]?.paid_ttc ?? '0')) || 0;
                // 3. Calculate Remaining TTC
                remainingTTC = Math.round(totalFactureTTC - paidFactureTTC);
                if (remainingTTC <= 0)
                    throw new Error(`Facture "${factureid}" is already fully paid.`);
                if (newTransactionTTC > remainingTTC)
                    throw new Error(`Transaction amount TTC (${newTransactionTTC}) exceeds the remaining unpaid amount (${remainingTTC}).`);
            }
            const trxResult = await dbClient.query(`INSERT INTO ${trxTable} (
                    TransactionType, TransactionPaymentMethod, TransactionMountantHT, 
                    TransactionTVARate, TransactionFees, TransactionFeesTVARate,
                    TransactionDescription, TransactionCreatedAt, TransactionCreatedByUserID, ParticipantID
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), $8, $9) RETURNING *`, [
                transactiontype,
                transactionpaymentmethod,
                htAmount,
                newTransactionTvaRate,
                feesAmount,
                feesTvaRate,
                transactiondescription,
                createdByUserId,
                participantid,
            ]);
            const transaction = trxResult.rows[0];
            if (factureid && facTable) {
                await dbClient.query(`INSERT INTO ${jctTable} (FactureID, TransactionID) VALUES ($1, $2) ON CONFLICT DO NOTHING`, [factureid, transaction.transactionid]);
                // Mark as PAID if the new transaction covers the remaining TTC
                if (Math.round(remainingTTC - newTransactionTTC) <= 0) {
                    await dbClient.query(`UPDATE ${facTable} SET FactureStatus = 'PAID' WHERE FactureID = $1`, [factureid]);
                }
            }
            // await dbClient.query('COMMIT');
            // // ── Caisse Updates (Post-commit) ─────────────────────────────────
            // if (isRevenu) {
            //     await CaisseAPI.addToMainCaisse(
            //         metaZZverification,
            //         htAmount,
            //         isMetaZZ,
            //         createdByUserId,
            //     );
            //     await CaisseAPI.addToTVACaisse(
            //         metaZZverification,
            //         tvaAmount,
            //         isMetaZZ,
            //         createdByUserId,
            //     );
            // } else {
            //     await CaisseAPI.subtractFromMainCaisse(
            //         metaZZverification,
            //         htAmount,
            //         isMetaZZ,
            //         createdByUserId,
            //     );
            //     await CaisseAPI.subtractFromTVACaisse(
            //         metaZZverification,
            //         tvaAmount,
            //         isMetaZZ,
            //         createdByUserId,
            //     );
            // }
            // // Fees are ALWAYS subtracted from Caisse
            // if (feesAmount > 0) {
            //     await CaisseAPI.subtractFromMainCaisse(
            //         metaZZverification,
            //         feesAmount,
            //         isMetaZZ,
            //         createdByUserId,
            //     );
            //     if (feesTvaAmount > 0) {
            //         await CaisseAPI.subtractFromTVACaisse(
            //             metaZZverification,
            //             feesTvaAmount,
            //             isMetaZZ,
            //             createdByUserId,
            //         );
            //     }
            // }
            // ── Caisse Updates (Inside Transaction) ──────────────────────────
            const mainCaisseName = isMetaZZ ? 'MetaZZCaisse' : 'MainCaisse';
            const tvaCaisseName = isMetaZZ ? 'TVAMetaZZCaisse' : 'TVACaisse';
            let mainDelta = 0;
            let tvaDelta = 0;
            if (isRevenu) {
                mainDelta += htAmount;
                tvaDelta += tvaAmount;
            }
            else {
                mainDelta -= htAmount;
                tvaDelta -= tvaAmount;
            }
            // Fees are ALWAYS subtracted from Caisse
            if (feesAmount > 0) {
                mainDelta -= feesAmount;
            }
            if (feesTvaAmount > 0) {
                tvaDelta -= feesTvaAmount;
            }
            if (mainDelta !== 0) {
                await dbClient.query(`UPDATE Caisse 
                     SET CaisseMountant = CaisseMountant + $1, 
                         CaisseLastEditByUserId = $2, 
                         CaisseLastEditAt = NOW() 
                     WHERE CaisseName = $3`, [mainDelta, createdByUserId, mainCaisseName]);
            }
            if (tvaDelta !== 0) {
                await dbClient.query(`UPDATE Caisse 
                     SET CaisseMountant = CaisseMountant + $1, 
                         CaisseLastEditByUserId = $2, 
                         CaisseLastEditAt = NOW() 
                     WHERE CaisseName = $3`, [tvaDelta, createdByUserId, tvaCaisseName]);
            }
            await dbClient.query('COMMIT');
            return {
                ...transaction,
                factureid: factureid ?? null,
                pipeline: isMetaZZ ? 'metaZZ' : 'standard',
            };
        }
        catch (err) {
            await dbClient.query('ROLLBACK');
            throw err;
        }
    }
    // =========================================================================
    // UPDATE TRANSACTION
    // =========================================================================
    static async updateTransaction(metaZZverification, transactionId, data) {
        const isMetaZZ = transactionId.charAt(3) === 'N';
        if (isMetaZZ && !metaZZverification)
            throw new Error('Access denied: MetaZZ privilege is required.');
        const { transaction: trxTable } = pipelineTables(isMetaZZ);
        const oldTrxResult = await dbClient.query(`SELECT * FROM ${trxTable} WHERE TransactionID = $1`, [transactionId]);
        if (oldTrxResult.rowCount === 0)
            throw new Error(`Transaction "${transactionId}" not found.`);
        const oldTrx = oldTrxResult.rows[0];
        // ── CRITICAL FOR CENTS ARCHITECTURE ──────────────────────────────────────
        // node-postgres returns NUMERIC columns as strings. We must explicitly parse
        // them into numbers (cents) to prevent string concatenation bugs or type
        // errors when passing them to CaisseAPI (which strictly expects numbers).
        const oldHt = parseFloat(oldTrx.transactionmountantht) || 0;
        const oldTvaRate = parseFloat(oldTrx.transactiontvarate) || 0;
        const oldFees = parseFloat(oldTrx.transactionfees) || 0;
        const oldFeesTvaRate = parseFloat(oldTrx.transactionfeestvarate) || 0;
        const newType = data.transactiontype ?? oldTrx.transactiontype;
        const newMethod = data.transactionpaymentmethod ?? oldTrx.transactionpaymentmethod;
        // Ensure new values are parsed as numbers (cents)
        const newHt = data.transactionmountantht !== undefined
            ? parseFloat(String(data.transactionmountantht))
            : oldHt;
        const newTvaRate = data.transactiontvarate !== undefined
            ? parseFloat(String(data.transactiontvarate))
            : oldTvaRate;
        const newFees = data.transactionfees !== undefined
            ? parseFloat(String(data.transactionfees))
            : oldFees;
        const newFeesTvaRate = data.transactionfeestvarate !== undefined
            ? parseFloat(String(data.transactionfeestvarate))
            : oldFeesTvaRate;
        const newDesc = data.transactiondescription ?? oldTrx.transactiondescription;
        const newParticipant = data.participantid ?? oldTrx.participantid;
        const createdByUserId = data.createdByUserId ?? oldTrx.transactioncreatedbyuserid;
        const oldTvaAmount = Math.round((oldHt * oldTvaRate) / 100);
        const oldFeesTvaAmount = Math.round((oldFees * oldFeesTvaRate) / 100);
        const newTvaAmount = Math.round((newHt * newTvaRate) / 100);
        const newFeesTvaAmount = Math.round((newFees * newFeesTvaRate) / 100);
        // FIX: Use endsWith('+') instead of startsWith('R') to match business logic
        const oldIsRevenu = (oldTrx.transactiontype ?? '').trim().endsWith('+');
        const newIsRevenu = (newType ?? '').trim().endsWith('+');
        try {
            await dbClient.query('BEGIN');
            const updateResult = await dbClient.query(`UPDATE ${trxTable} SET
                    TransactionType = $1, TransactionPaymentMethod = $2, TransactionMountantHT = $3,
                    TransactionTVARate = $4, TransactionFees = $5, TransactionFeesTVARate = $6,
                    TransactionDescription = $7, ParticipantID = $8
                 WHERE TransactionID = $9 RETURNING *`, [
                newType,
                newMethod,
                newHt,
                newTvaRate,
                newFees,
                newFeesTvaRate,
                newDesc,
                newParticipant,
                transactionId,
            ]);
            await dbClient.query('COMMIT');
            // 1. Reverse Old Caisse Impact
            if (oldIsRevenu) {
                await CaisseAPI.subtractFromMainCaisse(metaZZverification, oldHt, isMetaZZ, createdByUserId);
                await CaisseAPI.subtractFromTVACaisse(metaZZverification, oldTvaAmount, isMetaZZ, createdByUserId);
            }
            else {
                await CaisseAPI.addToMainCaisse(metaZZverification, oldHt, isMetaZZ, createdByUserId);
                await CaisseAPI.addToTVACaisse(metaZZverification, oldTvaAmount, isMetaZZ, createdByUserId);
            }
            if (oldFees > 0) {
                await CaisseAPI.addToMainCaisse(metaZZverification, oldFees, isMetaZZ, createdByUserId);
                if (oldFeesTvaAmount > 0)
                    await CaisseAPI.addToTVACaisse(metaZZverification, oldFeesTvaAmount, isMetaZZ, createdByUserId);
            }
            // 2. Apply New Caisse Impact
            if (newIsRevenu) {
                await CaisseAPI.addToMainCaisse(metaZZverification, newHt, isMetaZZ, createdByUserId);
                await CaisseAPI.addToTVACaisse(metaZZverification, newTvaAmount, isMetaZZ, createdByUserId);
            }
            else {
                await CaisseAPI.subtractFromMainCaisse(metaZZverification, newHt, isMetaZZ, createdByUserId);
                await CaisseAPI.subtractFromTVACaisse(metaZZverification, newTvaAmount, isMetaZZ, createdByUserId);
            }
            if (newFees > 0) {
                await CaisseAPI.subtractFromMainCaisse(metaZZverification, newFees, isMetaZZ, createdByUserId);
                if (newFeesTvaAmount > 0)
                    await CaisseAPI.subtractFromTVACaisse(metaZZverification, newFeesTvaAmount, isMetaZZ, createdByUserId);
            }
            return updateResult.rows[0];
        }
        catch (err) {
            await dbClient.query('ROLLBACK');
            throw err;
        }
    }
    // =========================================================================
    // READ METHODS
    // =========================================================================
    static async getAllTransactions(metaZZverification, metaZZ = false) {
        if (metaZZ && !metaZZverification)
            throw new Error('Access denied: MetaZZ privilege is required.');
        const { transaction: trxTable, junction: jctTable } = pipelineTables(metaZZ);
        const result = await dbClient.query(`SELECT ${SELECT_PROJECTION} FROM ${trxTable} t LEFT JOIN Participant p ON p.ParticipantID = t.ParticipantID LEFT JOIN ${jctTable} ep ON ep.TransactionID = t.TransactionID GROUP BY ${GROUP_BY} ORDER BY t.TransactionCreatedAt DESC`);
        return result.rows;
    }
    static async getTransactionById(metaZZverification, transactionId) {
        const isMetaZZ = transactionId.charAt(3) === 'N';
        if (isMetaZZ && !metaZZverification)
            throw new Error('Access denied: MetaZZ privilege is required.');
        const { transaction: trxTable, junction: jctTable } = pipelineTables(isMetaZZ);
        const result = await dbClient.query(`SELECT ${SELECT_PROJECTION} FROM ${trxTable} t LEFT JOIN Participant p ON p.ParticipantID = t.ParticipantID LEFT JOIN ${jctTable} ep ON ep.TransactionID = t.TransactionID WHERE t.TransactionID = $1 GROUP BY ${GROUP_BY}`, [transactionId]);
        return result.rows[0] ?? null;
    }
    static async getTransactionsBetweenDates(metaZZverification, startDate, endDate, metaZZ = false) {
        if (metaZZ && !metaZZverification)
            throw new Error('Access denied: MetaZZ privilege is required.');
        const { transaction: trxTable, junction: jctTable } = pipelineTables(metaZZ);
        const result = await dbClient.query(`SELECT ${SELECT_PROJECTION} FROM ${trxTable} t LEFT JOIN Participant p ON p.ParticipantID = t.ParticipantID LEFT JOIN ${jctTable} ep ON ep.TransactionID = t.TransactionID WHERE t.TransactionCreatedAt >= $1 AND t.TransactionCreatedAt < $2::date + INTERVAL '1 day' GROUP BY ${GROUP_BY} ORDER BY t.TransactionCreatedAt DESC`, [startDate, endDate]);
        return result.rows;
    }
    static async getTransactionsByDay(metaZZverification, day, metaZZ = false) {
        if (metaZZ && !metaZZverification)
            throw new Error('Access denied: MetaZZ privilege is required.');
        const { transaction: trxTable, junction: jctTable } = pipelineTables(metaZZ);
        const result = await dbClient.query(`SELECT ${SELECT_PROJECTION} FROM ${trxTable} t LEFT JOIN Participant p ON p.ParticipantID = t.ParticipantID LEFT JOIN ${jctTable} ep ON ep.TransactionID = t.TransactionID WHERE DATE(t.TransactionCreatedAt) = DATE($1) GROUP BY ${GROUP_BY} ORDER BY t.TransactionCreatedAt DESC`, [day]);
        return result.rows;
    }
    static async getTransactionsWhere(metaZZverification, filters, metaZZ = false) {
        if (metaZZ && !metaZZverification)
            throw new Error('Access denied: MetaZZ privilege is required.');
        const { transaction: trxTable, junction: jctTable } = pipelineTables(metaZZ);
        const keys = Object.keys(filters);
        if (keys.length === 0)
            return this.getAllTransactions(metaZZ, metaZZverification);
        assertAllowedColumns(keys);
        const conditions = [];
        const values = [];
        keys.forEach((key, index) => {
            values.push(filters[key]);
            conditions.push(`t."${key}" = $${index + 1}`);
        });
        const result = await dbClient.query(`SELECT ${SELECT_PROJECTION} FROM ${trxTable} t LEFT JOIN Participant p ON p.ParticipantID = t.ParticipantID LEFT JOIN ${jctTable} ep ON ep.TransactionID = t.TransactionID WHERE ${conditions.join(' AND ')} GROUP BY ${GROUP_BY} ORDER BY t.TransactionCreatedAt DESC`, values);
        return result.rows;
    }
    // =========================================================================
    // LINK / UNLINK
    // =========================================================================
    static async linkTransactionToFacture(metaZZverification, transactionId, factureId) {
        const trxIsMetaZZ = transactionId.charAt(3) === 'N';
        const facIsMetaZZ = isMetaZZFromFactureId(factureId);
        if (trxIsMetaZZ !== facIsMetaZZ)
            throw new Error('Pipeline mismatch: a MetaZZ transaction cannot be linked to a Standard facture.');
        if (trxIsMetaZZ && !metaZZverification)
            throw new Error('Access denied: MetaZZ privilege is required.');
        const { transaction: trxTable, junction: jctTable } = pipelineTables(trxIsMetaZZ);
        const facTable = facIsMetaZZ ? 'FactureMetaZZ' : 'Facture';
        const [trxCheck, facCheck] = await Promise.all([
            dbClient.query(`SELECT TransactionID FROM ${trxTable} WHERE TransactionID = $1`, [transactionId]),
            dbClient.query(`SELECT FactureID FROM ${facTable} WHERE FactureID = $1`, [factureId]),
        ]);
        if (trxCheck.rowCount === 0)
            throw new Error(`Transaction "${transactionId}" not found.`);
        if (facCheck.rowCount === 0)
            throw new Error(`Facture "${factureId}" not found.`);
        await dbClient.query(`INSERT INTO ${jctTable} (FactureID, TransactionID) VALUES ($1, $2) ON CONFLICT DO NOTHING`, [factureId, transactionId]);
        return { transactionId, factureId };
    }
    static async unlinkTransactionFromFacture(metaZZverification, transactionId, factureId) {
        const isMetaZZ = isMetaZZFromFactureId(factureId);
        if (isMetaZZ && !metaZZverification)
            throw new Error('Access denied: MetaZZ privilege is required.');
        const jctTable = junctionTableFromFactureId(factureId);
        const result = await dbClient.query(`DELETE FROM ${jctTable} WHERE FactureID = $1 AND TransactionID = $2`, [factureId, transactionId]);
        return { deleted: (result.rowCount ?? 0) > 0 };
    }
    // =========================================================================
    // HELPERS
    // =========================================================================
    static async resolveParticipantId(participantId, throwIfNotFound = false) {
        if (!participantId)
            return null;
        if (participantId.startsWith('PAR')) {
            const checkResult = await dbClient.query(`SELECT ParticipantID FROM Participant WHERE ParticipantID = $1`, [participantId]);
            if (checkResult.rowCount === 0) {
                if (throwIfNotFound)
                    throw new Error(`Participant "${participantId}" not found.`);
                return null;
            }
            return participantId;
        }
        let tableName, idColumn, entityType;
        if (participantId.startsWith('CLI')) {
            tableName = 'Client';
            idColumn = 'ClientID';
            entityType = 'Client';
        }
        else if (participantId.startsWith('EMP')) {
            tableName = 'Employee';
            idColumn = 'EmployeeID';
            entityType = 'Employee';
        }
        else if (participantId.startsWith('FRN')) {
            tableName = 'Fournisseur';
            idColumn = 'FournisseurID';
            entityType = 'Fournisseur';
        }
        else {
            if (throwIfNotFound)
                throw new Error(`Unknown ID prefix: ${participantId}`);
            return null;
        }
        const result = await dbClient.query(`SELECT ParticipantID FROM ${tableName} WHERE ${idColumn} = $1`, [participantId]);
        if (result.rowCount === 0) {
            if (throwIfNotFound)
                throw new Error(`${entityType} "${participantId}" not found.`);
            return null;
        }
        const resolvedId = result.rows[0].participantid;
        if (resolvedId === null) {
            if (throwIfNotFound)
                throw new Error(`${entityType} "${participantId}" exists but has no associated Participant.`);
            return null;
        }
        return resolvedId;
    }
}
module.exports = TransactionAPI;
//# sourceMappingURL=transaction.api.js.map