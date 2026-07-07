"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
// Typing the require statements ensures strict type safety without needing 'as' casts later
const EntityAPI = require('../../api/entity.api');
const ENTITY_CONFIG = require('./entity.config');
// =====================================================
// PARTICIPANT AUTO-CREATION — Constants
// =====================================================
/**
 * Entities that own a Participant row.
 * fkField  — the column on the entity table that holds the ParticipantID FK.
 * participantType — the string stored in Participant.participanttype.
 */
const PARTICIPANT_ENTITIES = {
    Client: { fkField: 'participantid', participantType: 'Client' },
    Employee: { fkField: 'participantid', participantType: 'Employee' },
    Fournisseur: { fkField: 'participantid', participantType: 'Fournisseur' },
};
// =====================================================
// PARTICIPANT AUTO-CREATION — Helpers
// =====================================================
/**
 * Safely retrieves the Participant meta for a given entity.
 * This avoids TypeScript's "Object is possibly 'undefined'" errors
 * when indexing PARTICIPANT_ENTITIES with a dynamic string.
 */
function getParticipantMeta(entity) {
    if (Object.prototype.hasOwnProperty.call(PARTICIPANT_ENTITIES, entity)) {
        return PARTICIPANT_ENTITIES[entity]; // Safe because we just checked hasOwnProperty
    }
    return null;
}
/**
 * Derive a human-readable display name for the Participant row
 * from the entity payload, depending on entity type.
 */
function resolveParticipantName(entity, payload) {
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
            return (String(payload['fournisseurRaisonsociale'] ?? '') ||
                'Fournisseur sans nom');
        }
        default:
            return entity;
    }
}
/**
 * Strip ParticipantBANK / ParticipantRIB out of the payload so they never
 * land in the entity table INSERT/UPDATE, and return them as a typed object.
 * Mutates payload in place.
 */
function extractBankingFields(payload) {
    const participantbank = payload['ParticipantBANK'] != null
        ? String(payload['ParticipantBANK'])
        : null;
    const participantrib = payload['ParticipantRIB'] != null
        ? String(payload['ParticipantRIB'])
        : null;
    delete payload['ParticipantBANK'];
    delete payload['ParticipantRIB'];
    return { participantbank, participantrib };
}
/**
 * Create a Participant row and return its generated ID.
 */
async function createParticipant(entity, payload, banking, userId) {
    const participantConfig = ENTITY_CONFIG['Participant'];
    if (!participantConfig) {
        throw new Error('Participant configuration is missing in ENTITY_CONFIG.');
    }
    // Use the helper to safely get the meta without TypeScript complaining
    const meta = getParticipantMeta(entity);
    if (!meta) {
        throw new Error(`Entity "${entity}" is not a participant-linked entity.`);
    }
    const participantDAO = new EntityAPI(participantConfig.table, participantConfig.idField);
    const now = new Date();
    const participantData = {
        participantname: resolveParticipantName(entity, payload),
        participanttype: meta.participantType, // FIXED: No more 'undefined' error here!
        participantbank: banking.participantbank,
        participantrib: banking.participantrib,
        participantlinked: true,
        [participantConfig.createdByField]: userId,
        [participantConfig.lastEditByField]: userId,
        [participantConfig.createdAtField]: now,
        [participantConfig.lastEditAtField]: now,
    };
    const created = await participantDAO.create(participantData);
    return String(created[participantConfig.idField]);
}
/**
 * Update the Participant row linked to a given entity record.
 */
