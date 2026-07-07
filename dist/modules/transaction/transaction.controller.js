"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const TransactionAPI = require('../../api/transaction.api');
const DatatypeMappingObjectAPI = require('../../api/datatype.mapping.object.api');
const { dbClient } = require('../../database/connection');
const DEFAULT_TVA_RATE = 20;
function parseMetaZZQuery(raw) {
    return raw === 'true' || raw === '1';
}
const VALID_PARTICIPANT_PREFIXES = ['PAR', 'CLI', 'EMP', 'FRN'];
function isValidParticipantId(id) {
    return VALID_PARTICIPANT_PREFIXES.some((prefix) => id.startsWith(prefix));
}
function isValidFactureId(id) {
    return id.startsWith('FAC');
}
const { verifyMetaZZ } = require('../../util/meta.zz.verify');
// =====================================================
// CREATE TRANSACTION
// =====================================================
exports.createTransaction = async (req, res, next) => {
    const { transactiontype, transactionpaymentmethod, transactionmountantht, transactiontvarate, transactionfees, transactionfeestvarate, transactiondescription, participantid, factureid, } = req.body;
    const VALID_PAYMENT_METHODS = DatatypeMappingObjectAPI.getCachedKeys('PAYMENT_METHODS');
    const VALID_TRANSACTION_TYPES = DatatypeMappingObjectAPI.getCachedKeys('TRANSACTION_TYPE');
    if (!transactiontype || typeof transactiontype !== 'string') {
        res.status(400).json({ error: 'transactiontype est requis.' });
        return;
    }
    if (!transactionpaymentmethod ||
        typeof transactionpaymentmethod !== 'string') {
        res.status(400).json({ error: 'transactionpaymentmethod est requis.' });
        return;
    }
    if (transactionmountantht === undefined || transactionmountantht === null) {
        res.status(400).json({ error: 'transactionmountantht est requis.' });
        return;
    }
    const hasFactureId = factureid !== undefined && factureid !== null && factureid !== '';
    if (!hasFactureId) {
        if (!participantid || typeof participantid !== 'string') {
            res.status(400).json({
                error: "participantid est strictement requis lorsque aucune factureid n'est fournie.",
            });
            return;
        }
        if (!isValidParticipantId(participantid)) {
            res.status(400).json({ error: 'participantid invalide.' });
            return;
        }
    }
    const normalizedType = transactiontype.trim();
    if (!VALID_TRANSACTION_TYPES.some((t) => t.toLowerCase() === normalizedType.toLowerCase())) {
        res.status(400).json({
            error: `transactiontype invalide. Valeurs acceptées : ${VALID_TRANSACTION_TYPES.join(', ')}.`,
        });
        return;
    }
    const normalizedMethod = transactionpaymentmethod.trim();
    if (!VALID_PAYMENT_METHODS.some((m) => m?.toLowerCase() === normalizedMethod.toLowerCase())) {
        res.status(400).json({
            error: `transactionpaymentmethod invalide. Valeurs acceptées : ${VALID_PAYMENT_METHODS.join(', ')}.`,
        });
        return;
    }
    // ── FIX 2: Enforce integers (cents) for monetary amounts ──────────────
    // Math.round ensures no fractional cents (e.g., 12.5) can enter the system.
    const htAmount = Math.round(parseFloat(transactionmountantht));
    if (!Number.isFinite(htAmount) || htAmount <= 0) {
        res.status(400).json({
            error: 'transactionmountantht doit être un nombre positif (en centimes).',
        });
        return;
    }
    // Parse new tax/fee fields with backward compatibility fallbacks
    // Note: TVA rates are percentages, so they remain parseFloat (can be 14.5)
    const tvaRate = transactiontvarate !== undefined && transactiontvarate !== null
        ? parseFloat(transactiontvarate)
        : DEFAULT_TVA_RATE;
    const fees = transactionfees !== undefined && transactionfees !== null
        ? Math.round(parseFloat(transactionfees))
        : 0;
    const feesTvaRate = transactionfeestvarate !== undefined && transactionfeestvarate !== null
        ? parseFloat(transactionfeestvarate)
        : 0;
    if (isNaN(tvaRate) || tvaRate < 0) {
        res.status(400).json({
            error: 'transactiontvarate doit être un nombre positif ou nul.',
        });
        return;
    }
    if (isNaN(fees) || fees < 0) {
        res.status(400).json({
            error: 'transactionfees doit être un nombre positif ou nul (en centimes).',
        });
        return;
    }
    if (isNaN(feesTvaRate) || feesTvaRate < 0) {
        res.status(400).json({
            error: 'transactionfeestvarate doit être un nombre positif ou nul.',
        });
        return;
    }
    if (hasFactureId) {
        if (typeof factureid !== 'string' || !isValidFactureId(factureid)) {
            res.status(400).json({ error: 'factureid invalide.' });
            return;
        }
        // ── FIX 1: Match the API's Revenue Guard logic (endsWith '+') ───────
        const isRevenu = normalizedType.endsWith('+');
        if (!isRevenu) {
            res.status(422).json({
                error: `Une facture ne peut être liée qu'à une transaction de type Revenu (se terminant par '+').`,
            });
            return;
        }
    }
    try {
        const transaction = await TransactionAPI.createTransaction(verifyMetaZZ(req), {
            transactiontype: normalizedType,
            transactionpaymentmethod: normalizedMethod,
            transactionmountantht: htAmount,
            transactiontvarate: tvaRate,
            transactionfees: fees,
            transactionfeestvarate: feesTvaRate,
            transactiondescription: transactiondescription ?? null,
            participantid: participantid ?? null,
            factureid: factureid ?? null,
            createdByUserId: req.user?.userId ?? null,
        });
        res.status(201).json(transaction);
    }
    catch (err) {
        const msg = err?.message ?? '';
        if (msg.includes('Access denied')) {
            res.status(403).json({ error: 'Accès refusé.' });
            return;
        }
        if (msg.includes('exists but has no associated Participant')) {
            res.status(400).json({
                error: "Le client n'a pas de Participant associé.",
            });
            return;
        }
        if (msg.includes('Unknown ID prefix')) {
            res.status(400).json({
                error: 'Le format de participantid est invalide.',
            });
            return;
        }
        if (msg.includes('No service found for facture')) {
            res.status(404).json({
                error: `Aucun service n'est lié à cette facture.`,
            });
            return;
        }
        if (msg.includes('has no client assigned')) {
            res.status(404).json({
                error: `Le service lié n'a pas de client assigné.`,
            });
            return;
        }
        if (msg.includes('not found')) {
            res.status(404).json({
                error: 'Le participant ou la facture spécifiée est introuvable.',
            });
            return;
        }
        if (msg.includes('already marked as PAID')) {
            res.status(409).json({
                error: 'La facture est déjà marquée comme payée.',
            });
            return;
        }
        if (msg.includes('already fully paid')) {
            res.status(409).json({
                error: 'La facture est déjà intégralement réglée.',
            });
            return;
        }
        // ── FIX 3: Parse the new TTC error message from the API ─────────────
        if (msg.includes('exceeds the remaining')) {
            const matchAmount = msg.match(/TTC \(([^)]+)\)/);
            const matchRemaining = msg.match(/unpaid amount \(([^)]+)\)/);
            const amountSent = matchAmount ? matchAmount[1] : null;
            const remaining = matchRemaining ? matchRemaining[1] : null;
            res.status(422).json({
                error: `Le montant TTC de la transaction (${amountSent} centimes) dépasse le reste à payer de la facture${remaining ? ` (reste : ${remaining} centimes)` : ''}.`,
                ...(amountSent && {
                    transactionAmount: parseInt(amountSent, 10),
                }),
                ...(remaining && { remainingAmount: parseInt(remaining, 10) }),
            });
            return;
        }
        if (msg.includes('only revenue transactions')) {
            res.status(422).json({
                error: 'Seules les transactions Revenu peuvent être liées à une facture.',
            });
            return;
        }
        if (msg.includes('participantid is strictly required')) {
            res.status(422).json({ error: 'participantid est requis.' });
            return;
        }
        next(err);
    }
};
// =====================================================
// UPDATE TRANSACTION
// =====================================================
exports.updateTransaction = async (req, res, next) => {
    try {
        const { transactiontype, transactionpaymentmethod, transactionmountantht, transactiontvarate, transactionfees, transactionfeestvarate, transactiondescription, participantid, } = req.body;
        const updateData = {};
        if (transactiontype !== undefined)
            updateData.transactiontype = transactiontype;
        if (transactionpaymentmethod !== undefined)
            updateData.transactionpaymentmethod = transactionpaymentmethod;
        // ── FIX 2: Enforce integers (cents) for monetary amounts ──────────
        if (transactionmountantht !== undefined) {
            const ht = Math.round(parseFloat(transactionmountantht));
            if (isNaN(ht) || ht <= 0) {
                res.status(400).json({
                    error: 'transactionmountantht doit être un nombre positif (en centimes).',
                });
                return;
            }
            updateData.transactionmountantht = ht;
        }
        if (transactiontvarate !== undefined) {
            const tva = parseFloat(transactiontvarate); // Rates can be floats (e.g. 14.5)
            if (isNaN(tva) || tva < 0) {
                res.status(400).json({ error: 'transactiontvarate invalide.' });
                return;
            }
            updateData.transactiontvarate = tva;
        }
        if (transactionfees !== undefined) {
            const fees = Math.round(parseFloat(transactionfees));
            if (isNaN(fees) || fees < 0) {
                res.status(400).json({
                    error: 'transactionfees invalide (en centimes).',
                });
                return;
            }
            updateData.transactionfees = fees;
        }
        if (transactionfeestvarate !== undefined) {
            const feesTva = parseFloat(transactionfeestvarate); // Rates can be floats
            if (isNaN(feesTva) || feesTva < 0) {
                res.status(400).json({
                    error: 'transactionfeestvarate invalide.',
                });
                return;
            }
            updateData.transactionfeestvarate = feesTva;
        }
        if (transactiondescription !== undefined)
            updateData.transactiondescription = transactiondescription;
        if (participantid !== undefined)
            updateData.participantid = participantid;
        updateData.createdByUserId = req.user?.userId ?? null;
        const transaction = await TransactionAPI.updateTransaction(verifyMetaZZ(req), req.params.id, updateData);
        res.status(200).json(transaction);
    }
    catch (err) {
        const msg = err?.message ?? '';
        if (msg.includes('not found')) {
            res.status(404).json({ error: msg });
            return;
        }
        if (msg.includes('Access denied')) {
            res.status(403).json({ error: msg });
            return;
        }
        next(err);
    }
};
// =====================================================
// READ METHODS
// =====================================================
exports.getAllTransactions = async (req, res, next) => {
    try {
        const metaZZ = parseMetaZZQuery(req.query.metaZZ);
        const transactions = await TransactionAPI.getAllTransactions(verifyMetaZZ(req), metaZZ);
        res.status(200).json({
            total: transactions.length,
            pipeline: metaZZ ? 'metaZZ' : 'standard',
            transactions,
        });
    }
    catch (err) {
        if (err?.message?.includes('Access denied')) {
            res.status(403).json({ error: err.message });
            return;
        }
        next(err);
    }
};
exports.getTransactionById = async (req, res, next) => {
    try {
        const transaction = await TransactionAPI.getTransactionById(verifyMetaZZ(req), req.params.id);
        if (!transaction) {
            res.status(404).json({ error: 'Transaction introuvable.' });
            return;
        }
        res.status(200).json(transaction);
    }
    catch (err) {
        if (err?.message?.includes('Access denied')) {
            res.status(403).json({ error: err.message });
            return;
        }
        next(err);
    }
};
exports.getTransactionsBetweenDates = async (req, res, next) => {
    try {
        const { start, end } = req.query;
        const metaZZ = parseMetaZZQuery(req.query.metaZZ);
        if (!start || !end) {
            res.status(400).json({ error: 'start et end sont requis.' });
            return;
        }
        const transactions = await TransactionAPI.getTransactionsBetweenDates(verifyMetaZZ(req), String(start), String(end), metaZZ);
        res.status(200).json({
            total: transactions.length,
            pipeline: metaZZ ? 'metaZZ' : 'standard',
            transactions,
        });
    }
    catch (err) {
        if (err?.message?.includes('Access denied')) {
            res.status(403).json({ error: err.message });
            return;
        }
        next(err);
    }
};
exports.getTransactionsByDay = async (req, res, next) => {
    try {
        const metaZZ = parseMetaZZQuery(req.query.metaZZ);
        const transactions = await TransactionAPI.getTransactionsByDay(verifyMetaZZ(req), req.params.day, metaZZ);
        res.status(200).json({
            total: transactions.length,
            pipeline: metaZZ ? 'metaZZ' : 'standard',
            transactions,
        });
    }
    catch (err) {
        if (err?.message?.includes('Access denied')) {
            res.status(403).json({ error: err.message });
            return;
        }
        next(err);
    }
};
exports.searchTransactions = async (req, res, next) => {
    try {
        const metaZZ = parseMetaZZQuery(req.query.metaZZ);
        const transactions = await TransactionAPI.getTransactionsWhere(verifyMetaZZ(req), req.body, metaZZ);
        res.status(200).json({
            total: transactions.length,
            pipeline: metaZZ ? 'metaZZ' : 'standard',
            transactions,
        });
    }
    catch (err) {
        if (err?.message?.includes('not allowed in a dynamic query')) {
            res.status(400).json({ error: err.message });
            return;
        }
        if (err?.message?.includes('Access denied')) {
            res.status(403).json({ error: err.message });
            return;
        }
        next(err);
    }
};
// =====================================================
// LINK / UNLINK
// =====================================================
exports.linkToFacture = async (req, res, next) => {
    try {
        const { factureId } = req.body;
        if (!factureId) {
            res.status(400).json({ error: 'factureId est requis.' });
            return;
        }
        const result = await TransactionAPI.linkTransactionToFacture(verifyMetaZZ(req), req.params.id, factureId);
        res.status(200).json(result);
    }
    catch (err) {
        if (err?.message?.includes('not found')) {
            res.status(404).json({ error: err.message });
            return;
        }
        if (err?.message?.includes('Pipeline mismatch')) {
            res.status(400).json({ error: err.message });
            return;
        }
        if (err?.message?.includes('Access denied')) {
            res.status(403).json({ error: err.message });
            return;
        }
        next(err);
    }
};
exports.unlinkFromFacture = async (req, res, next) => {
    try {
        const result = await TransactionAPI.unlinkTransactionFromFacture(verifyMetaZZ(req), req.params.id, req.params.factureId);
        res.status(200).json(result);
    }
    catch (err) {
        if (err?.message?.includes('Access denied')) {
            res.status(403).json({ error: err.message });
            return;
        }
        next(err);
    }
};
/**
 * GET /api/participants
 * Returns a lightweight list of participants for dropdowns.
 */
exports.getParticipants = async (req, res, next) => {
    try {
        const result = await dbClient.query(`SELECT 
                ParticipantID, 
                ParticipantName, 
                ParticipantType 
             FROM Participant 
             ORDER BY ParticipantName ASC`);
        res.status(200).json(result.rows);
    }
    catch (err) {
        next(err);
    }
};
//# sourceMappingURL=transaction.controller.js.map