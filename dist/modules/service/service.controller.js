"use strict";
// controllers/serviceController.ts
//
// Physical-separation architecture adapter.
//
// Query param ?metaZZ=true  → MetaZZ pipeline  (ServiceMetaZZ + FactureMetaZZ + …MetaZZ junction tables)
// Query param ?metaZZ=false / absent → Standard pipeline (Service + Facture + … standard tables)
//
// Pipeline selection is explicit (body param on CREATE, query param on read endpoints).
// All MetaZZ access is gated by verifyMetaZZ(req).
//
// ── PRICE-LOCKING LOGIC ───────────────────────────────────────────────────
// createService() is where a Facture is born, so it's also where prices get
// frozen in place:
//   • ComprendreService.ServicePrixHTPrestation is set to the ServiceArticle's
//     CURRENT ServiceArticlePriceHT at insert time.
//   • ComprendreProduit.ProduitPrixUHTVende is set to the Produit's CURRENT
//     ProduitPrixUHT at insert time.
//   • Facture.FactureTVARate is set to the system default TVA rate.
//   • Facture.FactureReductionPourcentage is set to the linked Reduction's
//     CURRENT ReductionPourcentage (0 if no reduction is linked).
// After this point, none of these four values are ever re-read from
// ServiceArticle / Produit / Reduction for billing purposes — even if those
// master records change later, this facture keeps using what was snapshotted
// here. See facture.controller.ts#getFactureAmounts for the read side.
Object.defineProperty(exports, "__esModule", { value: true });
const console = require("node:console");
const { dbClient } = require('../../database/connection');
const { verifyMetaZZ } = require('../../util/meta.zz.verify');
// Fallback/default TVA rate stamped onto every new Facture at creation time.
const DEFAULT_TVA_RATE = 20;
// ── MetaZZ privilege stub ────────────────────────────────────────────────────
// Replace with a real privilege check when ready.
// ── Pipeline helpers ─────────────────────────────────────────────────────────
/**
 * Returns all table names for the given pipeline.
 */
function pipelineTables(isMetaZZ) {
    return {
        service: isMetaZZ ? 'ServiceMetaZZ' : 'Service',
        facture: isMetaZZ ? 'FactureMetaZZ' : 'Facture',
        comprendreService: isMetaZZ
            ? 'ComprendreServiceMetaZZ'
            : 'ComprendreService',
        comprendreProduit: isMetaZZ
            ? 'ComprendreProduitMetaZZ'
            : 'ComprendreProduit',
        intervenir: isMetaZZ ? 'IntervenirMetaZZ' : 'Intervenir',
    };
}
/**
 * Parses the `?metaZZ` query parameter into a boolean.
 */
