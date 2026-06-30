import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Divider from '@mui/material/Divider';
import Chip from '@mui/material/Chip';
import { Clock } from 'lucide-react';
import { t } from '@lib/i18n';

const EFFECTIVE_DATE = '2026-06-16';

function H2({ children }: { children: React.ReactNode }) {
	return (
		<Typography variant="h6" fontWeight={600} gutterBottom sx={{ mt: 4 }}>
			{children}
		</Typography>
	);
}

function P({ children }: { children: React.ReactNode }) {
	return (
		<Typography variant="body1" paragraph color="text.secondary">
			{children}
		</Typography>
	);
}

function PrivacyPageView() {
	return (
		<Box sx={{ minHeight: '100vh', bgcolor: 'background.default', color: 'text.primary', py: 8, px: 2 }}>
			<Box sx={{ maxWidth: 760, mx: 'auto' }}>
				<Typography variant="h3" fontWeight={700} gutterBottom>
					{t('legal.trust.document.privacy')}
				</Typography>
				<Box sx={{ mb: 3 }}>
					<Chip
						label={t('legal.effectiveDate', { date: EFFECTIVE_DATE })}
						size="small"
						icon={<Clock size={12} />}
						sx={{ fontSize: 12, color: 'text.secondary' }}
					/>
				</Box>

				<P>
					This Privacy Policy describes how Flyto2 (&quot;we&quot;, &quot;us&quot;, &quot;our&quot;) collects, uses, and
					discloses information when you use our services, including flyto2.com and all associated products (the
					&quot;Service&quot;). By using the Service, you agree to the practices described in this policy.
				</P>

				<H2>1. Information We Collect</H2>
				<P>
					<strong>{t('legal.privacy.accountInfo.label')}</strong>{' '}
					{t('legal.privacy.accountInfo.body')}
				</P>
				<P>
					<strong>{t('legal.privacy.repoData.label')}</strong>{' '}
					{t('legal.privacy.repoData.body')}
				</P>
				<P>
					<strong>{t('legal.privacy.scanResults.label')}</strong>{' '}
					{t('legal.privacy.scanResults.body')}
				</P>
				<P>
					<strong>{t('legal.privacy.usageData.label')}</strong>{' '}
					{t('legal.privacy.usageData.body')}
				</P>

				<H2>2. How We Use Your Information</H2>
				<P>{t('legal.privacy.useInfoIntro')}</P>
				<Box component="ul" sx={{ pl: 3, mb: 2, '& li': { mb: 1 } }}>
					{[
						'Provide, operate, and improve the Service',
						'Authenticate you and authorize access to your organization\'s data',
						'Generate security reports and scores',
						'Send transactional emails (scan results, invitations, alerts) — never marketing without consent',
						'Comply with legal obligations',
					].map((item) => (
						<li key={item}>
							<Typography variant="body1" color="text.secondary">
								{item}
							</Typography>
						</li>
					))}
				</Box>

				<H2>3. Data Storage and Security</H2>
				<P>
					{t('legal.privacy.storage.body')}
				</P>

				<H2>4. Data Retention</H2>
				<P>
					Scan results and evidence are retained for 90 days. Account data is retained until you delete your account.
					You may request earlier deletion of any data by contacting{' '}
					<Typography
						component="a"
						href="mailto:security@flyto2.com"
						variant="body1"
						sx={{ color: 'primary.main', textDecoration: 'none' }}
					>
						security@flyto2.com
					</Typography>
					.
				</P>

				<H2>5. Sub-processors</H2>
				<P>{t('legal.privacy.subprocessorsIntro')}</P>
				<Box component="ul" sx={{ pl: 3, mb: 2, '& li': { mb: 1 } }}>
					{[
						'Google Cloud Platform — compute, storage, database (Cloud Run, Cloud SQL, GCS)',
						'Firebase (Google) — authentication',
						'GitHub — repository access (with your authorization)',
					].map((item) => (
						<li key={item}>
							<Typography variant="body1" color="text.secondary">
								{item}
							</Typography>
						</li>
					))}
				</Box>

				<H2>6. Your Rights</H2>
				<P>
					Depending on your jurisdiction, you may have rights to access, correct, delete, or port your personal data. To
					exercise these rights, contact us at{' '}
					<Typography
						component="a"
						href="mailto:security@flyto2.com"
						variant="body1"
						sx={{ color: 'primary.main', textDecoration: 'none' }}
					>
						security@flyto2.com
					</Typography>
					. We will respond within 30 days.
				</P>

				<H2>7. Cookies</H2>
				<P>
					We use session cookies for authentication (Firebase Auth session). We do not use tracking or advertising
					cookies. You may disable cookies in your browser, but this will prevent you from logging in.
				</P>

				<H2>8. Changes to This Policy</H2>
				<P>
					We will update this policy when our practices change. Material changes will be notified by email and by
					updating the effective date above. Continued use of the Service after the effective date constitutes acceptance.
				</P>

				<H2>9. Contact</H2>
				<P>
					{t('legal.privacy.contactPrefix')}{' '}
					<Typography
						component="a"
						href="mailto:security@flyto2.com"
						variant="body1"
						sx={{ color: 'primary.main', textDecoration: 'none' }}
					>
						security@flyto2.com
					</Typography>
					{t('common.period')}
				</P>

				<Divider sx={{ mt: 5, mb: 3 }} />
				<Box sx={{ textAlign: 'center' }}>
					<Typography variant="body2" color="text.secondary">
						{t('legal.footer.brandYear', { year: new Date().getFullYear() })}{' '}
						<Typography
							component="a"
							href="/trust"
							variant="body2"
							sx={{ color: 'primary.main', textDecoration: 'none' }}
						>
							{t('legal.trust.title')}
						</Typography>
						{' · '}
						<Typography
							component="a"
							href="/security"
							variant="body2"
							sx={{ color: 'primary.main', textDecoration: 'none' }}
						>
							{t('legal.trust.footer.securityPolicy')}
						</Typography>
					</Typography>
				</Box>
			</Box>
		</Box>
	);
}

export default PrivacyPageView;
