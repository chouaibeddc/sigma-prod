"use strict";
// routes/dtmngr/dtmngr.constants.ts
//
// Single source of truth for everything the Data Manager module needs to
// know about the schema. Keeping it here (instead of scattered through the
// controller) means adding a table/entity later is a one-place edit.
Object.defineProperty(exports, "__esModule", { value: true });
const MANAGEABLE_ENTITIES = {
    Client: {
        table: 'client',
        idField: 'clientid',
        fields: [
            'clienttype',
            'clientnom',
            'clientprenom',
            'clientraisonsociale',
            'clientformjuridique',
            'clientice',
            'clientif',
            'clientrc',
            'clientemail',
            'clienttel1',
            'clienttel2',
            'clientpays',
            'clientville',
            'clientadresse',
            'clientstatus',
            'clientnotes',
        ],
        createdAtField: 'clientcreatedat',
        createdByField: 'clientcreatedbyuserid',
    },
    Vehicle: {
        table: 'vehicle',
        idField: 'vehicleid',
        fields: [
            'vehiclematricule',
            'vehicletype',
            'vehicleconstructeur',
            'vehiclemodele',
            'vehicleannee',
            'vehiclecarburant',
            'vehicletransmission',
            'vehiclekilometrage',
            'vehiclecouleur',
            'vehiclestatus',
            'vehiclenotes',
            'clientid', // owner — optional, must already exist if provided
        ],
        createdAtField: 'vehiclecreatedat',
        createdByField: 'vehiclecreatedbyuserid',
    },
    Employee: {
        table: 'employee',
        idField: 'employeeid',
        fields: [
            'employeenom',
            'employeeprenom',
            'employeecin',
            'employeedatenaissance',
            'employeepays',
            'employeeville',
            'employeeaddress',
            'employeetel',
            'employeeemail',
            'employeedatederecrutement',
            'employeerole',
            'employeesalairenet',
            'employeematriculationamo',
            'employeestatusfamilliale',
            'employeenbrenfant',
            'employeestatus',
            'employeenotes',
        ],
        createdAtField: 'employeecreatedat',
        createdByField: 'employeecreatedbyuserid',
    },
    Fournisseur: {
        table: 'fournisseur',
        idField: 'fournisseurid',
        fields: [
            'fournisseurraisonsociale',
            'fournisseurice',
            'fournisseurif',
            'fournisseurrc',
            'fournisseuremail',
            'fournisseuremail2',
            'fournisseurtel1',
            'fournisseurtel2',
            'fournisseuradresse',
            'fournisseurpays',
            'fournisseurville',
            'fournisseurwebsite',
        ],
        createdAtField: 'fournisseurcreatedat',
        createdByField: 'fournisseurcreatedbyuserid',
    },
    Participant: {
        table: 'participant',
        idField: 'participantid',
        fields: [
            'participantname',
            'participanttype',
            'participantbank',
            'participantrib',
            'participantlinked',
        ],
        createdAtField: 'participantcreatedat',
        createdByField: 'participantcreatedbyuserid',
    },
    Produit: {
        table: 'produit',
        idField: 'produitid',
        fields: [
            'produitcategory',
            'produitname',
            'produitdescription',
            'produitprixuht',
            'produitqtestock',
            'produitseuilalerte',
        ],
        createdAtField: 'produitcreatedat',
        createdByField: 'produitcreatedbyuserid',
    },
    ServiceArticle: {
        table: 'servicearticle',
        idField: 'servicearticleid',
        fields: [
            'servicearticlecategory',
            'servicearticletitle',
            'servicearticledescription',
            'servicearticlepriceht',
            'servicearticleactif',
        ],
        createdAtField: 'servicearticlecreatedat',
        createdByField: 'servicearticlecreatedbyuserid',
    },
    Reduction: {
        table: 'reduction',
        idField: 'reductionid',
        fields: [
            'reductiontitle',
            'reductiondescription',
            'reductionpourcentage',
            'reductionfor',
            'reductionstatus',
            'reductionauto',
            'reductionminhtamount',
            'reductionmaxhtamount',
        ],
        createdAtField: 'reductioncreatedat',
        createdByField: 'reductioncreatedbyuserid',
    },
};
const MANAGEABLE_ENTITY_KEYS = Object.keys(MANAGEABLE_ENTITIES);
// =====================================================
// PART 2 — Full system state (SGMX Import / Export / Reset / Recreate)
// This is DIRECT dbClient access, on purpose (per spec: this section moves
// the whole DB, not individual business records, so EntityAPI's single-row
// CRUD shape doesn't fit).
//
// Deliberately EXCLUDED from SGMX: refresh_tokens, auth_events.
// Reasoning: those are ephemeral / security-sensitive session data tied to
// *this* server instance (token hashes, IPs). Carrying them into another
// environment would be meaningless at best and a credential-leak risk at
// worst. Everything that represents actual business/system state is
// included. Flip INCLUDE_SESSION_TABLES to true if you disagree.
// =====================================================
const INCLUDE_SESSION_TABLES = false;
// Sequences that back the human-readable IDs (CLI0000000001, ...).
// prefixStrip = how many leading letters to drop to get to the digits.
const ID_SEQUENCES = [
    { table: 'client', idField: 'clientid', sequence: 'seq_client' },
    { table: 'vehicle', idField: 'vehicleid', sequence: 'seq_vehicle' },
    { table: 'employee', idField: 'employeeid', sequence: 'seq_employee' },
    {
        table: 'fournisseur',
        idField: 'fournisseurid',
        sequence: 'seq_fournisseur',
    },
    {
        table: 'servicearticle',
        idField: 'servicearticleid',
        sequence: 'seq_service_article',
    },
    { table: 'reduction', idField: 'reductionid', sequence: 'seq_reduction' },
    { table: 'produit', idField: 'produitid', sequence: 'seq_produit' },
    { table: 'service', idField: 'serviceid', sequence: 'seq_service' },
    { table: 'facture', idField: 'factureid', sequence: 'seq_facture' },
    {
        table: 'transaction_',
        idField: 'transactionid',
        sequence: 'seq_transaction',
    },
    {
        table: 'participant',
        idField: 'participantid',
        sequence: 'seq_participant',
    },
    { table: 'caisse', idField: 'caisseid', sequence: 'seq_caisse' },
    {
        table: 'facturemetazz',
        idField: 'factureid',
        sequence: 'seq_facture_metazz',
    },
    {
        table: 'servicemetazz',
        idField: 'serviceid',
        sequence: 'seq_service_metazz',
    },
    {
        table: 'transactionmetazz',
        idField: 'transactionid',
        sequence: 'seq_transaction_metazz',
    },
];
// Ordered ONLY for readability in the exported file — actual import does
// not depend on this order because FK-checking triggers are disabled for
// the duration of the import (see importSgmxData in dtmngr.controller.ts).
const SGMX_TABLES = [
    'settings',
    'users',
    'participant',
    'client',
    'vehicle',
    'employee',
    'fournisseur',
    'servicearticle',
    'reduction',
    'produit',
    'transaction_',
    'facture',
    'service',
    'caisse',
    'fournir',
    'estpayerpar',
    'comprendreproduit',
    'comprendreservice',
    'intervenir',
    'facturemetazz',
    'servicemetazz',
    'transactionmetazz',
    'estpayerparmetazz',
    'comprendreproduitmetazz',
    'comprendreservicemetazz',
    'intervenirmetazz',
    ...(INCLUDE_SESSION_TABLES ? ['refresh_tokens', 'auth_events'] : []),
];
// Tables that hold real business data (used by the "Reset" tool, which is
// intentionally gentler than "Recreate": it empties data but keeps schema,
// config (settings) and Caisse rows so the app doesn't break on next load).
const RESETTABLE_TABLES = SGMX_TABLES.filter((t) => t !== 'settings' && t !== 'caisse');
const SGMX_FORMAT_NAME = 'SGMX';
const SGMX_FORMAT_VERSION = 1;
module.exports = {
    MANAGEABLE_ENTITIES,
    MANAGEABLE_ENTITY_KEYS,
    INCLUDE_SESSION_TABLES,
    ID_SEQUENCES,
    SGMX_TABLES,
    RESETTABLE_TABLES,
    SGMX_FORMAT_NAME,
    SGMX_FORMAT_VERSION,
};
//# sourceMappingURL=dtmngr.constants.js.map