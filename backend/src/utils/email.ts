/**
 * Email sending utility — reads exclusively from environment variables.
 * SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, EMAIL_FROM, FRONTEND_URL
 */

function getSmtpConfig() {
  return {
    host: process.env.SMTP_HOST || '',
    port: parseInt(process.env.SMTP_PORT || '587'),
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASS || '',
    from: process.env.EMAIL_FROM || process.env.SMTP_USER || '',
    frontendUrl: process.env.FRONTEND_URL || 'http://localhost:5173',
  };
}

function isSmtpConfigured(): boolean {
  const { host, user, pass } = getSmtpConfig();
  const ok = !!(host && user && pass);
  if (!ok) {
    console.warn('[email] SMTP not configured — host:', host || '(missing)', '| user:', user || '(missing)', '| pass:', pass ? '(set)' : '(missing)');
  }
  return ok;
}

async function createTransporter() {
  const { host, port, user, pass } = getSmtpConfig();
  console.log(`[email] Creating transporter — host:${host} port:${port} user:${user}`);
  const nodemailer = require('nodemailer');
  const transporter = nodemailer.createTransport({
    host, port,
    secure: port === 465,
    auth: { user, pass },
    tls: { rejectUnauthorized: false },
  });

  // Note: transporter.verify() is intentionally omitted — Office365 SMTP
  // does not reliably support it and causes the connection to hang.
  console.log('[email] ✓ Transporter created');
  return transporter;
}

const EMAIL_STYLES = `
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #050508; margin: 0; padding: 40px 20px; }
  .card { max-width: 500px; margin: 0 auto; background: #0f0f1a; border: 1px solid rgba(255,255,255,0.08); border-radius: 16px; overflow: hidden; }
  .banner { height: 6px; background: linear-gradient(90deg, #6366f1, #a855f7, #ec4899); }
  .body { padding: 36px 40px; }
  h1 { color: #f0f0ff; font-size: 22px; margin: 0 0 8px; font-weight: 800; }
  p { color: #9090b8; font-size: 14px; line-height: 1.7; margin: 0 0 20px; }
  .btn { display: block; background: linear-gradient(135deg,#6366f1,#a855f7); color: #fff !important; text-decoration: none; padding: 14px 28px; border-radius: 10px; font-weight: 700; font-size: 15px; text-align: center; margin: 28px 0; }
  .footer { color: #484F58; font-size: 12px; margin-top: 24px; padding-top: 24px; border-top: 1px solid rgba(255,255,255,0.06); }
  .url { word-break: break-all; font-family: monospace; color: #818cf8; font-size: 12px; }
`;

export async function sendVerificationEmail(toEmail: string, token: string): Promise<void> {
  console.log('[email] sendVerificationEmail called for', toEmail);
  if (!isSmtpConfigured()) return;
  const { frontendUrl, from } = getSmtpConfig();
  const link = `${frontendUrl}/verify-email?token=${token}`;
  try {
    const transporter = await createTransporter();
    await transporter.sendMail({
      from,
      to: toEmail,
      subject: 'Verify your Podium account',
      html: `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>${EMAIL_STYLES}</style></head>
<body><div class="card">
  <div class="banner"></div>
  <div class="body">
    <h1>Verify your email</h1>
    <p>Welcome to Podium! Click the button below to verify your email address. This link expires in 24 hours.</p>
    <a href="${link}" class="btn">Verify Email Address</a>
    <p>Or copy this link into your browser:</p>
    <p class="url">${link}</p>
    <div class="footer">If you didn't create a Podium account, you can safely ignore this email.</div>
  </div>
</div></body></html>`,
    });
    console.log('[email] ✓ Verification email sent to', toEmail);
  } catch (err: any) {
    console.error('[email] ✗ Failed to send verification email to', toEmail, ':', err.message || err);
    throw err;
  }
}

export async function sendPasswordResetEmail(toEmail: string, token: string): Promise<void> {
  console.log('[email] sendPasswordResetEmail called for', toEmail);
  if (!isSmtpConfigured()) return;
  const { frontendUrl, from } = getSmtpConfig();
  const link = `${frontendUrl}/reset-password?token=${token}`;
  try {
    const transporter = await createTransporter();
    await transporter.sendMail({
      from,
      to: toEmail,
      subject: 'Reset your Podium password',
      html: `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>${EMAIL_STYLES}</style></head>
<body><div class="card">
  <div class="banner"></div>
  <div class="body">
    <h1>Reset your password</h1>
    <p>We received a request to reset the password for your Podium account. Click below to set a new password. This link expires in 1 hour.</p>
    <a href="${link}" class="btn">Reset Password</a>
    <p>Or copy this link into your browser:</p>
    <p class="url">${link}</p>
    <div class="footer">If you didn't request a password reset, you can safely ignore this email — your password won't change.</div>
  </div>
</div></body></html>`,
    });
    console.log('[email] ✓ Password reset email sent to', toEmail);
  } catch (err: any) {
    console.error('[email] ✗ Failed to send password reset email to', toEmail, ':', err.message || err);
    throw err;
  }
}
