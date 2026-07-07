export type ManageableEntityKey = 'Client' | 'Vehicle' | 'Employee' | 'Fournisseur' | 'Participant' | 'Produit' | 'ServiceArticle' | 'Reduction';
export interface ManageableEntityDef {
    table: string;
    idField: string;
    fields: string[];
    createdAtField?: string;
    createdByField?: string;
}
//# sourceMappingURL=dtmngr.constants.d.ts.map