"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const { Privilege_enum } = require('../../@types/index');
const { dbClient } = require('../../database/connection');
const CaisseAPI = require('../../api/caisse.api');
// =====================================================
// GET /api/live/dashboard/stats
// Returns global counts and monthly revenue.
// ⚠️  MetaZZ pipeline is strictly forbidden — only standard tables are queried.
// =====================================================
exports.getDashboardStats = async (req, res, next) => {
    try {
        const query = `
            SELECT
                -- Total clients count
                (SELECT COUNT(*) FROM Client) AS "totalClients",
                
                -- Total vehicles count
                (SELECT COUNT(*) FROM Vehicle) AS "totalVehicles",
                
                -- Active services (Standard pipeline ONLY)
                (SELECT COUNT(*) FROM Service WHERE ServiceStatus = 'En cours') AS "activeServices"
        `;
        //         -- Monthly revenue (Standard pipeline ONLY — sum of transactions created this month)
        // COALESCE(
        //     (
        //         SELECT SUM(TransactionMountantHT)
        //         FROM Transaction_
        //         WHERE TransactionCreatedAt >= date_trunc('month', CURRENT_DATE)
        //     ),
        //     0
        // ) AS "monthlyRevenue"
        const result = await dbClient.query(query);
        const stats = result.rows[0];
        if (req.user?.privileges.includes(Privilege_enum.MANAGE_FINANCE) ||
            req.user?.privileges.includes(Privilege_enum.SUPER)) {
            const [mainBalance, tvaBalance] = await Promise.all([
                CaisseAPI.getMainCaisseBalance(false, false),
                CaisseAPI.getTVACaisseBalance(false, false),
            ]);
            const SoldeTTC = parseInt(mainBalance, 10) + parseInt(tvaBalance, 10);
            res.status(200).json({
                totalClients: parseInt(stats.totalClients, 10),
                totalVehicles: parseInt(stats.totalVehicles, 10),
                activeServices: parseInt(stats.activeServices, 10),
                soldeTTC: SoldeTTC,
            });
        }
        res.status(200).json({
            totalClients: parseInt(stats.totalClients, 10),
            totalVehicles: parseInt(stats.totalVehicles, 10),
            activeServices: parseInt(stats.activeServices, 10),
        });
    }
    catch (err) {
        next(err);
    }
};
// =====================================================
// GET /api/live/dashboard/recent-services
// Returns the 10 most recent services from the standard pipeline ONLY.
// ⚠️  MetaZZ pipeline is strictly forbidden.
// =====================================================
exports.getRecentServices = async (req, res, next) => {
    try {
        const query = `
            SELECT
                s.ServiceID        AS "serviceId",
                TRIM(
                    COALESCE(c.ClientNom, '')           || ' ' ||
                    COALESCE(c.ClientPrenom, '')        || ' ' ||
                    COALESCE(c.ClientRaisonSociale, '')
                )                  AS "clientName",
                v.VehicleMatricule AS "vehicleMatricule",
                s.ServiceStatus    AS "status",
                s.ServiceCreatedAt AS "createdAt"
            FROM Service s
            JOIN Client c  ON s.ServiceClientID = c.ClientID
            LEFT JOIN Vehicle v ON s.ServiceVehicleID = v.VehicleID
            ORDER BY s.ServiceCreatedAt DESC
            LIMIT 10;
        `;
        const result = await dbClient.query(query);
        res.status(200).json(result.rows);
    }
    catch (err) {
        next(err);
    }
};
// =====================================================
// GET /api/live/dashboard/low-stock
// Returns products where current stock is at or below the alert threshold.
// Note: Produit is a shared master table (no MetaZZ variant).
// =====================================================
exports.getLowStock = async (req, res, next) => {
    try {
        const query = `
            SELECT
                ProduitID          AS "produitId",
                ProduitName        AS "produitName",
                ProduitQteStock    AS "qteStock",
                ProduitSeuilAlerte AS "seuilAlerte"
            FROM Produit
            WHERE ProduitQteStock <= ProduitSeuilAlerte
            ORDER BY ProduitQteStock ASC
            LIMIT 10;
        `;
        const result = await dbClient.query(query);
        res.status(200).json(result.rows);
    }
    catch (err) {
        next(err);
    }
};
//# sourceMappingURL=live.controller.js.map