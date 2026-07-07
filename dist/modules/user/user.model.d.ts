import type { Role, Privileges } from '../../@types';
export interface User {
    id: string;
    employeeId?: string | null;
    username: string;
    passwordHash: string;
    role: Role;
    privileges: Privileges;
    isActive: boolean;
    createdAt: Date;
    updatedAt: Date;
    lastLogin?: Date | null;
    profileImage: string;
}
//# sourceMappingURL=user.model.d.ts.map