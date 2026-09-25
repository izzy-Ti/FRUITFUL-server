import { IsEnum, IsNotEmpty } from 'class-validator';
import { Role } from '../../common/enums/role.enum.js';

export class UpdateUserRoleDto {
  @IsEnum(Role, { message: 'Role must be one of: job_seeker, employer, admin' })
  @IsNotEmpty()
  role: Role;
}
