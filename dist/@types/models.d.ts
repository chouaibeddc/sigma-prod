export interface User {
    id: string;
    username: string;
    password_hash: string;
    role: string;
    privileges: string[];
    is_active: boolean;
    created_at: Date;
    updated_at: Date;
    createdbyuserid?: string | null;
    updatedbyuserid?: string | null;
    last_login?: Date | null;
    profile_image?: string | null;
}
export interface Client {
    clientid: string;
    clienttype?: string | null;
    clientnom?: string | null;
    clientprenom?: string | null;
    clientraisonsociale?: string | null;
    clientformjuridique?: string | null;
    clientice?: string | null;
    clientif?: string | null;
    clientrc?: string | null;
    clientemail?: string | null;
    clienttel1?: string | null;
    clienttel2?: string | null;
    clientpays?: string | null;
    clientville?: string | null;
    clientadresse?: string | null;
    clientstatus?: string | null;
    clientnotes?: string | null;
    clientcreatedat?: Date | null;
    clientcreatedbyuserid?: string | null;
    clientlasteditat?: Date | null;
    clientlasteditbyuserid?: string | null;
    participantid?: string | null;
}
export interface Vehicle {
    vehicleid: string;
    vehiclematricule?: string | null;
    vehicletype?: string | null;
    vehicleconstructeur?: string | null;
    vehiclemodele?: string | null;
    vehicleannee?: number | null;
    vehiclecarburant?: string | null;
    vehicletransmission?: string | null;
    vehiclekilometrage?: number | null;
    vehiclecouleur?: string | null;
    vehiclestatus?: string | null;
    vehiclenotes?: string | null;
    vehiclecreatedat?: Date | null;
    vehiclecreatedbyuserid?: string | null;
    vehiclelasteditat?: Date | null;
    vehiclelasteditbyuserid?: string | null;
    clientid?: string | null;
}
export interface Employee {
    employeeid: string;
    employeenom?: string | null;
    employeeprenom?: string | null;
    employeecin?: string | null;
    employeedatenaissance?: Date | null;
    employeepays?: string | null;
    employeeville?: string | null;
    employeeaddress?: string | null;
    employeetel?: string | null;
    employeeemail?: string | null;
    employeedatedeRecrutement?: Date | null;
    employeerole?: string | null;
    employeesalairenet?: number | null;
    employeematriculation_amo?: string | null;
    employeestatusfamilliale?: string | null;
    employeenbrenFant?: number | null;
    employeestatus?: string | null;
    employeenotes?: string | null;
    employeecreatedat?: Date | null;
    employeecreatedbyuserid?: string | null;
    employeelasteditat?: Date | null;
    employeelasteditbyuserid?: string | null;
    participantid?: string | null;
}
export interface ServiceArticle {
    servicearticleid: string;
    servicearticlecategory?: string | null;
    servicearticletitle?: string | null;
    servicearticledescription?: string | null;
    servicearticlepriceht?: number | null;
    servicearticleactif?: boolean | null;
    servicearticlecreatedat?: Date | null;
    servicearticlecreatedbyuserid?: string | null;
    servicearticlelasteditat?: Date | null;
    servicearticlelasteditbyuserid?: string | null;
}
export interface Reduction {
    reductionid: string;
    reductiontitle?: string | null;
    reductiondescription?: string | null;
    reductionpourcentage?: number | null;
    reductionfor?: string | null;
    reductionstatus?: string | null;
    reductionauto?: boolean | null;
    reductionminhtamount?: number | null;
    reductionmaxhtamount?: number | null;
    reductioncreatedat?: Date | null;
    reductioncreatedbyuserid?: string | null;
    reductionlasteditat?: Date | null;
    reductionlasteditbyuserid?: string | null;
}
export interface Produit {
    produitid: string;
    produitcategory?: string | null;
    produitname?: string | null;
    produitdescription?: string | null;
    produitprixuht?: number | null;
    produitqtestock?: number | null;
    produitseuillalerte?: number | null;
    produitcreatedat?: Date | null;
    produitcreatedbyuserid?: string | null;
    produitlasteditat?: Date | null;
    produitlasteditbyuserid?: string | null;
}
export interface Fournisseur {
    fournisseurid: string;
    fournisseurRaisonsociale?: string | null;
    fournisseurice?: string | null;
    fournisseurif?: string | null;
    fournisseurrc?: string | null;
    fournisseuremail?: string | null;
    fournisseuremail2?: string | null;
    fournisseurtel1?: string | null;
    fournisseurtel2?: string | null;
    fournisseuradresse?: string | null;
    fournisseurpays?: string | null;
    fournisseurville?: string | null;
    fournisseurwebsite?: string | null;
    fournisseurcreatedat?: Date | null;
    fournisseurcreatedbyuserid?: string | null;
    fournisseurlasteditat?: Date | null;
    fournisseurlasteditbyuserid?: string | null;
    participantid?: string | null;
}
export interface Participant {
    participantid: string;
    participantname?: string | null;
    participanttype?: string | null;
    participantbank?: string | null;
    participantrib?: string | null;
    participantlinked?: boolean | null;
    participantcreatedat?: Date | null;
    participantcreatedbyuserid?: string | null;
    participantlasteditat?: Date | null;
    participantlasteditbyuserid?: string | null;
}
export interface Transaction_ {
    transactionid: string;
    transactiontype?: string | null;
    transactionpaymentmethod?: string | null;
    transactionmountantht?: number | null;
    transactiontvarate?: number | null;
    transactionfees?: number | null;
    transactionfeestvarate?: number | null;
    transactiontvadeclaredat?: Date | null;
    transactiondescription?: string | null;
    transactionMetaZZ: boolean;
    transactioncreatedat?: Date | null;
    transactioncreatedbyuserid?: string | null;
    participantid?: string | null;
}
export interface Service {
    serviceid: string;
    servicelieu?: string | null;
    servicenotes?: string | null;
    serviceMetaZZ: boolean;
    servicestatus?: string | null;
    servicecreatedat?: Date | null;
    servicecreatedbyuserid?: string | null;
    serviceclientid?: string | null;
    servicevehicleid?: string | null;
    servicefactureid?: string | null;
}
export interface Facture {
    factureid: string;
    facturedate?: Date | null;
    facturestatus?: string | null;
    facturetvarate?: number | null;
    facturereductionid?: string | null;
    facturereductionpourcentage?: number | null;
    facturenotes?: string | null;
    factureMetaZZ: boolean;
    facturecreatedat?: Date | null;
    facturecreatedbyuserid?: string | null;
}
export interface Caisse {
    caisseid: string;
    caissename: string;
    caissemountant: number;
    caissemetaZZ: boolean;
    caisselasteditbyuserid: string | null;
    caisselasteditat: Date | null;
}
export interface Fournir {
    fournisseurid: string;
    produitid: string;
    articleprodid__fournir?: string | null;
    articleprixuht__fournir?: number | null;
    articledelaideLivraison_fournir?: number | null;
}
export interface EstPayerPar {
    factureid: string;
    transactionid: string;
}
export interface ComprendreProduit {
    serviceid: string;
    produitid: string;
    produitvenduqte_comprendreproduit?: number | null;
    produitprixuhtvende?: number | null;
}
export interface ComprendreService {
    serviceid: string;
    servicearticleid: string;
    servicearticlenotes_comprendreservice?: string | null;
    serviceprixhtprestation?: number | null;
}
export interface Intervenir {
    employeeid: string;
    serviceid: string;
    employeeservicenotes_intervenir?: string | null;
}
export interface EntityPropConfig {
    prop: string;
    label: string;
    actions: number;
    type?: string;
    order?: number;
}
export interface EntityConfig {
    table: string;
    entityTitle: string;
    titleAction?: string;
    idField: string;
    createdByField: string;
    lastEditByField: string;
    createdAtField: string;
    lastEditAtField: string;
    entityPropsConfig: EntityPropConfig[];
    requiredFields: string[];
    immutableFields: string[];
    noEdit?: boolean;
    noCreate?: boolean;
}
export type CreateUser = Omit<User, 'id' | 'created_at' | 'updated_at'> & {
    id?: string;
    created_at?: Date;
    updated_at?: Date;
};
export type CreateClient = Omit<Client, 'clientid' | 'clientcreatedat' | 'clientlasteditat'> & {
    clientid?: string;
    clientcreatedat?: Date;
    clientlasteditat?: Date;
};
export interface ClientWithRelations extends Client {
    vehicles?: Vehicle[];
    participant?: Participant | null;
    services?: Service[];
}
export interface ServiceWithRelations extends Service {
    client?: Client | null;
    vehicle?: Vehicle | null;
    facture?: Facture | null;
    produits?: (ComprendreProduit & {
        produit: Produit;
    })[];
    servicesArticles?: (ComprendreService & {
        serviceArticle: ServiceArticle;
    })[];
    employees?: (Intervenir & {
        employee: Employee;
    })[];
}
export interface FactureWithRelations extends Facture {
    reductions?: Reduction[];
    transactions?: Transaction_[];
    services?: Service[];
}
//# sourceMappingURL=models.d.ts.map