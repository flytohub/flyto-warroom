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

function TermsPageView() {
	return (
		<Box sx={{ minHeight: '100vh', bgcolor: 'background.default', color: 'text.primary', py: 8, px: 2 }}>
			<Box sx={{ maxWidth: 760, mx: 'auto' }}>
				<Typography variant="h3" fontWeight={700} gutterBottom>
					{t('legal.trust.document.terms')}
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
					These Terms of Service (&quot;Terms&quot;) govern your access to and use of the Flyto2 platform and services
					(&quot;Service&quot;). By accessing the Service, you agree to be bound by these Terms.
				</P>

				<H2>1. Eligibility</H2>
				<P>
					You must be at least 18 years old and have the legal authority to enter into these Terms on behalf of yourself
					or the organization you represent.
				</P>

				<H2>2. Permitted Use</H2>
				<P>
					{t('legal.terms.permittedUseIntro')}
				</P>
				<Box component="ul" sx={{ pl: 3, mb: 2, '& li': { mb: 1 } }}>
					{[
						'Use the Service to scan or attack systems you do not own or have explicit written authorization to test',
						'Use the Service to develop offensive capabilities intended to harm third parties',
						'Attempt to reverse-engineer, decompile, or extract proprietary algorithms from the Service',
						'Resell or sublicense the Service without prior written consent',
						'Circumvent rate limits, authentication, or access controls',
						'Upload malware, exploit code, or other harmful content',
					].map((item) => (
						<li key={item}>
							<Typography variant="body1" color="text.secondary">
								{item}
							</Typography>
						</li>
					))}
				</Box>

				<H2>3. Account Responsibility</H2>
				<P>
					You are responsible for maintaining the confidentiality of your account credentials and for all activity that
					occurs under your account. Notify us immediately at{' '}
					<Typography
						component="a"
						href="mailto:security@flyto2.com"
						variant="body1"
						sx={{ color: 'primary.main', textDecoration: 'none' }}
					>
						security@flyto2.com
					</Typography>{' '}
					if you suspect unauthorized access.
				</P>

				<H2>4. Intellectual Property</H2>
				<P>
					The Service and its content are owned by Flyto2 and protected by applicable intellectual property laws. You
					retain ownership of your data. You grant Flyto2 a limited license to process your data solely to provide the
					Service.
				</P>

				<H2>5. Beta Features</H2>
				<P>
					Certain features are designated as &quot;Beta&quot;. Beta features are provided as-is, may change or be
					discontinued at any time, and are excluded from any SLA commitments. See our{' '}
					<Typography
						component="a"
						href="/beta"
						variant="body1"
						sx={{ color: 'primary.main', textDecoration: 'none' }}
					>
						{t('legal.trust.document.beta')}
					</Typography>{' '}
					for details.
				</P>

				<H2>6. Disclaimer of Warranties</H2>
				<P>
					THE SERVICE IS PROVIDED &quot;AS IS&quot; WITHOUT WARRANTY OF ANY KIND. FLYTO2 DOES NOT WARRANT THAT THE
					SERVICE WILL BE UNINTERRUPTED, ERROR-FREE, OR FREE OF SECURITY VULNERABILITIES. SECURITY SCANNING IS
					PROBABILISTIC; NO SCANNER DETECTS ALL VULNERABILITIES.
				</P>

				<H2>7. Limitation of Liability</H2>
				<P>
					TO THE MAXIMUM EXTENT PERMITTED BY LAW, FLYTO2 SHALL NOT BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL,
					CONSEQUENTIAL, OR PUNITIVE DAMAGES ARISING FROM YOUR USE OF THE SERVICE. OUR TOTAL LIABILITY SHALL NOT EXCEED
					THE AMOUNT YOU PAID TO US IN THE 12 MONTHS PRECEDING THE CLAIM.
				</P>

				<H2>8. Indemnification</H2>
				<P>
					You agree to indemnify and hold Flyto2 harmless from any claims, damages, or expenses arising from your
					violation of these Terms or your use of the Service to scan systems without authorization.
				</P>

				<H2>9. Termination</H2>
				<P>
					We may suspend or terminate your access if you violate these Terms. You may delete your account at any time.
					Upon termination, your data will be deleted within 90 days.
				</P>

				<H2>10. Governing Law</H2>
				<P>
					These Terms are governed by the laws of Taiwan (R.O.C.) without regard to conflict of law provisions. Disputes
					shall be resolved in the courts of Taipei City, Taiwan.
				</P>

				<H2>11. Changes to These Terms</H2>
				<P>
					We may update these Terms from time to time. Material changes will be communicated by email and by updating the
					effective date. Continued use of the Service constitutes acceptance.
				</P>

				<H2>12. Contact</H2>
				<P>
					{t('legal.terms.contactPrefix')}{' '}
					<Typography
						component="a"
						href="mailto:security@flyto2.com"
						variant="body1"
						sx={{ color: 'primary.main', textDecoration: 'none' }}
					>
						security@flyto2.com
					</Typography>
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
							href="/privacy"
							variant="body2"
							sx={{ color: 'primary.main', textDecoration: 'none' }}
						>
							{t('legal.trust.document.privacy')}
						</Typography>
					</Typography>
				</Box>
			</Box>
		</Box>
	);
}

export default TermsPageView;
