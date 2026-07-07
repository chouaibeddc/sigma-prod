"use strict";
/**
 * Global Enums / Types for the System (SIGMA)
 * Define these here so they can be shared across Models, Middleware, and Controllers.
 */
Object.defineProperty(exports, "__esModule", { value: true });
/* Privilege Type */
var Privilege_enum;
(function (Privilege_enum) {
    Privilege_enum["SUPER"] = "SUPER";
    /* Admin Privileges */
    Privilege_enum["MANAGE_USERS"] = "MANAGE_USERS";
    Privilege_enum["MANAGE_SETTINGS"] = "MANAGE_SETTINGS";
    /* Manage Services */
    Privilege_enum["GET_ALL_SERVICES"] = "GET_ALL_SERVICES";
    Privilege_enum["GET_SERVICES"] = "GET_SERVICES";
    /* Manage Entitys */
    Privilege_enum["MANAGE_ENTITY"] = "MANAGE_ENTITY";
    Privilege_enum["MANAGE_CLIENT"] = "MANAGE_CLIENT";
    Privilege_enum["MANAGE_VEHICLE"] = "MANAGE_VEHICLE";
    Privilege_enum["MANAGE_EMPLOYEE"] = "MANAGE_EMPLOYEE";
    Privilege_enum["MANAGE_FOURNISSEUR"] = "MANAGE_FOURNISSEUR";
    Privilege_enum["MANAGE_SERVICEARTICLE"] = "MANAGE_SERVICEARTICLE";
    Privilege_enum["MANAGE_PRODUIT"] = "MANAGE_PRODUIT";
    Privilege_enum["MANAGE_REDUCTION"] = "MANAGE_REDUCTION";
    Privilege_enum["GET_TRANSACTION"] = "GET_TRANSACTION";
    Privilege_enum["CREAT_TRANSACTION"] = "CREAT_TRANSACTION";
    Privilege_enum["GET_CAISSE"] = "GET_CAISSE";
    Privilege_enum["MANAGE_FINANCE"] = "MANAGE_FINANCE";
    Privilege_enum["MANAGE_PARTICIPANT"] = "MANAGE_PARTICIPANT";
    Privilege_enum["CREAT_ORDER"] = "CREAT_ORDER";
})(Privilege_enum || (Privilege_enum = {}));
/* Role Type */
var Role_enum;
(function (Role_enum) {
    Role_enum["ADMIN"] = "ADMIN";
    Role_enum["MANAGER"] = "MANAGER";
    Role_enum["ACCOUNTANT"] = "ACCOUNTANT";
    Role_enum["TECHNICIAN"] = "TECHNICIAN";
})(Role_enum || (Role_enum = {}));
module.exports = { Privilege_enum };
//# sourceMappingURL=index.js.map