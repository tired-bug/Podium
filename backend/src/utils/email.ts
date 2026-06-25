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

async function resolveIPv4(hostname: string): Promise<string | null> {
  const dns = require('dns');
  return new Promise((resolve) => {
    // If it's already a literal IP, nothing to resolve.
    if (require('net').isIP(hostname)) {
      return resolve(hostname);
    }
    dns.resolve4(hostname, (err: any, addresses: string[]) => {
      if (err || !addresses || !addresses.length) {
        console.warn('[email] Could not resolve IPv4 address for', hostname, '— falling back to default resolution:', err?.message || 'no A records');
        return resolve(null);
      }
      resolve(addresses[0]);
    });
  });
}

async function createTransporter() {
  const { host, port, user, pass } = getSmtpConfig();
  console.log(`[email] Creating transporter — host:${host} port:${port} user:${user}`);
  const nodemailer = require('nodemailer');

  // Render's outbound networking does not reliably route IPv6 (AAAA records).
  // Nodemailer's own DNS resolver considers IPv6 "supported" based on local
  // network interfaces (which report an IPv6 interface even when it's not
  // actually routable), so it can pick an unreachable IPv6 address and fail
  // with ENETUNREACH. We work around this by resolving the IPv4 address
  // ourselves and connecting to that literal IP, while keeping the real
  // hostname as the TLS servername so certificate validation still matches.
  const ipv4Host = await resolveIPv4(host);

  const transporter = nodemailer.createTransport({
    host: ipv4Host || host,
    port,
    secure: port === 465,
    auth: { user, pass },
    tls: {
      rejectUnauthorized: false,
      servername: host, // ensure SNI/cert check uses the real hostname even though we connect by IP
    },
    // Fail fast instead of hanging indefinitely if the network/host is unreachable.
    connectionTimeout: 15000, // time to establish the TCP connection
    greetingTimeout: 15000,   // time to receive the SMTP greeting after connecting
    socketTimeout: 20000,     // time to wait for any response before giving up
  });

  if (ipv4Host) {
    console.log(`[email] Resolved ${host} -> ${ipv4Host} (IPv4)`);
  }

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
