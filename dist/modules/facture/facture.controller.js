"use strict";
// controllers/factureController.ts
//
// Handles Facture calculations and payment tracking.
// Pipeline selection is auto-derived from the FactureID prefix:
//   'FACN…' (4th char = 'N') → MetaZZ pipeline
//   'FAC…'                    → Standard pipeline
//
// ── PRICE-LOCKING LOGIC (read this before touching getFactureAmounts) ───────
// A Facture's totals must NEVER drift after creation, even if a Produit's
// price, a ServiceArticle's price, a Reduction's percentage, or the global
// TVA rate change later on. To guarantee this:
//   • ComprendreService.ServicePrixHTPrestation  → price snapshot of the
//     ServiceArticle at the moment it was added to the service/facture.
//   • ComprendreProduit.ProduitPrixUHTVende      → price snapshot of the
//     Produit at the moment it was added.
//   • Facture.FactureTVARate                     → TVA rate snapshot.
//   • Facture.FactureReductionPourcentage        → Reduction % snapshot.
// getFactureAmounts therefore reads ONLY from ComprendreService /
// ComprendreProduit / Facture columns and never joins back to
// ServiceArticle.ServiceArticlePriceHT, Produit.ProduitPrixUHT, or
// Reduction.ReductionPourcentage for the purpose of calculating money.
Object.defineProperty(exports, "__esModule", { value: true });
const { dbClient } = require('../../database/connection');
const { verifyMetaZZ } = require('../../util/meta.zz.verify');
// Fallback only — used for legacy rows created before FactureTVARate existed.
const TVA_RATE = 20;
function getFacturePipeline(factureId) {
    // 'FAC' -> index 3 is a digit. 'FACN' -> index 3 is 'N'
    const isMetaZZ = factureId.charAt(3) === 'N';
    return {
        isMetaZZ,
        factureTable: isMetaZZ ? 'FactureMetaZZ' : 'Facture',
        serviceTable: isMetaZZ ? 'ServiceMetaZZ' : 'Service',
        comprendreServiceTable: isMetaZZ
            ? 'ComprendreServiceMetaZZ'
            : 'ComprendreService',
        comprendreProduitTable: isMetaZZ
            ? 'ComprendreProduitMetaZZ'
            : 'ComprendreProduit',
        estPayerParTable: isMetaZZ ? 'estPayerParMetaZZ' : 'estPayerPar',
        transactionTable: isMetaZZ ? 'TransactionMetaZZ' : 'Transaction_',
    };
}
// =====================================================
// GET /api/facture/:id/amounts
// Calculates Total HT, TVA, and TTC for a given facture.
// =====================================================
exports.getFactureAmounts = async (req, res, next) => {
    const idParam = req.params.id;
    const factureId = Array.isArray(idParam) ? idParam[0] : idParam;
    if (!factureId) {
        res.status(400).json({ error: 'Facture ID is required.' });
        return;
    }
    const pipeline = getFacturePipeline(factureId);
    if (pipeline.isMetaZZ && !verifyMetaZZ(req)) {
        res.status(403).json({
            error: 'Access denied: MetaZZ privilege is required.',
        });
        return;
    }
    try {
        // 1. Check if facture exists and read the rate/percentage LOCKED on the
        //    facture itself. These were snapshotted at creation time (see
        //    facture.api.ts#createFacture and service.controller.ts#createService)
        //    and must be used as-is — never re-derived from the live Reduction
        //    row or a global TVA setting, since those can change later.
        const factureRes = await dbClient.query(`SELECT FactureID, FactureReductionID, FactureTVARate, FactureReductionPourcentage
             FROM ${pipeline.factureTable}
             WHERE FactureID = $1`, [factureId]);
        if (factureRes.rowCount === 0) {
            res.status(404).json({
                error: `Facture "${factureId}" not found.`,
            });
            return;
        }
        // parseFloat(null) is NaN, so || 0 / || TVA_RATE safely defaults legacy rows
        const reductionPercentage = parseFloat(factureRes.rows[0].facturereductionpourcentage) || 0;
        const tvaRate = parseFloat(factureRes.rows[0].facturetvarate) || TVA_RATE;
        // 2. Calculate Total HT using the prices SNAPSHOTTED at sale time
        //    (ComprendreService.ServicePrixHTPrestation /
        //    ComprendreProduit.ProduitPrixUHTVende). We deliberately do NOT
        //    join ServiceArticle/Produit here: their current price has no
        //    bearing on what this facture actually charged.
        const htRes = await dbClient.query(`WITH service_articles_sum AS (
                SELECT COALESCE(SUM(cs.ServicePrixHTPrestation), 0) as total
                FROM ${pipeline.serviceTable} s
                JOIN ${pipeline.comprendreServiceTable} cs ON s.ServiceID = cs.ServiceID
                WHERE s.ServiceFactureID = $1
            ),
            produits_sum AS (
                SELECT COALESCE(SUM(cp.ProduitPrixUHTVende * cp.ProduitVenduQte_ComprendreProduit), 0) as total
                FROM ${pipeline.serviceTable} s
                JOIN ${pipeline.comprendreProduitTable} cp ON s.ServiceID = cp.ServiceID
                WHERE s.ServiceFactureID = $1
            )
            SELECT 
                (SELECT total FROM service_articles_sum) + (SELECT total FROM produits_sum) AS total_ht`, [factureId]);
        const totalHT = parseFloat(htRes.rows[0].total_ht) || 0;
        // Apply the LOCKED reduction percentage and TVA rate (simple percentage logic)
        const totalHTAfterReduction = totalHT * (1 - reductionPercentage / 100);
        const tva = totalHTAfterReduction * (tvaRate / 100);
        const ttc = totalHTAfterReduction + tva;
        res.status(200).json({
            factureId,
            pipeline: pipeline.isMetaZZ ? 'metaZZ' : 'standard',
            totalHTBeforeReduction: totalHT.toFixed(2),
            reductionPercentage,
            totalHT: totalHTAfterReduction.toFixed(2),
            totalTTC: ttc.toFixed(2),
            tvaRate,
            tva: tva.toFixed(2),
        });
    }
    catch (err) {
        next(err);
    }
};
// =====================================================
// GET /api/facture/:id/payments
// Calculates amount paid and lists transactions.
// Query param: ?details=true (returns full transaction objects)
// =====================================================
exports.getFacturePayments = async (req, res, next) => {
    const idParam = req.params.id;
    const factureId = Array.isArray(idParam) ? idParam[0] : idParam;
    const detailsParam = Array.isArray(req.query.details)
        ? req.query.details[0]
        : req.query.details;
    const showDetails = detailsParam === 'true' || detailsParam === '1';
    if (!factureId) {
        res.status(400).json({ error: 'Facture ID is required.' });
        return;
    }
    const pipeline = getFacturePipeline(factureId);
    if (pipeline.isMetaZZ && !verifyMetaZZ(req)) {
        res.status(403).json({
            error: 'Access denied: MetaZZ privilege is required.',
        });
        return;
    }
    try {
        // Check if facture exists
        const factureCheck = await dbClient.query(`SELECT FactureID FROM ${pipeline.factureTable} WHERE FactureID = $1`, [factureId]);
        if (factureCheck.rowCount === 0) {
            res.status(404).json({
                error: `Facture "${factureId}" not found.`,
            });
            return;
        }
        // Get total paid amount (Sum of TransactionMountantHT)
        const sumRes = await dbClient.query(`SELECT COALESCE(SUM(t.TransactionMountantHT), 0) as total_paid
             FROM ${pipeline.estPayerParTable} ep
             JOIN ${pipeline.transactionTable} t ON ep.TransactionID = t.TransactionID
             WHERE ep.FactureID = $1`, [factureId]);
        const totalPaidHT = parseFloat(sumRes.rows[0].total_paid) || 0;
        let transactions = [];
        // Fetch transactions based on 'details' query param
        if (showDetails) {
            const detailsRes = await dbClient.query(`SELECT t.*
                 FROM ${pipeline.estPayerParTable} ep
                 JOIN ${pipeline.transactionTable} t ON ep.TransactionID = t.TransactionID
                 WHERE ep.FactureID = $1`, [factureId]);
            transactions = detailsRes.rows;
        }
        else {
            const idsRes = await dbClient.query(`SELECT ep.TransactionID
                 FROM ${pipeline.estPayerParTable} ep
                 WHERE ep.FactureID = $1`, [factureId]);
            // ✅ FIX 1: Explicitly type 'r' to avoid implicit 'any'
            // Note: Postgres returns unquoted column names in lowercase (transactionid)
            transactions = idsRes.rows.map((r) => r.transactionid);
        }
        res.status(200).json({
            factureId,
            pipeline: pipeline.isMetaZZ ? 'metaZZ' : 'standard',
            totalPaidHT: totalPaidHT.toFixed(2),
            transactionsCount: transactions.length,
            transactions,
        });
    }
    catch (err) {
        next(err);
    }
};
//# sourceMappingURL=facture.controller.js.map