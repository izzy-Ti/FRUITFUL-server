import { IsEmail, IsNotEmpty, IsOptional, IsString, MinLength, IsIn } from 'class-validator';
import { Role, ROLES_LIST } from '../../common/enums/role.enum.js';

export class RegisterDto {
  @IsEmail({}, { message: 'A valid email address is required' })
  email!: string;

  @IsString()
  @MinLength(8, { message: 'Password must be at least 8 characters long' })
  password!: string;

  @IsString()
  @IsNotEmpty({ message: 'Name is required' })
  name!: string;

  @IsOptional()
  @IsString()
  @IsIn(ROLES_LIST, {
    message: `Role must be one of: ${ROLES_LIST.join(', ')}`,
  })
  role?: Role;
}
