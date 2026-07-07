"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const fs = require('fs');
const path = require('path');
const { dbClient } = require('../../database/connection');
// Adjust this path to wherever EntityAPI (BaseDAO) actually lives in your
// project — same relative depth as service.controller.ts's dbClient import.
const EntityAPI = require('../../api/entity.api');
const { MANAGEABLE_ENTITIES, MANAGEABLE_ENTITY_KEYS, SGMX_TABLES, RESETTABLE_TABLES, ID_SEQUENCES, SGMX_FORMAT_NAME, SGMX_FORMAT_VERSION, } = require('./dtmngr.constants');
// --- Helper: Replicates entity.controller.ts logic for Participant names ---
// --- Helper: Defines which entities require a linked Participant ---
const PARTICIPANT_ENTITIES = {
    Client: { fkField: 'participantid', participantType: 'Client' },
    Employee: { fkField: 'participantid', participantType: 'Employee' },
    Fournisseur: {
        fkField: 'participantid',
        participantType: 'Fournisseur',
    },
};
const resolveParticipantName = (entity, payload) => {
    switch (entity) {
        case 'Client': {
            const clientType = String(payload['clienttype'] ?? '').toLowerCase();
            if (clientType === 'particulier') {
                const parts = [
                    payload['clientnom'],
                    payload['clientprenom'],
                ].filter(Boolean);
                return parts.join(' ') || 'Client sans nom';
            }
            return (String(payload['clientraisonsociale'] ?? '') ||
                'Entreprise sans nom');
        }
        case 'Employee': {
            const parts = [
                payload['employeenom'],
                payload['employeeprenom'],
            ].filter(Boolean);
            return parts.join(' ') || 'Employé sans nom';
        }
        case 'Fournisseur': {
            // Check both lowercase (from CSV) and original casing just in case
            return (String(payload['fournisseurraisonsociale'] ??
                payload['fournisseurRaisonsociale'] ??
                '') || 'Fournisseur sans nom');
        }
        default:
            return entity;
    }
};
// Path to the raw "recreate from 0" script. Adjust to wherever you keep it
// on the server — this assumes it sits at the backend project root.
const SCHEMA_SQL_PATH = path.join(__dirname, '../../../sqlProcessedVersion15.sql');
// One EntityAPI instance per manageable entity, built once at module load.
const daoFor = Object.fromEntries(MANAGEABLE_ENTITY_KEYS.map((key) => [
    key,
    new EntityAPI(MANAGEABLE_ENTITIES[key].table, MANAGEABLE_ENTITIES[key].idField),
]));
// =====================================================
// GET /api/dtmngr/overview
// =====================================================
exports.getOverview = async (_req, res, next) => {
    try {
        const counts = {};
        for (const key of MANAGEABLE_ENTITY_KEYS) {
            counts[key] = await daoFor[key].count();
        }
        const [serviceCount, factureCount, transactionCount, userCount, dbSizeResult, lowStockResult, recentActivityResult,] = await Promise.all([
            dbClient.query('SELECT COUNT(*) FROM service'),
            dbClient.query('SELECT COUNT(*) FROM facture'),
            dbClient.query('SELECT COUNT(*) FROM transaction_'),
            dbClient.query('SELECT COUNT(*) FROM users'),
            dbClient.query('SELECT pg_size_pretty(pg_database_size(current_database())) AS size'),
            dbClient.query(`SELECT produitid, produitname, produitqtestock, produitseuilalerte
                 FROM produit
                 WHERE produitseuilalerte IS NOT NULL
                   AND produitqtestock IS NOT NULL
                   AND produitqtestock <= produitseuilalerte
                 ORDER BY produitqtestock ASC
                 LIMIT 10`),
            dbClient.query(`SELECT 'client' AS entity, MAX(clientcreatedat) AS last_created FROM client
                 UNION ALL SELECT 'vehicle', MAX(vehiclecreatedat) FROM vehicle
                 UNION ALL SELECT 'service', MAX(servicecreatedat) FROM service
                 UNION ALL SELECT 'facture', MAX(facturecreatedat) FROM facture`),
        ]);
        res.status(200).json({
            manageableEntities: counts,
            operational: {
                services: parseInt(serviceCount.rows[0].count, 10),
                factures: parseInt(factureCount.rows[0].count, 10),
                transactions: parseInt(transactionCount.rows[0].count, 10),
                users: parseInt(userCount.rows[0].count, 10),
            },
            databaseSize: dbSizeResult.rows[0].size,
            lowStockProducts: lowStockResult.rows,
            lastActivity: recentActivityResult.rows,
        });
    }
    catch (err) {
        next(err);
    }
};
// =====================================================
// GET /api/dtmngr/entities
// =====================================================
exports.getManageableEntities = async (_req, res, next) => {
    try {
        res.status(200).json({
            entities: MANAGEABLE_ENTITY_KEYS.map((key) => ({
                key,
                fields: MANAGEABLE_ENTITIES[key].fields,
            })),
        });
    }
    catch (err) {
        next(err);
    }
};
// =====================================================
// POST /api/dtmngr/bulk-import
// =====================================================
// =====================================================
// POST /api/dtmngr/bulk-import
// =====================================================
exports.bulkImport = async (req, res, next) => {
    try {
        const { rows } = req.body;
        if (!Array.isArray(rows) || rows.length === 0) {
            res.status(400).json({ error: 'No rows to import.' });
            return;
        }
        const requestingUserId = req.user?.userId ?? null;
        const results = [];
        // --- NEW: Tracking maps for Vehicle -> Client resolution ---
        const clientRowMap = {}; // Maps 1-based CSV row index to generated ClientID
        const knownClientIds = new Set(); // Caches valid Client IDs (from DB + newly created) to avoid redundant DB queries
        const deferredVehicles = [];
        for (let i = 0; i < rows.length; i++) {
            const raw = rows[i] ?? {};
            const entityKey = String(raw.entity ?? raw.Entity ?? '').trim();
            const def = MANAGEABLE_ENTITIES[entityKey];
            if (!def) {
                results.push({
                    row: i + 1,
                    entity: String(raw.entity ?? ''),
                    status: 'error',
                    error: `Unknown or unsupported entity "${raw.entity}". Allowed: ${MANAGEABLE_ENTITY_KEYS.join(', ')}.`,
                });
                continue;
            }
            // 1. Extract banking fields for Participant creation (case-insensitive due to CSV parser)
            const bankKey = Object.keys(raw).find((k) => k.toLowerCase() === 'participantbank');
            const ribKey = Object.keys(raw).find((k) => k.toLowerCase() === 'participantrib');
            const participantbank = bankKey && raw[bankKey] !== '' && raw[bankKey] !== undefined
                ? String(raw[bankKey])
                : null;
            const participantrib = ribKey && raw[ribKey] !== '' && raw[ribKey] !== undefined
                ? String(raw[ribKey])
                : null;
            // 2. Map standard entity fields
            const data = {};
            for (const field of def.fields) {
                const lowerKey = Object.keys(raw).find((k) => k.toLowerCase() === field);
                if (lowerKey !== undefined) {
                    const value = raw[lowerKey];
                    if (value !== '' && value !== undefined) {
                        data[field] = value;
                    }
                }
            }
            if (def.createdAtField)
                data[def.createdAtField] = new Date();
            if (def.createdByField && requestingUserId) {
                data[def.createdByField] = requestingUserId;
            }
            // --- NEW: Vehicle Client Resolution Logic ---
            if (entityKey === 'Vehicle') {
                const rawClientId = data['clientid'];
                if (rawClientId !== undefined &&
                    rawClientId !== null &&
                    String(rawClientId).trim() !== '') {
                    const strClientId = String(rawClientId).trim();
                    let resolvedClientId = null;
                    // Scenario A: The CSV contains an actual Client ID (e.g., "CLI0000000001")
                    if (strClientId.startsWith('CLI')) {
                        if (knownClientIds.has(strClientId)) {
                            resolvedClientId = strClientId; // Found in cache
                        }
                        else {
                            try {
                                // Check if it exists in the database
                                const exists = await daoFor['Client'].exists(strClientId);
                                if (exists) {
                                    knownClientIds.add(strClientId);
                                    resolvedClientId = strClientId;
                                }
                            }
                            catch (e) {
                                /* Ignore DB check errors, will defer or fail later */
                            }
                        }
                    }
                    // Scenario B: The CSV contains a Row Number reference (e.g., "5")
                    if (!resolvedClientId) {
                        const rowNum = parseInt(strClientId, 10);
                        if (!isNaN(rowNum) && clientRowMap[rowNum]) {
                            resolvedClientId = clientRowMap[rowNum]; // Client was already processed in an earlier row
                        }
                        else {
                            // Client hasn't been processed yet (it appears later in the CSV). Defer this Vehicle.
                            deferredVehicles.push({
                                rowIndex: i + 1,
                                rawClientId: strClientId,
                                data,
                            });
                            continue; // Skip to next row in the main loop
                        }
                    }
                    data['clientid'] = resolvedClientId;
                }
                else {
                    // Empty clientid, remove it so it inserts as NULL (if DB allows)
                    delete data['clientid'];
                }
            }
            try {
                // 3. Auto-create Participant if the entity requires it
                const meta = PARTICIPANT_ENTITIES[entityKey];
                if (meta) {
                    const participantName = resolveParticipantName(entityKey, data);
                    const participantData = {
                        participantname: participantName,
                        participanttype: meta.participantType,
                        participantbank: participantbank,
                        participantrib: participantrib,
                        participantlinked: true,
                    };
                    const participantDef = MANAGEABLE_ENTITIES['Participant'];
                    if (participantDef.createdAtField)
                        participantData[participantDef.createdAtField] =
                            new Date();
                    if (participantDef.createdByField && requestingUserId) {
                        participantData[participantDef.createdByField] =
                            requestingUserId;
                    }
                    const createdParticipant = await daoFor['Participant'].create(participantData);
                    data[meta.fkField] = createdParticipant['participantid'];
                }
                // 4. Create the main entity record
                const created = await daoFor[entityKey].create(data);
                // --- NEW: Track newly created Client for future Vehicle resolution ---
                if (entityKey === 'Client') {
                    const newClientId = created?.[def.idField];
                    if (newClientId) {
                        clientRowMap[i + 1] = newClientId;
                        knownClientIds.add(newClientId);
                    }
                }
                results.push({
                    row: i + 1,
                    entity: entityKey,
                    status: 'created',
                    id: created?.[def.idField],
                });
            }
            catch (rowErr) {
                results.push({
                    row: i + 1,
                    entity: entityKey,
                    status: 'error',
                    error: rowErr?.message ?? 'Insert failed.',
                });
            }
        }
        // --- NEW: Process Deferred Vehicles (Clients are now guaranteed to be created) ---
        for (const deferred of deferredVehicles) {
            let resolvedClientId = null;
            if (deferred.rawClientId.startsWith('CLI')) {
                // It started with CLI but wasn't found in DB or cache. It's an invalid ID.
                results.push({
                    row: deferred.rowIndex,
                    entity: 'Vehicle',
                    status: 'error',
                    error: `Client ID "${deferred.rawClientId}" does not exist in the database.`,
                });
                continue;
            }
            const rowNum = parseInt(deferred.rawClientId, 10);
            if (!isNaN(rowNum) && clientRowMap[rowNum]) {
                resolvedClientId = clientRowMap[rowNum];
            }
            if (resolvedClientId) {
                deferred.data['clientid'] = resolvedClientId;
                try {
                    const created = await daoFor['Vehicle'].create(deferred.data);
                    results.push({
                        row: deferred.rowIndex,
                        entity: 'Vehicle',
                        status: 'created',
                        id: created?.vehicleid,
                    });
                }
                catch (rowErr) {
                    results.push({
                        row: deferred.rowIndex,
                        entity: 'Vehicle',
                        status: 'error',
                        error: rowErr?.message ?? 'Insert failed.',
                    });
                }
            }
            else {
                results.push({
                    row: deferred.rowIndex,
                    entity: 'Vehicle',
                    status: 'error',
                    error: `Could not resolve client reference "${deferred.rawClientId}". Ensure the Client row exists and its row number matches.`,
                });
            }
        }
        // --- NEW: Sort results by row number to maintain original CSV order in the UI ---
        results.sort((a, b) => a.row - b.row);
        const created = results.filter((r) => r.status === 'created').length;
        const failed = results.length - created;
        res.status(failed === 0 ? 201 : 207).json({
            total: results.length,
            created,
            failed,
            results,
        });
    }
    catch (err) {
        next(err);
    }
};
// =====================================================
// POST /api/dtmngr/bulk-import
// =====================================================
// exports.bulkImport = async (
//     req: AuthenticatedRequest,
//     res: Response,
//     next: NextFunction,
// ): Promise<void> => {
//     try {
//         const { rows } = req.body as { rows?: Record<string, any>[] };
//         if (!Array.isArray(rows) || rows.length === 0) {
//             res.status(400).json({ error: 'No rows to import.' });
//             return;
//         }
//         const requestingUserId = req.user?.userId ?? null;
//         const results: {
//             row: number;
//             entity: string;
//             status: 'created' | 'error';
//             id?: string;
//             error?: string;
//         }[] = [];
//         for (let i = 0; i < rows.length; i++) {
//             const raw = rows[i] ?? {};
//             const entityKey = String(
//                 raw.entity ?? raw.Entity ?? '',
//             ).trim() as ManageableEntityKey;
//             const def = MANAGEABLE_ENTITIES[entityKey];
//             if (!def) {
//                 results.push({
//                     row: i + 1,
//                     entity: String(raw.entity ?? ''),
//                     status: 'error',
//                     error: `Unknown or unsupported entity "${raw.entity}". Allowed: ${MANAGEABLE_ENTITY_KEYS.join(', ')}.`,
//                 });
//                 continue;
//             }
//             // 1. Extract banking fields for Participant creation (case-insensitive due to CSV parser)
//             const bankKey = Object.keys(raw).find(
//                 (k) => k.toLowerCase() === 'participantbank',
//             );
//             const ribKey = Object.keys(raw).find(
//                 (k) => k.toLowerCase() === 'participantrib',
//             );
//             const participantbank =
//                 bankKey && raw[bankKey] !== '' && raw[bankKey] !== undefined
//                     ? String(raw[bankKey])
//                     : null;
//             const participantrib =
//                 ribKey && raw[ribKey] !== '' && raw[ribKey] !== undefined
//                     ? String(raw[ribKey])
//                     : null;
//             // 2. Map standard entity fields
//             const data: Record<string, any> = {};
//             for (const field of def.fields) {
//                 const lowerKey = Object.keys(raw).find(
//                     (k) => k.toLowerCase() === field,
//                 );
//                 if (lowerKey !== undefined) {
//                     const value = raw[lowerKey];
//                     if (value !== '' && value !== undefined) {
//                         data[field] = value;
//                     }
//                 }
//             }
//             if (def.createdAtField) data[def.createdAtField] = new Date();
//             if (def.createdByField && requestingUserId) {
//                 data[def.createdByField] = requestingUserId;
//             }
//             try {
//                 // 3. Auto-create Participant if the entity requires it
//                 const meta = PARTICIPANT_ENTITIES[entityKey];
//                 if (meta) {
//                     const participantName = resolveParticipantName(
//                         entityKey,
//                         data,
//                     );
//                     const participantData: Record<string, any> = {
//                         participantname: participantName,
//                         participanttype: meta.participantType,
//                         participantbank: participantbank,
//                         participantrib: participantrib,
//                         participantlinked: true,
//                     };
//                     // Stamp tracking fields for the Participant
//                     const participantDef = MANAGEABLE_ENTITIES['Participant'];
//                     if (participantDef.createdAtField)
//                         participantData[participantDef.createdAtField] =
//                             new Date();
//                     if (participantDef.createdByField && requestingUserId) {
//                         participantData[participantDef.createdByField] =
//                             requestingUserId;
//                     }
//                     // Create the Participant and get its ID
//                     const createdParticipant =
//                         await daoFor['Participant'].create(participantData);
//                     // Inject the generated Participant ID into the main entity's data
//                     data[meta.fkField] = createdParticipant['participantid'];
//                 }
//                 // 4. Create the main entity record
//                 const created = await daoFor[entityKey].create(data);
//                 results.push({
//                     row: i + 1,
//                     entity: entityKey,
//                     status: 'created',
//                     id: created?.[def.idField],
//                 });
//             } catch (rowErr: any) {
//                 results.push({
//                     row: i + 1,
//                     entity: entityKey,
//                     status: 'error',
//                     error: rowErr?.message ?? 'Insert failed.',
//                 });
//             }
//         }
//         const created = results.filter((r) => r.status === 'created').length;
//         const failed = results.length - created;
//         res.status(failed === 0 ? 201 : 207).json({
//             total: results.length,
//             created,
//             failed,
//             results,
//         });
//     } catch (err) {
//         next(err);
//     }
// };
// exports.bulkImport = async (
//     req: AuthenticatedRequest,
//     res: Response,
//     next: NextFunction,
// ): Promise<void> => {
//     try {
//         const { rows } = req.body as { rows?: Record<string, any>[] };
//         if (!Array.isArray(rows) || rows.length === 0) {
//             res.status(400).json({ error: 'No rows to import.' });
//             return;
//         }
//         // [FIXED] The 5000 rows limit has been completely removed.
//         const requestingUserId = req.user?.userId ?? null;
//         const results: {
//             row: number;
//             entity: string;
//             status: 'created' | 'error';
//             id?: string;
//             error?: string;
//         }[] = [];
//         for (let i = 0; i < rows.length; i++) {
//             const raw = rows[i] ?? {};
//             const entityKey = String(
//                 raw.entity ?? raw.Entity ?? '',
//             ).trim() as ManageableEntityKey;
//             const def = MANAGEABLE_ENTITIES[entityKey];
//             if (!def) {
//                 results.push({
//                     row: i + 1,
//                     entity: String(raw.entity ?? ''),
//                     status: 'error',
//                     error: `Unknown or unsupported entity "${raw.entity}". Allowed: ${MANAGEABLE_ENTITY_KEYS.join(', ')}.`,
//                 });
//                 continue;
//             }
//             const data: Record<string, any> = {};
//             for (const field of def.fields) {
//                 const lowerKey = Object.keys(raw).find(
//                     (k) => k.toLowerCase() === field,
//                 );
//                 if (lowerKey !== undefined) {
//                     const value = raw[lowerKey];
//                     if (value !== '' && value !== undefined) {
//                         data[field] = value;
//                     }
//                 }
//             }
//             if (def.createdAtField) data[def.createdAtField] = new Date();
//             if (def.createdByField && requestingUserId) {
//                 data[def.createdByField] = requestingUserId;
//             }
//             try {
//                 const created = await daoFor[entityKey].create(data);
//                 results.push({
//                     row: i + 1,
//                     entity: entityKey,
//                     status: 'created',
//                     id: created?.[def.idField],
//                 });
//             } catch (rowErr: any) {
//                 results.push({
//                     row: i + 1,
//                     entity: entityKey,
//                     status: 'error',
//                     error: rowErr?.message ?? 'Insert failed.',
//                 });
//             }
//         }
//         const created = results.filter((r) => r.status === 'created').length;
//         const failed = results.length - created;
//         res.status(failed === 0 ? 201 : 207).json({
//             total: results.length,
//             created,
//             failed,
//             results,
//         });
//     } catch (err) {
//         next(err);
//     }
// };
// =====================================================
// Shared helper — full-table dump
// =====================================================
async function dumpTable(table) {
    const result = await dbClient.query(`SELECT * FROM "${table}"`);
    return result.rows;
}
// =====================================================
// GET /api/dtmngr/sgmx/export
// =====================================================
exports.exportSgmx = async (_req, res, next) => {
    try {
        const tables = {};
        for (const table of SGMX_TABLES) {
            tables[table] = await dumpTable(table);
        }
        const sequences = {};
        for (const { sequence } of ID_SEQUENCES) {
            const result = await dbClient.query(`SELECT last_value FROM ${sequence}`);
            sequences[sequence] = parseInt(result.rows[0].last_value, 10);
        }
        const payload = {
            format: SGMX_FORMAT_NAME,
            version: SGMX_FORMAT_VERSION,
            exportedAt: new Date().toISOString(),
            tableCount: SGMX_TABLES.length,
            rowCount: Object.values(tables).reduce((sum, rows) => sum + rows.length, 0),
            sequences,
            tables,
        };
        const filename = `system-export-${new Date()
            .toISOString()
            .replace(/[:.]/g, '-')}.sgmx`;
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.status(200).send(JSON.stringify(payload));
    }
    catch (err) {
        next(err);
    }
};
// =====================================================
// Shared helper — insert rows
// =====================================================
async function insertRows(table, rows) {
    for (const row of rows) {
        const keys = Object.keys(row);
        if (keys.length === 0)
            continue;
        const columns = keys.map((k) => `"${k}"`).join(', ');
        const placeholders = keys.map((_, i) => `$${i + 1}`).join(', ');
        const values = keys.map((k) => row[k]);
        await dbClient.query(`INSERT INTO "${table}" (${columns}) VALUES (${placeholders})`, values);
    }
}
function maxNumericSuffix(rows, idField) {
    let max = 0;
    for (const row of rows) {
        const raw = String(row[idField] ?? '');
        const match = raw.match(/(\d+)$/);
        if (match) {
            max = Math.max(max, parseInt(match[1], 10));
        }
    }
    return max;
}
// =====================================================
// POST /api/dtmngr/sgmx/import
// =====================================================
exports.importSgmx = async (req, res, next) => {
    const body = req.body;
    if (body?.format !== SGMX_FORMAT_NAME || !body?.tables) {
        res.status(400).json({
            error: 'This does not look like a valid .sgmx file.',
        });
        return;
    }
    if (body.version !== SGMX_FORMAT_VERSION) {
        res.status(400).json({
            error: `Unsupported SGMX version "${body.version}". Expected ${SGMX_FORMAT_VERSION}.`,
        });
        return;
    }
    try {
        await dropAllTables();
        await runSchemaScript();
        await dbClient.query('TRUNCATE TABLE settings, caisse');
        await dbClient.query('BEGIN');
        try {
            for (const table of SGMX_TABLES) {
                await dbClient.query(`ALTER TABLE "${table}" DISABLE TRIGGER ALL`);
            }
            for (const table of SGMX_TABLES) {
                const rows = body.tables[table] ?? [];
                await insertRows(table, rows);
            }
            for (const table of SGMX_TABLES) {
                await dbClient.query(`ALTER TABLE "${table}" ENABLE TRIGGER ALL`);
            }
            await dbClient.query('COMMIT');
        }
        catch (loadErr) {
            await dbClient.query('ROLLBACK');
            throw loadErr;
        }
        for (const { table, idField, sequence } of ID_SEQUENCES) {
            const rows = body.tables[table] ?? [];
            const fromData = maxNumericSuffix(rows, idField);
            const fromExport = body.sequences?.[sequence] ?? 0;
            const target = Math.max(fromData, fromExport);
            if (target > 0) {
                await dbClient.query(`SELECT setval($1, $2, true)`, [
                    sequence,
                    target,
                ]);
            }
        }
        const rowCount = Object.values(body.tables).reduce((sum, rows) => sum + (rows?.length ?? 0), 0);
        res.status(200).json({
            message: 'System state imported successfully.',
            tablesLoaded: Object.keys(body.tables).length,
            rowsLoaded: rowCount,
        });
    }
    catch (err) {
        next(err);
    }
};
// =====================================================
// Shared helpers — tear down / rebuild
// =====================================================
async function dropAllTables() {
    await dbClient.query(`DO $$ DECLARE r RECORD; BEGIN FOR r IN (SELECT tablename FROM pg_tables WHERE schemaname = 'public') LOOP EXECUTE 'DROP TABLE IF EXISTS public.' || quote_ident(r.tablename) || ' CASCADE'; END LOOP; END $$;`);
}
async function runSchemaScript() {
    const sql = fs.readFileSync(SCHEMA_SQL_PATH, 'utf8');
    await dbClient.query(sql);
}
// =====================================================
// POST /api/dtmngr/reset
// =====================================================
exports.resetData = async (req, res, next) => {
    const { confirm, includeUsers } = req.body;
    if (confirm !== true) {
        res.status(400).json({
            error: 'This is a destructive action. Resend with { confirm: true }.',
        });
        return;
    }
    try {
        const tables = RESETTABLE_TABLES.filter((t) => includeUsers === true || t !== 'users');
        await dbClient.query(`TRUNCATE TABLE ${tables.map((t) => `"${t}"`).join(', ')} CASCADE`);
        for (const { sequence } of ID_SEQUENCES) {
            await dbClient.query(`ALTER SEQUENCE ${sequence} RESTART WITH 1`);
        }
        res.status(200).json({
            message: `Reset complete. ${tables.length} tables emptied.`,
            tables,
        });
    }
    catch (err) {
        next(err);
    }
};
// =====================================================
// POST /api/dtmngr/recreate
// =====================================================
exports.recreateDatabase = async (req, res, next) => {
    const { confirm } = req.body;
    if (confirm !== 'RECREATE') {
        res.status(400).json({
            error: 'This wipes the entire database. Resend with { confirm: "RECREATE" }.',
        });
        return;
    }
    try {
        await dropAllTables();
        await runSchemaScript();
        res.status(200).json({
            message: 'Database dropped and recreated from sqlProcessedVersion15.sql.',
        });
    }
    catch (err) {
        next(err);
    }
};
//# sourceMappingURL=dtmngr.controller.js.map