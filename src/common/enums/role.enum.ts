export enum Role {
  JOB_SEEKER = 'job_seeker',
  EMPLOYER = 'employer',
  ADMIN = 'admin',
}

export const ROLES_LIST = [Role.JOB_SEEKER, Role.EMPLOYER, Role.ADMIN] as const;
