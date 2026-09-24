import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../database/prisma.service.js';
import {
  UpsertEmployerProfileDto,
  VerifyEmployerDto,
  QueryEmployersDto,
} from './dto/index.js';

export interface FullEmployerProfile {
  id: string;
  userId: string;
  name: string;
  logoUrl: string | null;
  description: string | null;
  industry: string | null;
  companySize: string | null;
  websiteUrl: string | null;
  location: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  verificationStatus: string;
  verifiedAt: string | null;
  rejectionReason: string | null;
  user?: {
    id: string;
    email: string;
    name: string | null;
  } | null;
  createdAt: string;
  updatedAt: string;
}

@Injectable()
export class EmployersService {
  private readonly logger = new Logger(EmployersService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Assemble full employer profile with linked user details.
   */
  private async assembleProfile(profile: any): Promise<FullEmployerProfile> {
    const user = await this.prisma.client.orm.public.User
      .where({ id: profile.userId })
      .first();

    return {
      id: profile.id,
      userId: profile.userId,
      name: profile.name,
      logoUrl: profile.logoUrl,
      description: profile.description,
      industry: profile.industry,
      companySize: profile.companySize,
      websiteUrl: profile.websiteUrl,
      location: profile.location,
      contactEmail: profile.contactEmail,
      contactPhone: profile.contactPhone,
      verificationStatus: profile.verificationStatus,
      verifiedAt: profile.verifiedAt,
      rejectionReason: profile.rejectionReason,
      user: user
        ? {
            id: user.id,
            email: user.email,
            name: user.name,
          }
        : null,
      createdAt: profile.createdAt,
      updatedAt: profile.updatedAt,
    };
  }

  /**
   * Retrieve active employer profile for the logged in user.
   */
  async getMyProfile(userId: string): Promise<FullEmployerProfile | null> {
    const profile = await this.prisma.client.orm.public.EmployerProfile
      .where({ userId })
      .first();

    if (!profile) {
      return null;
    }

    return this.assembleProfile(profile);
  }

  /**
   * Create or update the organization profile for an employer.
   */
  async upsertProfile(
    userId: string,
    dto: UpsertEmployerProfileDto,
  ): Promise<FullEmployerProfile> {
    const existing = await this.prisma.client.orm.public.EmployerProfile
      .where({ userId })
      .first();

    if (existing) {
      await this.prisma.client.orm.public.EmployerProfile
        .where({ id: existing.id })
        .update({
          name: dto.name.trim(),
          ...(dto.logoUrl !== undefined ? { logoUrl: dto.logoUrl } : {}),
          ...(dto.description !== undefined ? { description: dto.description.trim() } : {}),
          ...(dto.industry !== undefined ? { industry: dto.industry.trim() } : {}),
          ...(dto.companySize !== undefined ? { companySize: dto.companySize.trim() } : {}),
          ...(dto.websiteUrl !== undefined ? { websiteUrl: dto.websiteUrl } : {}),
          ...(dto.location !== undefined ? { location: dto.location.trim() } : {}),
          ...(dto.contactEmail !== undefined ? { contactEmail: dto.contactEmail.trim().toLowerCase() } : {}),
          ...(dto.contactPhone !== undefined ? { contactPhone: dto.contactPhone.trim() } : {}),
        });
    } else {
      await this.prisma.client.orm.public.EmployerProfile.create({
        id: randomUUID(),
        userId,
        name: dto.name.trim(),
        logoUrl: dto.logoUrl || null,
        description: dto.description?.trim() || null,
        industry: dto.industry?.trim() || null,
        companySize: dto.companySize?.trim() || null,
        websiteUrl: dto.websiteUrl || null,
        location: dto.location?.trim() || null,
        contactEmail: dto.contactEmail?.trim().toLowerCase() || null,
        contactPhone: dto.contactPhone?.trim() || null,
        verificationStatus: 'pending',
      });
      this.logger.log(`Created new EmployerProfile for user ${userId}`);
    }

    const updated = await this.prisma.client.orm.public.EmployerProfile
      .where({ userId })
      .first();

    return this.assembleProfile(updated!);
  }

  /**
   * Retrieve an employer profile by ID.
   */
  async getProfileById(employerId: string): Promise<FullEmployerProfile> {
    const profile = await this.prisma.client.orm.public.EmployerProfile
      .where({ id: employerId })
      .first();

    if (!profile) {
      throw new NotFoundException(`Employer profile with ID "${employerId}" was not found.`);
    }

    return this.assembleProfile(profile);
  }

  /**
   * Request organization verification from platform administrators.
   */
  async requestVerification(userId: string): Promise<FullEmployerProfile> {
    const existing = await this.prisma.client.orm.public.EmployerProfile
      .where({ userId })
      .first();

    if (!existing) {
      throw new BadRequestException('Please create an organization profile first before requesting verification.');
    }

    await this.prisma.client.orm.public.EmployerProfile
      .where({ id: existing.id })
      .update({
        verificationStatus: 'pending',
        rejectionReason: null,
      });

    const updated = await this.prisma.client.orm.public.EmployerProfile
      .where({ id: existing.id })
      .first();

    return this.assembleProfile(updated!);
  }

  /**
   * List verified employers for directory search.
   */
  async findAll(query?: QueryEmployersDto): Promise<FullEmployerProfile[]> {
    let collection = this.prisma.client.orm.public.EmployerProfile;

    // Public listing defaults to verified organizations
    const status = query?.verificationStatus || 'verified';
    collection = collection.where((e) => e.verificationStatus.eq(status));

    if (query?.industry) {
      collection = collection.where((e) => e.industry.ilike(`%${query.industry!.trim()}%`));
    }

    if (query?.location) {
      collection = collection.where((e) => e.location.ilike(`%${query.location!.trim()}%`));
    }

    if (query?.search) {
      const term = `%${query.search.trim().toLowerCase()}%`;
      collection = collection.where((e) =>
        e.name.ilike(term) || e.description.ilike(term)
      );
    }

    const limit = query?.limit || 20;
    const profiles = await collection.limit(limit).all();

    return Promise.all(profiles.map((p) => this.assembleProfile(p)));
  }

  /**
   * Admin: List all employer profiles with optional filtering.
   */
  async findAllAdmin(query?: QueryEmployersDto): Promise<FullEmployerProfile[]> {
    let collection = this.prisma.client.orm.public.EmployerProfile;

    if (query?.verificationStatus) {
      collection = collection.where((e) => e.verificationStatus.eq(query.verificationStatus!));
    }

    if (query?.search) {
      const term = `%${query.search.trim().toLowerCase()}%`;
      collection = collection.where((e) =>
        e.name.ilike(term) || e.contactEmail.ilike(term)
      );
    }

    const limit = query?.limit || 50;
    const profiles = await collection
      .orderBy((e) => e.createdAt.desc())
      .limit(limit)
      .all();

    return Promise.all(profiles.map((p) => this.assembleProfile(p)));
  }

  /**
   * Admin: Approve or reject employer verification.
   */
  async updateVerificationStatus(
    employerId: string,
    dto: VerifyEmployerDto,
  ): Promise<FullEmployerProfile> {
    const existing = await this.prisma.client.orm.public.EmployerProfile
      .where({ id: employerId })
      .first();

    if (!existing) {
      throw new NotFoundException(`Employer profile with ID "${employerId}" was not found.`);
    }

    const isVerified = dto.status === 'verified';
    const nowIso = isVerified ? new Date().toISOString() : null;

    await this.prisma.client.orm.public.EmployerProfile
      .where({ id: employerId })
      .update({
        verificationStatus: dto.status,
        verifiedAt: nowIso,
        rejectionReason: !isVerified ? dto.rejectionReason || 'Verification request rejected.' : null,
      });

    this.logger.log(
      `Employer ${employerId} verification status set to "${dto.status}".`,
    );

    const updated = await this.prisma.client.orm.public.EmployerProfile
      .where({ id: employerId })
      .first();

    return this.assembleProfile(updated!);
  }
}