async function updateParticipant(participantId, entity, mergedPayload, banking, userId) {
    const participantConfig = ENTITY_CONFIG['Participant'];
    if (!participantConfig) {
        throw new Error('Participant configuration is missing in ENTITY_CONFIG.');
    }
    const participantDAO = new EntityAPI(participantConfig.table, participantConfig.idField);
    const now = new Date();
    const updateData = {
        participantname: resolveParticipantName(entity, mergedPayload),
        [participantConfig.lastEditByField]: userId,
        [participantConfig.lastEditAtField]: now,
    };
    if (banking.participantbank !== null)
        updateData['participantbank'] = banking.participantbank;
    if (banking.participantrib !== null)
        updateData['participantrib'] = banking.participantrib;
    await participantDAO.update(participantId, updateData);
}
// =====================================================
// SHARED HELPERS
// =====================================================
function resolveEntityConfig(entityName, res) {
    // No need for 'as' casts anymore because ENTITY_CONFIG is strictly typed
    const config = ENTITY_CONFIG[entityName];
    if (!config) {
        res.status(400).json({
            success: false,
            error: `Unknown entity: "${entityName}". Valid entities are: ${Object.keys(ENTITY_CONFIG).join(', ')}.`,
        });
        return null;
    }
    return config;
}
function getMissingFields(payload, requiredFields) {
    return requiredFields.filter((field) => payload[field] === undefined ||
        payload[field] === null ||
        payload[field] === '');
}
function getImmutableViolations(payload, immutableFields) {
    return immutableFields.filter((field) => field in payload);
}
function resolveCurrentUserId(req, res) {
    const userId = req.user?.userId;
    if (!userId) {
        res.status(401).json({
            success: false,
            error: 'Unauthorized: cannot determine current user.',
        });
        return null;
    }
    return userId;
}
// =====================================================
// CONTROLLERS
// =====================================================
exports.getAll = async (req, res, next) => {
    try {
        const { entity, ownOnly } = req.query;
        if (!entity) {
            res.status(400).json({
                success: false,
                error: 'Query parameter "entity" is required.',
            });
            return;
        }
        const config = resolveEntityConfig(entity, res);
        if (!config)
            return;
        const dao = new EntityAPI(config.table, config.idField);
        let data;
        if (ownOnly === 'true') {
            const userId = resolveCurrentUserId(req, res);
            if (!userId)
                return;
            data = await dao.getWhere({ [config.createdByField]: userId });
        }
        else {
            data = await dao.getAll();
        }
        res.status(200).json({
            success: true,
            entity,
            count: data.length,
            data,
        });
    }
    catch (error) {
        next(error);
    }
};
exports.getById = async (req, res, next) => {
    try {
        const { entity } = req.query;
        const { id } = req.params;
        if (!entity) {
            res.status(400).json({
                success: false,
                error: 'Query parameter "entity" is required.',
            });
            return;
        }
        if (!id) {
            res.status(400).json({
                success: false,
                error: 'Route parameter "id" is required.',
            });
            return;
        }
        const config = resolveEntityConfig(entity, res);
        if (!config)
            return;
        const dao = new EntityAPI(config.table, config.idField);
        const record = await dao.getById(id);
        if (!record) {
            res.status(404).json({
                success: false,
                error: `${entity} with ID "${id}" not found.`,
            });
            return;
        }
        // Use the helper instead of hasOwnProperty + !
        const meta = getParticipantMeta(entity);
        if (meta) {
            const participantId = record[meta.fkField] ?? null;
            if (participantId) {
                const participantConfig = ENTITY_CONFIG['Participant'];
                if (!participantConfig)
                    throw new Error('Missing Participant config');
                const participantDAO = new EntityAPI(participantConfig.table, participantConfig.idField);
                const participant = await participantDAO.getById(participantId);
                if (participant) {
                    record['ParticipantBANK'] =
                        participant['participantbank'] ?? null;
                    record['ParticipantRIB'] =
                        participant['participantrib'] ?? null;
                }
            }
        }
        res.status(200).json({ success: true, entity, data: record });
    }
    catch (error) {
        next(error);
    }
};
exports.create = async (req, res, next) => {
    try {
        const { entity, ...payload } = req.body;
        if (!entity) {
            res.status(400).json({
                success: false,
                error: 'Body field "entity" is required.',
            });
            return;
        }
        const config = resolveEntityConfig(entity, res);
        if (!config)
            return;
        const banking = extractBankingFields(payload);
        // Fallback to [] in case requiredFields is optional in your EntityConfig interface
        const missingFields = getMissingFields(payload, config.requiredFields || []);
        if (missingFields.length > 0) {
            res.status(422).json({
                success: false,
                error: `Missing required fields for ${entity}: ${missingFields.join(', ')}.`,
                missingFields,
            });
            return;
        }
        const userId = resolveCurrentUserId(req, res);
        if (!userId)
            return;
        // Filter out undefined/null fields to prevent issues during deletion
        const autoFields = [
            config.idField,
            config.createdByField,
            config.lastEditByField,
            config.createdAtField,
            config.lastEditAtField,
        ].filter((f) => !!f);
        autoFields.forEach((f) => {
            delete payload[f];
        });
        const meta = getParticipantMeta(entity);
        if (meta) {
            const newParticipantId = await createParticipant(entity, payload, banking, userId);
            payload[meta.fkField] = newParticipantId;
        }
        const now = new Date();
        const dataToInsert = {
            ...payload,
            [config.createdByField]: userId,
            [config.lastEditByField]: userId,
            [config.createdAtField]: now,
            [config.lastEditAtField]: now,
        };
        const dao = new EntityAPI(config.table, config.idField);
        const created = await dao.create(dataToInsert);
        res.status(201).json({
            success: true,
            entity,
            message: `${entity} created successfully.`,
            data: created,
        });
    }
    catch (error) {
        next(error);
    }
};
exports.update = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { entity, ...payload } = req.body;
        if (!entity) {
            res.status(400).json({
                success: false,
                error: 'Body field "entity" is required.',
            });
            return;
        }
        if (!id) {
            res.status(400).json({
                success: false,
                error: 'Route parameter "id" is required.',
            });
            return;
        }
        const config = resolveEntityConfig(entity, res);
        if (!config)
            return;
        const banking = extractBankingFields(payload);
        // Fallback to [] in case immutableFields is optional
        const immutableViolations = getImmutableViolations(payload, config.immutableFields || []);
        if (immutableViolations.length > 0) {
            res.status(422).json({
                success: false,
                error: `The following fields cannot be modified after creation: ${immutableViolations.join(', ')}.`,
                immutableFields: immutableViolations,
            });
            return;
        }
        const hasBankingUpdate = banking.participantbank !== null || banking.participantrib !== null;
        if (Object.keys(payload).length === 0 && !hasBankingUpdate) {
            res.status(400).json({
                success: false,
                error: 'No fields provided to update.',
            });
            return;
        }
        const userId = resolveCurrentUserId(req, res);
        if (!userId)
            return;
        const dao = new EntityAPI(config.table, config.idField);
        const existing = await dao.getById(id);
        if (!existing) {
            res.status(404).json({
                success: false,
                error: `${entity} with ID "${id}" not found.`,
            });
            return;
        }
        const meta = getParticipantMeta(entity);
        if (meta) {
            const participantId = existing[meta.fkField] ?? null;
            if (participantId) {
                const mergedPayload = {
                    ...existing,
                    ...payload,
                };
                await updateParticipant(participantId, entity, mergedPayload, banking, userId);
            }
            else {
                const newParticipantId = await createParticipant(entity, { ...existing, ...payload }, banking, userId);
                payload[meta.fkField] = newParticipantId;
            }
        }
        const now = new Date();
        const dataToUpdate = {
            ...payload,
            [config.lastEditByField]: userId,
            [config.lastEditAtField]: now,
        };
        const updated = await dao.update(id, dataToUpdate);
        res.status(200).json({
            success: true,
            entity,
            message: `${entity} updated successfully.`,
            data: updated,
        });
    }
    catch (error) {
        next(error);
    }
};
exports.remove = async (req, res, next) => {
    try {
        const { id } = req.params;
        const entity = req.body?.entity ||
            req.query?.entity;
        if (!entity) {
            res.status(400).json({
                success: false,
                error: '"entity" is required (provide it in the request body or as a query parameter).',
            });
            return;
        }
        if (!id) {
            res.status(400).json({
                success: false,
                error: 'Route parameter "id" is required.',
            });
            return;
        }
        const config = resolveEntityConfig(entity, res);
        if (!config)
            return;
        const dao = new EntityAPI(config.table, config.idField);
        const existing = await dao.getById(id);
        if (!existing) {
            res.status(404).json({
                success: false,
                error: `${entity} with ID "${id}" not found.`,
            });
            return;
        }
        const meta = getParticipantMeta(entity);
        if (meta) {
            const participantId = existing[meta.fkField] ?? null;
            if (participantId) {
                const participantConfig = ENTITY_CONFIG['Participant'];
                if (!participantConfig)
                    throw new Error('Missing Participant config');
                const participantDAO = new EntityAPI(participantConfig.table, participantConfig.idField);
                await participantDAO.delete(participantId);
            }
        }
        await dao.delete(id);
        res.status(200).json({
            success: true,
            entity,
            message: `${entity} with ID "${id}" deleted successfully.`,
        });
    }
    catch (error) {
        next(error);
    }
};
exports.getEntityConfig = async (req, res, next) => {
    const entity = req.query?.entity;
    if (!entity) {
        res.status(400).json({
            success: false,
            error: '"entity" is required (provide it in the request body or as a query parameter).',
        });
        return;
    }
    const config = resolveEntityConfig(entity, res);
    if (!config)
        return;
    res.status(200).json({
        success: true,
        entityPropsConfig: config.entityPropsConfig,
        requiredFields: config.requiredFields,
        immutableFields: config.immutableFields,
        entityTitle: config.entityTitle,
        titleAction: config.titleAction,
        idField: config.idField,
        noEdit: config.noEdit,
        noCreate: config.noCreate,
    });
};
//# sourceMappingURL=entity.controller.js.map