function parseMetaZZQuery(raw) {
    return raw === 'true' || raw === '1';
}
// =====================================================
// GET /api/services
// Query params:
//   ?metaZZ=true  → MetaZZ pipeline   (privilege enforced here)
//   ?metaZZ=false / absent → Standard pipeline
//   ?scope=mine   → only services created by the authenticated user
//   ?scope=all    → all services (default)
//
// Response includes: service + client + vehicle summary fields,
// plus the linked facture status/date and reduction percentage.
// =====================================================
exports.getAllServices = async (req, res, next) => {
    const metaZZ = parseMetaZZQuery(req.query.metaZZ);
    const { scope } = req.query;
    // ── MetaZZ privilege check ────────────────────────────────────────────────
    if (metaZZ && !verifyMetaZZ(req)) {
        res.status(403).json({
            error: 'Access denied: MetaZZ privilege is required.',
        });
        return;
    }
    // ── Scope: mine vs all ────────────────────────────────────────────────────
    const scopeMine = scope === 'mine';
    const requestingUserId = req.user?.userId ?? null;
    if (scopeMine && !requestingUserId) {
        res.status(400).json({
            error: 'Cannot use scope=mine without an authenticated user.',
        });
        return;
    }
    const { service: sTable, facture: fTable } = pipelineTables(metaZZ);
    try {
        const conditions = [];
        const params = [];
        if (scopeMine) {
            params.push(requestingUserId);
            conditions.push(`s.ServiceCreatedByUserID = $${params.length}`);
        }
        const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
        const result = await dbClient.query(`SELECT
                -- Service core fields
                s.ServiceID,
                s.ServiceLieu,
                s.ServiceNotes,
                s.ServiceStatus,
                s.ServiceCreatedAt,
                s.ServiceCreatedByUserID,
                s.ServiceFactureID,
                -- Client summary
                s.ServiceClientID        AS clientid,
                c.ClientType             AS clienttype,
                c.ClientNom              AS clientnom,
                c.ClientPrenom           AS clientprenom,
                c.ClientRaisonSociale    AS clientraisonsociale,
                c.ClientTel1             AS clienttel1,
                -- Vehicle summary (nullable)
                s.ServiceVehicleID       AS vehicleid,
                v.VehicleMatricule       AS vehiclematricule,
                v.VehicleConstructeur    AS vehicleconstructeur,
                v.VehicleModele          AS vehiclemodele,
                -- Facture summary (nullable)
                f.FactureStatus          AS facturestatus,
                f.FactureDate            AS facturedate,
                f.FactureCreatedAt       AS facturecreatedat,
                -- Facture financial snapshot — LOCKED at creation time, this is
                -- what the facture actually bills at, regardless of later edits
                -- to the global TVA rate or to the linked Reduction record.
                f.FactureTVARate              AS facturetvarate,
                -- Reduction summary (nullable). reductionpourcentage is the
                -- LOCKED value actually applied to this facture (kept under its
                -- historical field name for backwards compatibility with the
                -- frontend); reductionpourcentage_live is the Reduction's
                -- CURRENT setting and may differ if it was edited since.
                r.ReductionID            AS reductionid,
                r.ReductionTitle         AS reductiontitle,
                f.FactureReductionPourcentage AS reductionpourcentage,
                r.ReductionPourcentage   AS reductionpourcentage_live,
                u.username               AS createdbyusername
             FROM ${sTable} s
             JOIN    Client   c ON c.ClientID    = s.ServiceClientID
             LEFT JOIN Vehicle  v ON v.VehicleID   = s.ServiceVehicleID
             LEFT JOIN ${fTable} f ON f.FactureID   = s.ServiceFactureID
             LEFT JOIN Reduction r ON r.ReductionID = f.FactureReductionID
             LEFT JOIN users u ON u.id = s.ServiceCreatedByUserID
             ${whereClause}
             ORDER BY s.ServiceCreatedAt DESC`, params);
        res.status(200).json({
            total: result.rowCount,
            pipeline: metaZZ ? 'metaZZ' : 'standard',
            scope: scopeMine ? 'mine' : 'all',
            services: result.rows,
        });
    }
    catch (err) {
        next(err);
    }
};
// =====================================================
// POST /api/services
//
// Body: {
//   ServiceClientID: string,           (required)
//   ServiceVehicleID?: string | null,
//   ServiceReductionID?: string | null,
//   ServiceLieu?: string,
//   ServiceNotes?: string,
//   ServiceStatus?: string,
//   metaZZ?: boolean,                  ← explicit pipeline selector
//   items: Array<
//     | { type: 'S'; id: string; notes?: string }
//     | { type: 'P'; id: string; qte: number }
//   >
// }
//
// Creation flow (single DB transaction):
//   1. Validate input
//   2. Verify MetaZZ privilege (if metaZZ = true)
//   3. Verify client exists
//   4. Verify vehicle exists + belongs to client (if provided)
//   5. CREATE FACTURE in the correct pipeline table (inherits ReductionID)
//   6. Insert Service into the correct pipeline table (ServiceFactureID → new facture)
//   7. Insert items into the correct ComprendreService/ComprendreProduit table
//   8. COMMIT → return full service payload
// =====================================================
exports.createService = async (req, res, next) => {
    const { ServiceClientID, ServiceVehicleID, ServiceReductionID, ServiceLieu, ServiceNotes, ServiceStatus = 'En cours', metaZZ, items = [], } = req.body;
    const userId = req.user?.userId ?? null;
    // ── Validation ────────────────────────────────────────────────────────────
    if (!ServiceClientID) {
        res.status(400).json({ error: 'ServiceClientID is required.' });
        return;
    }
    if (!Array.isArray(items) || items.length === 0) {
        res.status(400).json({
            error: 'items array is required and must not be empty.',
        });
        return;
    }
    for (const item of items) {
        if (!['S', 'P'].includes(item.type)) {
            res.status(400).json({
                error: `Invalid item type "${item.type}". Must be "S" (ServiceArticle) or "P" (Produit).`,
            });
            return;
        }
        if (!item.id) {
            res.status(400).json({ error: '"id" is required for all items.' });
            return;
        }
        if (item.type === 'P' && !item.qte) {
            res.status(400).json({
                error: 'qte is required for type "P" items.',
            });
            return;
        }
    }
    if (metaZZ !== undefined && typeof metaZZ !== 'boolean') {
        res.status(400).json({ error: 'metaZZ must be a boolean.' });
        return;
    }
    // ── MetaZZ privilege check ────────────────────────────────────────────────
    const isMetaZZ = metaZZ === true;
    if (isMetaZZ && !verifyMetaZZ(req)) {
        res.status(403).json({
            error: 'Access denied: MetaZZ privilege is required.',
        });
        return;
    }
    const { service: sTable, facture: fTable, comprendreService: csTable, comprendreProduit: cpTable, } = pipelineTables(isMetaZZ);
    // ── DB transaction ────────────────────────────────────────────────────────
    try {
        await dbClient.query('BEGIN');
        // ── 1. Verify client ──────────────────────────────────────────────────
        const clientCheck = await dbClient.query(`SELECT ClientID FROM Client WHERE ClientID = $1`, [ServiceClientID]);
        if (clientCheck.rowCount === 0) {
            await dbClient.query('ROLLBACK');
            res.status(404).json({
                error: `Client "${ServiceClientID}" not found.`,
            });
            return;
        }
        // ── 2. Verify vehicle (if provided) ───────────────────────────────────
        if (ServiceVehicleID) {
            const vehicleCheck = await dbClient.query(`SELECT VehicleID FROM Vehicle
                 WHERE VehicleID = $1 AND ClientID = $2`, [ServiceVehicleID, ServiceClientID]);
            if (vehicleCheck.rowCount === 0) {
                await dbClient.query('ROLLBACK');
                res.status(404).json({
                    error: `Vehicle "${ServiceVehicleID}" not found or does not belong to client "${ServiceClientID}".`,
                });
                return;
            }
        }
        // ── 3. Resolve the reduction percentage snapshot ───────────────────────
        // Copy the Reduction's CURRENT percentage now, at facture-creation time.
        // This locked value (not the live Reduction row) is what billing will
        // use forever after, even if the Reduction is edited later.
        let factureReductionPourcentage = 0;
        if (ServiceReductionID) {
            const reductionCheck = await dbClient.query(`SELECT ReductionPourcentage FROM Reduction WHERE ReductionID = $1`, [ServiceReductionID]);
            if (reductionCheck.rowCount === 0) {
                await dbClient.query('ROLLBACK');
                res.status(404).json({
                    error: `Reduction "${ServiceReductionID}" not found.`,
                });
                return;
            }
            factureReductionPourcentage =
                parseFloat(reductionCheck.rows[0].reductionpourcentage) || 0;
        }
        // ── 4. Create Facture in the correct pipeline table ────────────────────
        const factureResult = await dbClient.query(`INSERT INTO ${fTable} (
                FactureDate,
                FactureStatus,
                FactureNotes,
                FactureTVARate,
                FactureReductionPourcentage,
                FactureCreatedAt,
                FactureCreatedByUserID,
                FactureReductionID
             )
             VALUES (NOW(), 'PENDING', NULL, $1, $2, NOW(), $3, $4)
             RETURNING *`, [
            DEFAULT_TVA_RATE,
            factureReductionPourcentage,
            userId,
            ServiceReductionID ?? null,
        ]);
        const facture = factureResult.rows[0];
        const factureId = facture.factureid;
        // ── 5. Insert Service into the correct pipeline table ──────────────────
        const resolvedStatus = ServiceStatus?.trim() || 'En cours';
        const serviceResult = await dbClient.query(`INSERT INTO ${sTable} (
                ServiceLieu,
                ServiceNotes,
                ServiceStatus,
                ServiceCreatedAt,
                ServiceCreatedByUserID,
                ServiceClientID,
                ServiceVehicleID,
                ServiceFactureID
             )
             VALUES ($1, $2, $3, NOW(), $4, $5, $6, $7)
             RETURNING *`, [
            ServiceLieu ?? null,
            ServiceNotes ?? null,
            resolvedStatus,
            userId,
            ServiceClientID,
            ServiceVehicleID ?? null,
            factureId,
        ]);
        const service = serviceResult.rows[0];
        const serviceId = service.serviceid;
        // ── 6. Insert items (snapshotting current prices as we go) ─────────────
        for (const item of items) {
            if (item.type === 'S') {
                // ServiceArticle is a shared master table — no pipeline variant.
                const saCheck = await dbClient.query(`SELECT ServiceArticleID, ServiceArticlePriceHT FROM ServiceArticle
                     WHERE ServiceArticleID = $1`, [item.id]);
                if (saCheck.rowCount === 0) {
                    await dbClient.query('ROLLBACK');
                    res.status(404).json({
                        error: `ServiceArticle "${item.id}" not found.`,
                    });
                    return;
                }
                // PRICE LOCK: snapshot the ServiceArticle's current price into
                // the association row. Billing will read this column forever
                // after — never the live ServiceArticle.ServiceArticlePriceHT.
                const servicePriceHT = parseFloat(saCheck.rows[0].servicearticlepriceht) || 0;
                await dbClient.query(`INSERT INTO ${csTable}
                        (ServiceID, ServiceArticleID, ServiceArticleNotes_ComprendreService, ServicePrixHTPrestation)
                     VALUES ($1, $2, $3, $4)
                     ON CONFLICT (ServiceID, ServiceArticleID) DO NOTHING`, [serviceId, item.id, item.notes ?? null, servicePriceHT]);
            }
            else {
                // type === 'P'  — Produit is also a shared master table.
                const prodCheck = await dbClient.query(`SELECT ProduitID, ProduitQteStock, ProduitPrixUHT FROM Produit
                     WHERE ProduitID = $1`, [item.id]);
                if (prodCheck.rowCount === 0) {
                    await dbClient.query('ROLLBACK');
                    res.status(404).json({
                        error: `Produit "${item.id}" not found.`,
                    });
                    return;
                }
                const stock = prodCheck.rows[0].produitqtestock;
                const requestedQte = Number(item.qte);
                if (stock < requestedQte) {
                    await dbClient.query('ROLLBACK');
                    res.status(409).json({
                        error: `Insufficient stock for Produit "${item.id}". Available: ${stock}, Requested: ${requestedQte}.`,
                    });
                    return;
                }
                // PRICE LOCK: snapshot the Produit's current unit price into the
                // association row. On a repeat insert for the same ServiceID +
                // ProduitID (ON CONFLICT) we deliberately do NOT overwrite the
                // price — only the quantity grows — so the original sale price
                // for this facture is preserved.
                const produitPriceHT = parseFloat(prodCheck.rows[0].produitprixuht) || 0;
                await dbClient.query(`INSERT INTO ${cpTable}
                        (ServiceID, ProduitID, ProduitVenduQte_ComprendreProduit, ProduitPrixUHTVende)
                     VALUES ($1, $2, $3, $4)
                     ON CONFLICT (ServiceID, ProduitID) DO UPDATE
                        SET ProduitVenduQte_ComprendreProduit =
                            ${cpTable}.ProduitVenduQte_ComprendreProduit
                            + EXCLUDED.ProduitVenduQte_ComprendreProduit`, [serviceId, item.id, requestedQte, produitPriceHT]);
                // Produit stock is shared across both pipelines — always update the master table.
                await dbClient.query(`UPDATE Produit
                     SET ProduitQteStock = ProduitQteStock - $1
                     WHERE ProduitID = $2`, [requestedQte, item.id]);
            }
        }
        await dbClient.query('COMMIT');
        const full = await _getServiceWithDetails(serviceId, isMetaZZ);
        res.status(201).json(full);
    }
    catch (err) {
        await dbClient.query('ROLLBACK');
        next(err);
    }
};
// =====================================================
// GET /api/services/:id
// Pipeline is auto-derived from the ServiceID prefix:
//   'SRVN…' (4th char = 'N') → MetaZZ pipeline
//   'SRV…'                   → Standard pipeline
// =====================================================
exports.getServiceById = async (req, res, next) => {
    const id = (Array.isArray(req.params.id) ? req.params.id[0] : req.params.id) || '';
    // Infer pipeline from the ServiceID.
    const isMetaZZ = id.charAt(3) === 'N';
    if (isMetaZZ && !verifyMetaZZ(req)) {
        res.status(403).json({
            error: 'Access denied: MetaZZ privilege is required.',
        });
        return;
    }
    try {
        const result = await _getServiceWithDetails(id, isMetaZZ);
        if (!result) {
            res.status(404).json({ error: `Service "${id}" not found.` });
            return;
        }
        res.status(200).json(result);
    }
    catch (err) {
        next(err);
    }
};
// =====================================================
// GET /api/clients
// Returns all active (non-blocked) clients.
// (Shared master table — no pipeline variant.)
// =====================================================
exports.getClients = async (req, res, next) => {
    try {
        const result = await dbClient.query(`SELECT
                ClientID,
                ClientType,
                ClientNom,
                ClientPrenom,
                ClientRaisonSociale,
                ClientFormJuridique
             FROM Client
             WHERE ClientStatus NOT IN ('Bloqué', 'Inactif', 'Suspendu')
                OR ClientStatus IS NULL
             ORDER BY ClientNom ASC, ClientRaisonSociale ASC`);
        res.status(200).json(result.rows);
    }
    catch (err) {
        next(err);
    }
};
// =====================================================
// GET /api/clients/:id/vehicles
// Returns all vehicles belonging to a given client.
// (Shared master table — no pipeline variant.)
// =====================================================
exports.getClientVehicles = async (req, res, next) => {
    const { id } = req.params;
    try {
        const clientCheck = await dbClient.query(`SELECT ClientID FROM Client WHERE ClientID = $1`, [id]);
        if (clientCheck.rowCount === 0) {
            res.status(404).json({ error: `Client "${id}" not found.` });
            return;
        }
        const result = await dbClient.query(`SELECT
                VehicleID,
                VehicleMatricule,
                VehicleType,
                VehicleConstructeur,
                VehicleModele,
                VehicleAnnee,
                VehicleCarburant,
                VehicleTransmission,
                VehicleKilometrage,
                VehicleCouleur,
                VehicleStatus,
                VehicleNotes
             FROM Vehicle
             WHERE ClientID = $1
             ORDER BY VehicleConstructeur ASC, VehicleModele ASC`, [id]);
        res.status(200).json({
            clientId: id,
            total: result.rowCount,
            vehicles: result.rows,
        });
    }
    catch (err) {
        next(err);
    }
};
// =====================================================
// GET /api/reductions
// Returns all active reductions.
// (Shared master table — no pipeline variant.)
// =====================================================
exports.getReductions = async (req, res, next) => {
    try {
        const result = await dbClient.query(`SELECT
                ReductionID,
                ReductionTitle,
                ReductionDescription,
                ReductionPourcentage,
                ReductionFor,
                ReductionStatus,
                ReductionAuto,
                ReductionMinHTAmount,
                ReductionMaxHTAmount
             FROM Reduction
             WHERE ReductionStatus NOT IN ('Bloqué', 'Inactif', 'Suspendu')
             ORDER BY ReductionPourcentage DESC`);
        res.status(200).json(result.rows);
    }
    catch (err) {
        next(err);
    }
};
// =====================================================
// GET /api/service-articles
// Returns all active ServiceArticles.
// (Shared master table — no pipeline variant.)
// =====================================================
exports.getServiceArticles = async (req, res, next) => {
    try {
        const result = await dbClient.query(`SELECT
                ServiceArticleID,
                ServiceArticleCategory,
                ServiceArticleTitle,
                ServiceArticleDescription,
                ServiceArticlePriceHT,
                ServiceArticleActif
             FROM ServiceArticle
             WHERE ServiceArticleActif = TRUE
             ORDER BY ServiceArticleCategory ASC, ServiceArticleTitle ASC`);
        res.status(200).json(result.rows);
    }
    catch (err) {
        next(err);
    }
};
// =====================================================
// GET /api/products
// Query param: ?inStock=true → only rows where QteStock > 0
// (Shared master table — no pipeline variant.)
// =====================================================
exports.getProducts = async (req, res, next) => {
    const inStockOnly = req.query.inStock === 'true';
    try {
        const result = await dbClient.query(`SELECT
                ProduitID,
                ProduitCategory,
                ProduitName,
                ProduitDescription,
                ProduitPrixUHT,
                ProduitQteStock,
                ProduitSeuilAlerte
             FROM Produit
             ${inStockOnly ? 'WHERE ProduitQteStock > 0' : ''}
             ORDER BY ProduitCategory ASC, ProduitName ASC`);
        res.status(200).json(result.rows);
    }
    catch (err) {
        next(err);
    }
};
// =====================================================
// PUT /api/services/:id/complete
// Marks a service as completed ('Terminé').
// Pipeline is auto-derived from the ServiceID prefix (4th char == 'N' -> MetaZZ).
// Requires the user to be the creator of the service OR have the 'SUPER' privilege.
// =====================================================
exports.completeService = async (req, res, next) => {
    const id = (Array.isArray(req.params.id) ? req.params.id[0] : req.params.id) || '';
    const user = req.user;
    // 1. Check if user is authenticated
    if (!user || !user.userId) {
        res.status(401).json({
            error: 'Non autorisé. Veuillez vous connecter.',
        });
        return;
    }
    // 2. Infer pipeline from the ServiceID (4th character)
    const isMetaZZ = id.charAt(3) === 'N';
    const { service: sTable } = pipelineTables(isMetaZZ);
    // 3. Check MetaZZ privilege if it's a MetaZZ service
    if (isMetaZZ && !verifyMetaZZ(req)) {
        res.status(403).json({
            error: 'Access denied: MetaZZ privilege is required.',
        });
        return;
    }
    try {
        // 4. Fetch the service to check existence, creator, and current status
        const fetchResult = await dbClient.query(`SELECT ServiceID, ServiceStatus, ServiceCreatedByUserID 
             FROM ${sTable} 
             WHERE ServiceID = $1`, [id]);
        if (fetchResult.rowCount === 0) {
            res.status(404).json({ error: `Service "${id}" not found.` });
            return;
        }
        const service = fetchResult.rows[0];
        // 5. Check permissions: Must be SUPER or the creator
        // user.privileges is an array based on your AuthenticatedRequest type
        const hasSuperPrivilege = Array.isArray(user.privileges)
            ? user.privileges.includes('SUPER')
            : false;
        // Postgres returns unquoted columns in lowercase
        const isCreator = service.servicecreatedbyuserid === user.userId;
        console.log(isCreator, hasSuperPrivilege);
        if (!hasSuperPrivilege && !isCreator) {
            res.status(403).json({
                error: 'Accès refusé. Vous devez être le créateur du service ou avoir le privilège SUPER.',
            });
            return;
        }
        // 6. Check if already completed (French status: 'Terminé')
        if (service.servicestatus === 'Terminé') {
            res.status(400).json({
                error: 'Ce service est déjà marqué comme terminé.',
            });
            return;
        }
        // 7. Update the status to 'Terminé'
        const updateResult = await dbClient.query(`UPDATE ${sTable} 
             SET ServiceStatus = 'Terminé' 
             WHERE ServiceID = $1 
             RETURNING *`, [id]);
        res.status(200).json({
            message: 'Service marqué comme terminé avec succès.',
            service: updateResult.rows[0],
        });
    }
    catch (err) {
        next(err);
    }
};
// =====================================================
// INTERNAL HELPER — assembles the full service payload
//
// isMetaZZ is passed explicitly (already resolved by the caller).
//
// Returns:
//   { service, client, vehicle, facture, reduction,
//     servicearticles, produits }
// =====================================================
async function _getServiceWithDetails(serviceId, isMetaZZ) {
    const { service: sTable, facture: fTable, comprendreService: csTable, comprendreProduit: cpTable, } = pipelineTables(isMetaZZ);
    // ── 1. Service + Client + Vehicle + Facture + Reduction ───────────────────
    const serviceResult = await dbClient.query(`SELECT
            -- Service
            s.ServiceID,
            s.ServiceLieu,
            s.ServiceNotes,
            s.ServiceStatus,
            s.ServiceCreatedAt,
            s.ServiceCreatedByUserID,
            s.ServiceClientID,
            s.ServiceVehicleID,
            s.ServiceFactureID,
            -- Client
            c.ClientType,
            c.ClientNom,
            c.ClientPrenom,
            c.ClientRaisonSociale,
            c.ClientICE,
            c.ClientIF,
            c.ClientRC,
            c.ClientEmail,
            c.ClientTel1,
            c.ClientTel2,
            c.ClientVille,
            c.ClientAdresse,
            -- Vehicle (nullable)
            v.VehicleMatricule,
            v.VehicleConstructeur,
            v.VehicleModele,
            v.VehicleAnnee,
            v.VehicleCarburant,
            v.VehicleKilometrage,
            v.VehicleType,
            -- Facture (nullable — LEFT JOIN for safety)
            f.FactureID,
            f.FactureStatus,
            f.FactureDate,
            f.FactureNotes,
            f.FactureCreatedAt,
            f.FactureCreatedByUserID,
            f.FactureReductionID,
            -- Facture financial snapshot — LOCKED at creation time (see
            -- price-locking logic at the top of this file).
            f.FactureTVARate,
            f.FactureReductionPourcentage,
            -- Reduction (nullable) — informational/current config only.
            -- The percentage actually billed is f.FactureReductionPourcentage above.
            r.ReductionID,
            r.ReductionTitle,
            r.ReductionDescription,
            r.ReductionPourcentage,
            r.ReductionFor,
            r.ReductionMinHTAmount,
            r.ReductionMaxHTAmount
         FROM ${sTable} s
         JOIN      Client    c ON c.ClientID    = s.ServiceClientID
         LEFT JOIN Vehicle   v ON v.VehicleID   = s.ServiceVehicleID
         LEFT JOIN ${fTable} f ON f.FactureID   = s.ServiceFactureID
         LEFT JOIN Reduction r ON r.ReductionID = f.FactureReductionID
         WHERE s.ServiceID = $1`, [serviceId]);
    if (serviceResult.rowCount === 0)
        return null;
    const row = serviceResult.rows[0];
    // ── 2. ServiceArticles linked to this service ─────────────────────────────
    // sa.ServiceArticlePriceHT is the article's CURRENT price; the price this
    // facture actually billed is cs.ServicePrixHTPrestation (the locked snapshot).
    const articlesResult = await dbClient.query(`SELECT
            sa.*,
            cs.ServiceArticleNotes_ComprendreService AS servicearticlenotes,
            cs.ServicePrixHTPrestation AS servicepricehtprestation
         FROM ${csTable} cs
         JOIN ServiceArticle sa USING (ServiceArticleID)
         WHERE cs.ServiceID = $1`, [serviceId]);
    // ── 3. Produits linked to this service ────────────────────────────────────
    // p.ProduitPrixUHT is the product's CURRENT price; the price this facture
    // actually billed is cp.ProduitPrixUHTVende (the locked snapshot).
    const produitsResult = await dbClient.query(`SELECT
            p.*,
            cp.ProduitVenduQte_ComprendreProduit AS qtevendue,
            cp.ProduitPrixUHTVende AS produitprixuhtvende
         FROM ${cpTable} cp
         JOIN Produit p USING (ProduitID)
         WHERE cp.ServiceID = $1`, [serviceId]);
    // ── 4. Shape response ─────────────────────────────────────────────────────
    return {
        pipeline: isMetaZZ ? 'metaZZ' : 'standard',
        service: {
            serviceid: row.serviceid,
            servicelieu: row.servicelieu,
            servicenotes: row.servicenotes,
            servicestatus: row.servicestatus,
            servicecreatedat: row.servicecreatedat,
            servicecreatedbyuserid: row.servicecreatedbyuserid,
            servicefactureid: row.servicefactureid ?? null,
        },
        client: {
            clientid: row.serviceclientid,
            clienttype: row.clienttype,
            clientnom: row.clientnom,
            clientprenom: row.clientprenom,
            clientraisonsociale: row.clientraisonsociale,
            clientice: row.clienttype === 'Entreprise' ? row.clientice : null,
            clientif: row.clienttype === 'Entreprise' ? row.clientif : null,
            clientrc: row.clienttype === 'Entreprise' ? row.clientrc : null,
            clientemail: row.clientemail,
            clienttel1: row.clienttel1,
            clienttel2: row.clienttel2,
            clientville: row.clientville,
            clientadresse: row.clientadresse,
        },
        vehicle: row.servicevehicleid
            ? {
                vehicleid: row.servicevehicleid,
                vehiclematricule: row.vehiclematricule,
                vehicleconstructeur: row.vehicleconstructeur,
                vehiclemodele: row.vehiclemodele,
                vehicleannee: row.vehicleannee,
                vehiclecarburant: row.vehiclecarburant,
                vehiclekilometrage: row.vehiclekilometrage,
                vehicletype: row.vehicletype,
            }
            : null,
        facture: row.factureid
            ? {
                factureid: row.factureid,
                facturestatus: row.facturestatus,
                facturedate: row.facturedate,
                facturenotes: row.facturenotes,
                facturecreatedat: row.facturecreatedat,
                facturecreatedbyuserid: row.facturecreatedbyuserid,
                facturereductionid: row.facturereductionid ?? null,
                // Locked at creation — see price-locking logic at top of file.
                facturetvarate: row.facturetvarate,
                facturereductionpourcentage: row.facturereductionpourcentage,
            }
            : null,
        reduction: row.reductionid
            ? {
                reductionid: row.reductionid,
                reductiontitle: row.reductiontitle,
                reductiondescription: row.reductiondescription,
                // This is the Reduction's CURRENT percentage (informational).
                // The percentage actually billed on this facture is
                // facture.facturereductionpourcentage above.
                reductionpourcentage: row.reductionpourcentage,
                reductionfor: row.reductionfor,
                reductionminhtamount: row.reductionminhtamount,
                reductionmaxhtamount: row.reductionmaxhtamount,
            }
            : null,
        servicearticles: articlesResult.rows,
        produits: produitsResult.rows,
    };
}
//# sourceMappingURL=service.controller.js.map