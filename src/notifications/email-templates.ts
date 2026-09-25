/**
 * Modern, responsive email templates for Fruitful Journey platform notifications.
 */

function baseLayout(title: string, contentHtml: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <style>
    body {
      margin: 0;
      padding: 0;
      background-color: #f8fafc;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      color: #1e293b;
      -webkit-font-smoothing: antialiased;
    }
    .container {
      max-width: 600px;
      margin: 40px auto;
      background: #ffffff;
      border-radius: 12px;
      overflow: hidden;
      box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05), 0 2px 4px -2px rgba(0, 0, 0, 0.05);
      border: 1px solid #e2e8f0;
    }
    .header {
      background: linear-gradient(135deg, #059669 0%, #10b981 100%);
      padding: 32px 40px;
      text-align: center;
    }
    .header h1 {
      margin: 0;
      color: #ffffff;
      font-size: 24px;
      font-weight: 700;
      letter-spacing: -0.5px;
    }
    .header p {
      margin: 6px 0 0 0;
      color: #d1fae5;
      font-size: 14px;
    }
    .content {
      padding: 36px 40px;
      font-size: 15px;
      line-height: 1.6;
      color: #334155;
    }
    .btn {
      display: inline-block;
      background: #059669;
      color: #ffffff !important;
      text-decoration: none;
      padding: 12px 28px;
      border-radius: 8px;
      font-weight: 600;
      font-size: 15px;
      margin: 20px 0;
      text-align: center;
    }
    .badge {
      display: inline-block;
      padding: 4px 12px;
      border-radius: 9999px;
      font-size: 13px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    .badge-info { background: #e0f2fe; color: #0369a1; }
    .badge-success { background: #dcfce7; color: #15803d; }
    .badge-warning { background: #fef3c7; color: #b45309; }
    .badge-danger { background: #fee2e2; color: #b91c1c; }
    .card {
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      padding: 16px 20px;
      margin: 20px 0;
    }
    .otp-box {
      font-family: monospace;
      font-size: 28px;
      font-weight: 700;
      letter-spacing: 6px;
      text-align: center;
      background: #f1f5f9;
      border: 2px dashed #cbd5e1;
      border-radius: 8px;
      padding: 16px;
      margin: 24px 0;
      color: #0f172a;
    }
    .footer {
      background: #f8fafc;
      border-top: 1px solid #e2e8f0;
      padding: 24px 40px;
      text-align: center;
      font-size: 13px;
      color: #64748b;
    }
    .footer a {
      color: #059669;
      text-decoration: none;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>Fruitful Journey</h1>
      <p>Connecting Exceptional Talent With Visionary Employers</p>
    </div>
    <div class="content">
      ${contentHtml}
    </div>
    <div class="footer">
      <p>© ${new Date().getFullYear()} Fruitful Journey. All rights reserved.</p>
      <p>If you didn't request this email, you can safely ignore it.</p>
    </div>
  </div>
</body>
</html>`;
}

export const EmailTemplates = {
  // 1. Account verification email
  accountVerification(data: { name?: string; email: string; verificationUrl?: string; otp?: string }) {
    const greeting = data.name ? `Hello ${data.name},` : 'Hello,';
    const actionBlock = data.verificationUrl
      ? `<div style="text-align: center;">
          <a href="${data.verificationUrl}" class="btn">Verify Your Email Address</a>
        </div>
        <p style="font-size: 13px; color: #64748b;">Or copy and paste this link into your browser:<br>
          <a href="${data.verificationUrl}" style="color: #059669; word-break: break-all;">${data.verificationUrl}</a>
        </p>`
      : '';

    const otpBlock = data.otp
      ? `<p>Or enter this verification code directly:</p>
         <div class="otp-box">${data.otp}</div>
         <p style="font-size: 13px; color: #64748b; text-align: center;">This code will expire in 15 minutes.</p>`
      : '';

    const html = baseLayout(
      'Verify Your Fruitful Account',
      `<h2>Welcome to Fruitful Journey!</h2>
       <p>${greeting}</p>
       <p>Thank you for creating an account. To complete your registration and activate your account, please verify your email address.</p>
       ${actionBlock}
       ${otpBlock}
       <p>Verifying your email ensures that your account remains secure and that you receive critical updates regarding applications and opportunities.</p>`,
    );

    const text = `Welcome to Fruitful Journey!\n\n${greeting}\n\nPlease verify your email address to complete your registration.\n${
      data.verificationUrl ? `Verification link: ${data.verificationUrl}\n` : ''
    }${data.otp ? `Verification Code: ${data.otp}\n` : ''}\nThank you,\nFruitful Journey Team`;

    return {
      subject: 'Verify your Fruitful Journey account',
      html,
      text,
    };
  },

  // 2. Password reset email
  passwordReset(data: { name?: string; email: string; resetUrl?: string; token?: string }) {
    const greeting = data.name ? `Hello ${data.name},` : 'Hello,';
    const actionBlock = data.resetUrl
      ? `<div style="text-align: center;">
          <a href="${data.resetUrl}" class="btn">Reset Your Password</a>
        </div>
        <p style="font-size: 13px; color: #64748b;">Or copy and paste this link into your browser:<br>
          <a href="${data.resetUrl}" style="color: #059669; word-break: break-all;">${data.resetUrl}</a>
        </p>`
      : '';

    const tokenBlock = data.token
      ? `<div class="card">
          <strong>Reset Security Token:</strong><br>
          <code style="word-break: break-all;">${data.token}</code>
        </div>`
      : '';

    const html = baseLayout(
      'Password Reset Request',
      `<h2>Password Reset Request</h2>
       <p>${greeting}</p>
       <p>We received a request to reset the password for your Fruitful Journey account associated with <strong>${data.email}</strong>.</p>
       ${actionBlock}
       ${tokenBlock}
       <div class="card" style="background: #fffbeb; border-color: #fef3c7;">
         <strong style="color: #92400e;">Security Notice:</strong>
         <p style="margin: 4px 0 0 0; font-size: 13px; color: #b45309;">
           If you did not initiate this request, your account is still secure and no changes have been made. You can safely disregard this email.
         </p>
       </div>`,
    );

    const text = `Password Reset Request\n\n${greeting}\n\nWe received a request to reset your password.\n${
      data.resetUrl ? `Reset link: ${data.resetUrl}\n` : ''
    }${data.token ? `Reset Token: ${data.token}\n` : ''}\nIf you did not request this, please ignore this email.\n\nFruitful Journey Team`;

    return {
      subject: 'Reset your Fruitful Journey password',
      html,
      text,
    };
  },

  // 3. Application received notification (Candidate copy & Employer copy)
  applicationReceivedCandidate(data: {
    candidateName: string;
    jobTitle: string;
    companyName: string;
    applicationId: string;
  }) {
    const html = baseLayout(
      'Application Received',
      `<h2>Application Submitted Successfully!</h2>
       <p>Hello ${data.candidateName},</p>
       <p>Great news! Your application for <strong>${data.jobTitle}</strong> at <strong>${data.companyName}</strong> has been successfully received.</p>
       <div class="card">
         <p style="margin: 0 0 8px 0;"><strong>Position:</strong> ${data.jobTitle}</p>
         <p style="margin: 0 0 8px 0;"><strong>Company:</strong> ${data.companyName}</p>
         <p style="margin: 0 0 8px 0;"><strong>Application Reference:</strong> #${data.applicationId.slice(0, 8)}</p>
         <p style="margin: 0;"><strong>Status:</strong> <span class="badge badge-info">Submitted</span></p>
       </div>
       <p>The hiring team at ${data.companyName} will review your application and portfolio. We will notify you immediately whenever there is an update to your application status.</p>`,
    );

    const text = `Application Submitted Successfully!\n\nHello ${data.candidateName},\n\nYour application for ${data.jobTitle} at ${data.companyName} has been received (Ref: #${data.applicationId.slice(0, 8)}).\n\nFruitful Journey Team`;

    return {
      subject: `Application received: ${data.jobTitle} at ${data.companyName}`,
      html,
      text,
    };
  },

  applicationReceivedEmployer(data: {
    employerName: string;
    candidateName: string;
    jobTitle: string;
    applicationId: string;
  }) {
    const html = baseLayout(
      'New Job Application',
      `<h2>New Candidate Application Received</h2>
       <p>Hello ${data.employerName},</p>
       <p>You have received a new application for your listing <strong>${data.jobTitle}</strong>.</p>
       <div class="card">
         <p style="margin: 0 0 8px 0;"><strong>Candidate:</strong> ${data.candidateName}</p>
         <p style="margin: 0 0 8px 0;"><strong>Position:</strong> ${data.jobTitle}</p>
         <p style="margin: 0;"><strong>Application Reference:</strong> #${data.applicationId.slice(0, 8)}</p>
       </div>
       <p>You can review the candidate's profile, CV, portfolio projects, and advance them through your recruitment pipeline in your employer portal.</p>`,
    );

    const text = `New Candidate Application Received\n\nHello ${data.employerName},\n\n${data.candidateName} has applied for your job listing: ${data.jobTitle}.\nApplication Reference: #${data.applicationId.slice(0, 8)}\n\nFruitful Journey Team`;

    return {
      subject: `New candidate application for ${data.jobTitle}`,
      html,
      text,
    };
  },

  // 4. Application status change notification
  applicationStatusChange(data: {
    candidateName: string;
    jobTitle: string;
    companyName: string;
    newStatus: string;
    previousStatus?: string;
    notes?: string | null;
  }) {
    const statusBadges: Record<string, { badge: string; label: string }> = {
      reviewing: { badge: 'badge-info', label: 'Under Review' },
      shortlisted: { badge: 'badge-success', label: 'Shortlisted' },
      interviewing: { badge: 'badge-info', label: 'Interview Scheduled' },
      offered: { badge: 'badge-success', label: 'Job Offer Extended' },
      hired: { badge: 'badge-success', label: 'Hired 🎉' },
      rejected: { badge: 'badge-danger', label: 'Not Selected' },
      withdrawn: { badge: 'badge-warning', label: 'Withdrawn' },
    };

    const statusInfo = statusBadges[data.newStatus.toLowerCase()] || {
      badge: 'badge-info',
      label: data.newStatus.toUpperCase(),
    };

    const notesBlock = data.notes
      ? `<div class="card">
          <strong>Note from Employer:</strong>
          <p style="margin: 6px 0 0 0; font-style: italic;">"${data.notes}"</p>
        </div>`
      : '';

    const html = baseLayout(
      'Application Status Update',
      `<h2>Application Status Update</h2>
       <p>Hello ${data.candidateName},</p>
       <p>There has been an update regarding your application for <strong>${data.jobTitle}</strong> at <strong>${data.companyName}</strong>.</p>
       <div class="card">
         <p style="margin: 0 0 8px 0;"><strong>Position:</strong> ${data.jobTitle}</p>
         <p style="margin: 0 0 8px 0;"><strong>Company:</strong> ${data.companyName}</p>
         <p style="margin: 0;"><strong>New Status:</strong> <span class="badge ${statusInfo.badge}">${statusInfo.label}</span></p>
       </div>
       ${notesBlock}
       <p>Log in to your Fruitful Journey dashboard to view additional details and manage your applications.</p>`,
    );

    const text = `Application Status Update\n\nHello ${data.candidateName},\n\nYour application for ${data.jobTitle} at ${data.companyName} status has been updated to: ${statusInfo.label}.\n${
      data.notes ? `Note: "${data.notes}"\n` : ''
    }\nFruitful Journey Team`;

    return {
      subject: `Application update: ${data.jobTitle} at ${data.companyName} (${statusInfo.label})`,
      html,
      text,
    };
  },

  // 5. Employer verification notification
  employerVerification(data: {
    companyName: string;
    status: 'verified' | 'rejected';
    reason?: string | null;
  }) {
    const isVerified = data.status === 'verified';
    const title = isVerified ? 'Employer Account Verified! 🎉' : 'Employer Verification Update';

    const statusBlock = isVerified
      ? `<div class="card" style="background: #f0fdf4; border-color: #bbf7d0;">
           <h3 style="margin: 0 0 8px 0; color: #166534;">Congratulations! Your organization is verified.</h3>
           <p style="margin: 0; color: #15803d;">
             Your company profile for <strong>${data.companyName}</strong> has been officially approved and verified by the Fruitful Journey trust & safety team.
           </p>
         </div>
         <p>You can now post published jobs, discover approved talent, search portfolio projects, and connect directly with top candidates across the platform.</p>`
      : `<div class="card" style="background: #fef2f2; border-color: #fecaca;">
           <h3 style="margin: 0 0 8px 0; color: #991b1b;">Verification Decision Notice</h3>
           <p style="margin: 0 0 8px 0; color: #b91c1c;">
             Our team reviewed your employer profile for <strong>${data.companyName}</strong> and was unable to verify it at this time.
           </p>
           ${
             data.reason
               ? `<p style="margin: 0; font-weight: 600; color: #7f1d1d;">Reason: ${data.reason}</p>`
               : ''
           }
         </div>
         <p>Please update your organization details or contact support if you believe this was in error.</p>`;

    const html = baseLayout(
      title,
      `<h2>${title}</h2>
       <p>Hello,</p>
       ${statusBlock}`,
    );

    const text = `${title}\n\nOrganization: ${data.companyName}\nStatus: ${data.status.toUpperCase()}\n${
      data.reason ? `Reason: ${data.reason}\n` : ''
    }\nFruitful Journey Trust & Safety Team`;

    return {
      subject: isVerified
        ? `Organization Verified: ${data.companyName} is now active on Fruitful`
        : `Verification update for ${data.companyName}`,
      html,
      text,
    };
  },

  // 6. Important admin or moderation alerts
  adminModerationAlert(data: {
    alertType: string;
    title: string;
    message: string;
    entityType: string;
    entityId: string;
    timestamp?: string;
  }) {
    const html = baseLayout(
      data.title,
      `<h2>Operational Alert: ${data.title}</h2>
       <p>${data.message}</p>
       <div class="card">
         <p style="margin: 0 0 8px 0;"><strong>Alert Type:</strong> ${data.alertType}</p>
         <p style="margin: 0 0 8px 0;"><strong>Entity:</strong> ${data.entityType} (#${data.entityId.slice(0, 8)})</p>
         <p style="margin: 0;"><strong>Logged At:</strong> ${data.timestamp || new Date().toISOString()}</p>
       </div>
       <p>Administrators can inspect full audit records and take moderation actions in the Admin Console.</p>`,
    );

    const text = `Operational Alert: ${data.title}\n\n${data.message}\nAlert Type: ${data.alertType}\nEntity: ${data.entityType} #${data.entityId}\n\nFruitful Journey Admin System`;

    return {
      subject: `[Admin Alert] ${data.title}`,
      html,
      text,
    };
  },
};
