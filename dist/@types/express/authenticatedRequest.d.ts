import type { Request } from 'express';
import type { Role, Privileges } from '../index';
export interface AuthenticatedRequest extends Request {
    user?: {
        userId: string;
        role: Role;
        privileges: Privileges;
    };
}
//# sourceMappingURL=authenticatedRequest.d.ts.map