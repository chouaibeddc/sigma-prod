export interface RefreshTokenRow {
    id: string;
    user_id: string;
    token_hash: string;
    created_at: Date;
    expires_at: Date;
    last_used_at: Date | null;
    created_ip: string | null;
    last_used_ip: string | null;
    user_agent: string | null;
}
export interface AuthEventRow {
    id: string;
    user_id: string | null;
    event_type: string;
    created_at: Date;
    ip_address: string | null;
    user_agent: string | null;
    details: Record<string, any> | null;
}
//# sourceMappingURL=refreshtoken.storage.api.d.ts.map