import {
  Injectable,
  Logger,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  ConflictException,
  Inject,
  forwardRef,
  Optional,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../database/prisma.service.js';
import { Role } from '../../common/enums/role.enum.js';
import type { AuthUser } from '../../auth/auth.service.js';
import { NotificationsService } from '../../notifications/notifications.service.js';
import {
  CreateOfferDto,
  UpdateOfferDto,
  RespondOfferDto,
  WithdrawOfferDto,
  QueryOffersDto,
  OfferStatus,
} from './dto/index.js';

export interface EnrichedOffer {
  id: string;
  applicationId: string;
  employerId: string;
  candidateId: string;
  jobId: string;
  status: string;
  salary: number;
  currency: string;
  salaryPeriod: string;
  startDate: string;
  expiryDate: string | null;
  benefits: string[];
  offerLetterUrl: string | null;
  notes: string | null;
  candidateFeedback: string | null;
  sentAt: string | null;
  respondedAt: string | null;
  createdAt: string;
  updatedAt: string;
  candidate?: {
    id: string;
    userId: string;
    name: string | null;
    email: string;
    headline: string | null;
  };
  job?: {
    id: string;
    title: string;
    companyName: string;
  };
  employer?: {
    id: string;
    name: string;
    location: string | null;
  };
}

@Injectable()
export class OffersService {
  private readonly logger = new Logger(OffersService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Optional()
    @Inject(forwardRef(() => NotificationsService))
    private readonly notificationsService?: NotificationsService,
  ) {}

  /**
   * Create a job offer for a candidate application.
   */
  async createOffer(user: AuthUser, dto: CreateOfferDto): Promise<EnrichedOffer> {
    const employer = await this.getEmployerProfile(user);

    const application = await this.prisma.client.orm.public.JobApplication
      .where({ id: dto.applicationId })
      .first();

    if (!application) {
      throw new NotFoundException(`Application #${dto.applicationId} not found.`);
    }

    const job = await this.prisma.client.orm.public.Job
      .where({ id: application.jobId })
      .first();

    if (!job || (job.employerId !== employer.id && user.role !== Role.ADMIN)) {
      throw new ForbiddenException('You do not have permission to extend an offer for this application.');
    }

    // Check if there is already an active offer (draft or sent)
    const existingOffers = await this.prisma.client.orm.public.JobOffer
      .where({ applicationId: application.id })
      .all();

    const activeOffer = existingOffers.find(
      (o) => o.status === OfferStatus.DRAFT || o.status === OfferStatus.SENT,
    );
    if (activeOffer) {
      throw new ConflictException(`An active offer #${activeOffer.id} (${activeOffer.status}) already exists for this application.`);
    }

    const candidateProfile = await this.prisma.client.orm.public.JobSeekerProfile
      .where({ id: application.profileId })
      .first();

    if (!candidateProfile) {
      throw new NotFoundException('Candidate profile not found.');
    }

    const candidateUser = await this.prisma.client.orm.public.User
      .where({ id: candidateProfile.userId })
      .first();

    const offerId = randomUUID();
    const nowIso = new Date().toISOString();
    const shouldSend = dto.sendImmediately ?? true;

    const created = await this.prisma.client.orm.public.JobOffer.create({
      id: offerId,
      applicationId: application.id,
      employerId: employer.id,
      candidateId: candidateProfile.id,
      jobId: job.id,
      status: shouldSend ? OfferStatus.SENT : OfferStatus.DRAFT,
      salary: dto.salary,
      currency: dto.currency || 'USD',
      salaryPeriod: dto.salaryPeriod || 'yearly',
      startDate: dto.startDate,
      expiryDate: dto.expiryDate ? new Date(dto.expiryDate).toISOString() : null,
      benefits: dto.benefits || [],
      offerLetterUrl: dto.offerLetterUrl || null,
      notes: dto.notes || null,
      candidateFeedback: null,
      sentAt: shouldSend ? nowIso : null,
      respondedAt: null,
    });

    if (shouldSend) {
      await this.prisma.client.orm.public.JobApplication
        .where({ id: application.id })
        .update({
          status: 'offered',
          stageMovedAt: nowIso,
        });

      await this.prisma.client.orm.public.ApplicationStatusHistory.create({
        id: randomUUID(),
        applicationId: application.id,
        previousStatus: application.status,
        newStatus: 'offered',
        changedById: user.id,
        changedByRole: 'employer',
        notes: `Official job offer extended (${dto.currency || 'USD'} ${dto.salary.toLocaleString()})`,
      });

      if (candidateUser && this.notificationsService) {
        await this.notificationsService.sendJobOfferNotification({
          candidateUserId: candidateUser.id,
          candidateEmail: candidateUser.email,
          candidateName: candidateUser.name || 'Candidate',
          employerName: employer.name,
          jobTitle: job.title,
          offerId,
          salary: dto.salary,
          currency: dto.currency || 'USD',
          salaryPeriod: dto.salaryPeriod || 'yearly',
          startDate: dto.startDate,
          expiryDate: dto.expiryDate,
          benefits: dto.benefits,
          offerLetterUrl: dto.offerLetterUrl,
        });
      }
    }

    this.logger.log(`Created offer #${offerId} for application #${application.id} (status: ${created.status})`);
    return this.enrichOfferRecord(created, candidateUser, candidateProfile, job, employer);
  }

  /**
   * List offers based on user role and query filters.
   */
  async listOffers(user: AuthUser, query?: QueryOffersDto): Promise<{ count: number; offers: EnrichedOffer[] }> {
    let rawOffers: any[] = [];

    if (user.role === Role.JOB_SEEKER) {
      const seeker = await this.prisma.client.orm.public.JobSeekerProfile
        .where({ userId: user.id })
        .first();

      if (!seeker) {
        return { count: 0, offers: [] };
      }

      // Candidates can only see non-draft offers
      rawOffers = (await this.prisma.client.orm.public.JobOffer
        .where({ candidateId: seeker.id })
        .all())
        .filter((o) => o.status !== OfferStatus.DRAFT);
    } else {
      const employer = await this.getEmployerProfile(user);
      rawOffers = await this.prisma.client.orm.public.JobOffer
        .where({ employerId: employer.id })
        .all();
    }

    if (query?.status) {
      rawOffers = rawOffers.filter((o) => o.status === query.status);
    }
    if (query?.jobId) {
      rawOffers = rawOffers.filter((o) => o.jobId === query.jobId);
    }
    if (query?.candidateId) {
      rawOffers = rawOffers.filter((o) => o.candidateId === query.candidateId);
    }

    rawOffers.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    const enriched = await Promise.all(
      rawOffers.map(async (item) => {
        const candidateProfile = await this.prisma.client.orm.public.JobSeekerProfile
          .where({ id: item.candidateId })
          .first();

        let candidateUser = null;
        if (candidateProfile) {
          candidateUser = await this.prisma.client.orm.public.User
            .where({ id: candidateProfile.userId })
            .first();
        }

        const job = await this.prisma.client.orm.public.Job
          .where({ id: item.jobId })
          .first();

        const employer = await this.prisma.client.orm.public.EmployerProfile
          .where({ id: item.employerId })
          .first();

        return this.enrichOfferRecord(item, candidateUser, candidateProfile, job, employer);
      }),
    );

    return {
      count: enriched.length,
      offers: enriched,
    };
  }

  /**
   * Get single offer by ID.
   */
  async getOfferById(user: AuthUser, id: string): Promise<EnrichedOffer> {
    const offer = await this.prisma.client.orm.public.JobOffer
      .where({ id })
      .first();

    if (!offer) {
      throw new NotFoundException(`Offer #${id} not found.`);
    }

    const candidateProfile = await this.prisma.client.orm.public.JobSeekerProfile
      .where({ id: offer.candidateId })
      .first();

    let candidateUser = null;
    if (candidateProfile) {
      candidateUser = await this.prisma.client.orm.public.User
        .where({ id: candidateProfile.userId })
        .first();
    }

    if (user.role === Role.JOB_SEEKER) {
      if (!candidateUser || candidateUser.id !== user.id) {
        throw new ForbiddenException('You do not have permission to view this offer.');
      }
      if (offer.status === OfferStatus.DRAFT) {
        throw new NotFoundException('Offer not found.');
      }
    } else if (user.role !== Role.ADMIN) {
      const employer = await this.getEmployerProfile(user);
      if (offer.employerId !== employer.id) {
        throw new ForbiddenException('You do not have permission to view this offer.');
      }
    }

    const job = await this.prisma.client.orm.public.Job
      .where({ id: offer.jobId })
      .first();

    const employer = await this.prisma.client.orm.public.EmployerProfile
      .where({ id: offer.employerId })
      .first();

    return this.enrichOfferRecord(offer, candidateUser, candidateProfile, job, employer);
  }

  /**
   * Update an existing offer (only when draft or sent).
   */
  async updateOffer(user: AuthUser, id: string, dto: UpdateOfferDto): Promise<EnrichedOffer> {
    const offer = await this.prisma.client.orm.public.JobOffer
      .where({ id })
      .first();

    if (!offer) {
      throw new NotFoundException(`Offer #${id} not found.`);
    }

    const employer = await this.getEmployerProfile(user);
    if (offer.employerId !== employer.id && user.role !== Role.ADMIN) {
      throw new ForbiddenException('You do not have permission to update this offer.');
    }

    if ([OfferStatus.ACCEPTED, OfferStatus.REJECTED, OfferStatus.WITHDRAWN].includes(offer.status as any)) {
      throw new BadRequestException(`Cannot update offer that is already ${offer.status}.`);
    }

    const updateData: any = {};
    if (dto.salary !== undefined) updateData.salary = dto.salary;
    if (dto.currency) updateData.currency = dto.currency;
    if (dto.salaryPeriod) updateData.salaryPeriod = dto.salaryPeriod;
    if (dto.startDate) updateData.startDate = dto.startDate;
    if (dto.expiryDate !== undefined) {
      updateData.expiryDate = dto.expiryDate ? new Date(dto.expiryDate).toISOString() : null;
    }
    if (dto.benefits) updateData.benefits = dto.benefits;
    if (dto.offerLetterUrl !== undefined) updateData.offerLetterUrl = dto.offerLetterUrl;
    if (dto.notes !== undefined) updateData.notes = dto.notes;

    await this.prisma.client.orm.public.JobOffer
      .where({ id })
      .update(updateData);

    return this.getOfferById(user, id);
  }

  /**
   * Send a draft offer to the candidate.
   */
  async sendOffer(user: AuthUser, id: string): Promise<EnrichedOffer> {
    const offer = await this.prisma.client.orm.public.JobOffer
      .where({ id })
      .first();

    if (!offer) {
      throw new NotFoundException(`Offer #${id} not found.`);
    }

    const employer = await this.getEmployerProfile(user);
    if (offer.employerId !== employer.id && user.role !== Role.ADMIN) {
      throw new ForbiddenException('You do not have permission to send this offer.');
    }

    if (offer.status !== OfferStatus.DRAFT) {
      throw new BadRequestException(`Offer is already ${offer.status}.`);
    }

    const nowIso = new Date().toISOString();
    await this.prisma.client.orm.public.JobOffer
      .where({ id })
      .update({
        status: OfferStatus.SENT,
        sentAt: nowIso,
      });

    await this.prisma.client.orm.public.JobApplication
      .where({ id: offer.applicationId })
      .update({
        status: 'offered',
        stageMovedAt: nowIso,
      });

    await this.prisma.client.orm.public.ApplicationStatusHistory.create({
      id: randomUUID(),
      applicationId: offer.applicationId,
      previousStatus: 'interviewing',
      newStatus: 'offered',
      changedById: user.id,
      changedByRole: 'employer',
      notes: `Offer #${id} sent to candidate`,
    });

    const enriched = await this.getOfferById(user, id);

    if (enriched.candidate && this.notificationsService) {
      await this.notificationsService.sendJobOfferNotification({
        candidateUserId: enriched.candidate.userId,
        candidateEmail: enriched.candidate.email,
        candidateName: enriched.candidate.name || 'Candidate',
        employerName: employer.name,
        jobTitle: enriched.job?.title || 'Job Position',
        offerId: offer.id,
        salary: offer.salary,
        currency: offer.currency,
        salaryPeriod: offer.salaryPeriod,
        startDate: offer.startDate,
        expiryDate: offer.expiryDate,
        benefits: [...(offer.benefits || [])],
        offerLetterUrl: offer.offerLetterUrl,
      });
    }

    return enriched;
  }

  /**
   * Candidate responds to offer (accept or decline).
   */
  async respondToOffer(user: AuthUser, id: string, dto: RespondOfferDto): Promise<EnrichedOffer> {
    const offer = await this.prisma.client.orm.public.JobOffer
      .where({ id })
      .first();

    if (!offer) {
      throw new NotFoundException(`Offer #${id} not found.`);
    }

    if (offer.status !== OfferStatus.SENT) {
      throw new BadRequestException(`Offer is currently ${offer.status} and cannot receive a response.`);
    }

    // Check candidate authorization
    const candidateProfile = await this.prisma.client.orm.public.JobSeekerProfile
      .where({ id: offer.candidateId })
      .first();

    if (!candidateProfile || (candidateProfile.userId !== user.id && user.role !== Role.ADMIN)) {
      throw new ForbiddenException('Only the recipient candidate can accept or decline this offer.');
    }

    const nowIso = new Date().toISOString();
    const isAccepted = dto.action === 'accept';
    const newStatus = isAccepted ? OfferStatus.ACCEPTED : OfferStatus.REJECTED;

    await this.prisma.client.orm.public.JobOffer
      .where({ id })
      .update({
        status: newStatus,
        candidateFeedback: dto.feedback || null,
        respondedAt: nowIso,
      });

    // Update application status
    const newAppStatus = isAccepted ? 'hired' : 'rejected';
    await this.prisma.client.orm.public.JobApplication
      .where({ id: offer.applicationId })
      .update({
        status: newAppStatus,
        stageMovedAt: nowIso,
        employerNotes: isAccepted ? 'Offer Accepted' : `Offer Declined: ${dto.feedback || 'No feedback'}`,
      });

    await this.prisma.client.orm.public.ApplicationStatusHistory.create({
      id: randomUUID(),
      applicationId: offer.applicationId,
      previousStatus: 'offered',
      newStatus: newAppStatus,
      changedById: user.id,
      changedByRole: 'job_seeker',
      notes: isAccepted ? 'Candidate accepted job offer' : `Candidate declined offer: ${dto.feedback || 'N/A'}`,
    });

    const enriched = await this.getOfferById(user, id);

    // Notify employer user
    const employer = await this.prisma.client.orm.public.EmployerProfile
      .where({ id: offer.employerId })
      .first();

    if (employer && this.notificationsService) {
      const employerUser = await this.prisma.client.orm.public.User
        .where({ id: employer.userId })
        .first();

      if (employerUser) {
        await this.notificationsService.sendOfferStatusNotification({
          employerUserId: employerUser.id,
          employerEmail: employerUser.email,
          employerName: employer.name,
          candidateName: user.name || 'Candidate',
          jobTitle: enriched.job?.title || 'Job Position',
          offerId: offer.id,
          status: isAccepted ? 'accepted' : 'rejected',
          candidateFeedback: dto.feedback,
        });
      }
    }

    return enriched;
  }

  /**
   * Employer withdraws a sent or draft offer.
   */
  async withdrawOffer(user: AuthUser, id: string, dto: WithdrawOfferDto): Promise<EnrichedOffer> {
    const offer = await this.prisma.client.orm.public.JobOffer
      .where({ id })
      .first();

    if (!offer) {
      throw new NotFoundException(`Offer #${id} not found.`);
    }

    const employer = await this.getEmployerProfile(user);
    if (offer.employerId !== employer.id && user.role !== Role.ADMIN) {
      throw new ForbiddenException('You do not have permission to withdraw this offer.');
    }

    if (offer.status === OfferStatus.ACCEPTED) {
      throw new BadRequestException('Cannot withdraw an offer that has already been accepted.');
    }

    await this.prisma.client.orm.public.JobOffer
      .where({ id })
      .update({
        status: OfferStatus.WITHDRAWN,
        notes: dto.reason ? `Withdrawn: ${dto.reason}` : offer.notes,
      });

    return this.getOfferById(user, id);
  }

  /**
   * Get analytics & metrics on employer offers.
   */
  async getOfferAnalytics(user: AuthUser) {
    const employer = await this.getEmployerProfile(user);

    const offers = await this.prisma.client.orm.public.JobOffer
      .where({ employerId: employer.id })
      .all();

    const total = offers.length;
    const sent = offers.filter((o) => o.status === OfferStatus.SENT).length;
    const accepted = offers.filter((o) => o.status === OfferStatus.ACCEPTED).length;
    const rejected = offers.filter((o) => o.status === OfferStatus.REJECTED).length;
    const withdrawn = offers.filter((o) => o.status === OfferStatus.WITHDRAWN).length;
    const draft = offers.filter((o) => o.status === OfferStatus.DRAFT).length;

    const decided = accepted + rejected;
    const acceptanceRate = decided > 0 ? Number(((accepted / decided) * 100).toFixed(1)) : 0;

    // Salary averages by currency
    const salariesByCurrency: Record<string, { total: number; count: number; avg: number }> = {};
    for (const o of offers) {
      const cur = o.currency || 'USD';
      if (!salariesByCurrency[cur]) {
        salariesByCurrency[cur] = { total: 0, count: 0, avg: 0 };
      }
      salariesByCurrency[cur].total += o.salary;
      salariesByCurrency[cur].count += 1;
    }
    for (const cur of Object.keys(salariesByCurrency)) {
      salariesByCurrency[cur].avg = Math.round(
        salariesByCurrency[cur].total / salariesByCurrency[cur].count,
      );
    }

    return {
      totalOffers: total,
      draftOffers: draft,
      sentOffers: sent,
      acceptedOffers: accepted,
      rejectedOffers: rejected,
      withdrawnOffers: withdrawn,
      acceptanceRatePercent: acceptanceRate,
      salaryAverages: salariesByCurrency,
    };
  }

  private enrichOfferRecord(
    offer: any,
    candidateUser: any,
    candidateProfile: any,
    job: any,
    employer: any,
  ): EnrichedOffer {
    return {
      ...offer,
      benefits: [...(offer.benefits || [])],
      candidate: candidateProfile
        ? {
            id: candidateProfile.id,
            userId: candidateProfile.userId,
            name: candidateUser?.name || null,
            email: candidateUser?.email || '',
            headline: candidateProfile.headline || null,
          }
        : undefined,
      job: job
        ? {
            id: job.id,
            title: job.title,
            companyName: job.companyName || employer?.name || 'Company',
          }
        : undefined,
      employer: employer
        ? {
            id: employer.id,
            name: employer.name,
            location: employer.location || null,
          }
        : undefined,
    };
  }

  private async getEmployerProfile(user: AuthUser) {
    if (user.role === Role.ADMIN) {
      const anyEmp = await this.prisma.client.orm.public.EmployerProfile.first();
      if (anyEmp) return anyEmp;
    }

    const employer = await this.prisma.client.orm.public.EmployerProfile
      .where({ userId: user.id })
      .first();

    if (!employer) {
      throw new NotFoundException('Employer profile not found. Please complete employer registration.');
    }

    return employer;
  }
}
