import { SetMetadata } from '@nestjs/common';
import { Role } from '../../common/enums/role.enum.js';

export const ROLES_KEY = 'roles';
export const Roles = (...roles: (Role | string)[]) => SetMetadata(ROLES_KEY, roles);
