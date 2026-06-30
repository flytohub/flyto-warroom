import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Divider from '@mui/material/Divider';
import Chip from '@mui/material/Chip';
import { Shield, Lock, Bug, AlertTriangle, Clock, Mail } from 'lucide-react';
import { t, tOr } from '@lib/i18n';

const LAST_UPDATED = '2026-06-16';

function Section({ icon: Icon, title, children }: { icon: React.ElementType; title: string; children: React.ReactNode }) {
	return (
		<Box sx={{ mb: 5 }}>
			<Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 2 }}>
				<Icon size={20} className="text-violet-400" />
				<Typography variant="h6" fontWeight={600}>
					{title}
				</Typography>
			</Box>
			{children}
		</Box>
	);
}

function SecurityPageView() {
	return (
		<Box
			sx={{
				minHeight: '100vh',
				bgcolor: 'background.default',
				color: 'text.primary',
				py: 8,
				px: 2,
			}}
		>
			<Box sx={{ maxWidth: 800, mx: 'auto' }}>
				{/* Header */}
				<Box sx={{ mb: 6, textAlign: 'center' }}>
					<Box sx={{ display: 'flex', justifyContent: 'center', mb: 2 }}>
						<Shield size={48} className="text-violet-400" />
					</Box>
					<Typography variant="h3" fontWeight={700} gutterBottom>
						{t('legal.security.title')}
					</Typography>
					<Typography variant="body1" color="text.secondary" sx={{ maxWidth: 580, mx: 'auto' }}>
						{t('legal.security.subtitle')}
					</Typography>
					<Box sx={{ mt: 2 }}>
						<Chip
							label={t('legal.lastUpdated', { date: LAST_UPDATED })}
							size="small"
							icon={<Clock size={12} />}
							sx={{ fontSize: 12, color: 'text.secondary' }}
						/>
					</Box>
				</Box>

				<Divider sx={{ mb: 5 }} />

				{/* Vulnerability Disclosure */}
				<Section icon={Bug} title={t('legal.security.disclosure.title')}>
					<Typography variant="body1" paragraph>
						{t('legal.security.disclosure.intro')}
					</Typography>
					<Box component="ul" sx={{ pl: 3, '& li': { mb: 1 } }}>
						{[
							{ label: 'Acknowledge your report within 48 hours', labelKey: 'legal.security.disclosure.ack' },
							{ label: 'Provide a status update within 7 days', labelKey: 'legal.security.disclosure.update' },
							{ label: 'Resolve critical and high-severity issues within 30 days', labelKey: 'legal.security.disclosure.resolve' },
							{ label: 'Credit researchers who report valid vulnerabilities (with permission)', labelKey: 'legal.security.disclosure.credit' },
						].map(({ label, labelKey }) => (
							<li key={labelKey}>
								<Typography variant="body1">{tOr(labelKey, label)}</Typography>
							</li>
						))}
					</Box>
					<Box
						sx={{
							mt: 3,
							p: 3,
							borderRadius: 2,
							bgcolor: 'action.hover',
							border: '1px solid',
							borderColor: 'divider',
							display: 'flex',
							alignItems: 'center',
							gap: 2,
						}}
					>
						<Mail size={18} className="text-violet-400" />
						<Box>
							<Typography variant="body2" color="text.secondary" gutterBottom>
								{t('legal.security.disclosure.reportTo')}
							</Typography>
							<Typography
								component="a"
								href="mailto:security@flyto2.com"
								variant="body1"
								fontWeight={600}
								sx={{ color: 'primary.main', textDecoration: 'none', '&:hover': { textDecoration: 'underline' } }}
							>
								security@flyto2.com
							</Typography>
						</Box>
					</Box>
					<Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
						{t('legal.security.disclosure.encryptPrefix')}{' '}
						<Typography
							component="a"
							href="https://github.com/flytohub/.github/blob/main/SECURITY.md"
							target="_blank"
							rel="noopener noreferrer"
							variant="body2"
							sx={{ color: 'primary.main', textDecoration: 'none', '&:hover': { textDecoration: 'underline' } }}
						>
							{t('legal.security.disclosure.pgpKey')}
						</Typography>
						{t('legal.security.disclosure.encryptSuffix')}
					</Typography>
				</Section>

				<Divider sx={{ mb: 5 }} />

				{/* Security Practices */}
				<Section icon={Lock} title={t('legal.security.practices.title')}>
					<Box sx={{ display: 'grid', gap: 3, gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' } }}>
						{[
							{
								title: 'Encryption in Transit', titleKey: 'legal.security.practice.encryptionTransit.title',
								body: 'All traffic is TLS 1.2+ enforced. HSTS is set on all production endpoints.', bodyKey: 'legal.security.practice.encryptionTransit.body',
							},
							{
								title: 'Encryption at Rest', titleKey: 'legal.security.practice.encryptionRest.title',
								body: 'Database volumes and file storage are encrypted at rest using AES-256.', bodyKey: 'legal.security.practice.encryptionRest.body',
							},
							{
								title: 'Authentication', titleKey: 'legal.security.practice.authentication.title',
								body: 'Firebase Auth handles identity. API access requires a valid Firebase ID token on every request.', bodyKey: 'legal.security.practice.authentication.body',
							},
							{
								title: 'Role-Based Access Control', titleKey: 'legal.security.practice.rbac.title',
								body: 'Four roles (owner / admin / member / guest) with per-surface permission gates. Sensitive operations require admin.', bodyKey: 'legal.security.practice.rbac.body',
							},
							{
								title: 'Audit Logging', titleKey: 'legal.security.practice.auditLogging.title',
								body: 'Every privileged action writes a hash-chained audit entry. The chain integrity is verifiable via GET /audit?verify=true.', bodyKey: 'legal.security.practice.auditLogging.body',
							},
							{
								title: 'Secret Redaction', titleKey: 'legal.security.practice.secretRedaction.title',
								body: 'Execution traces and evidence are redacted before persistence — API keys, tokens, cookies, JWTs, and PEM keys are masked.', bodyKey: 'legal.security.practice.secretRedaction.body',
							},
							{
								title: 'Supply Chain', titleKey: 'legal.security.practice.supplyChain.title',
								body: 'All dependencies are scanned with Grype on every release. Container images are scanned with Trivy. SLSA provenance is attached to every PyPI release.', bodyKey: 'legal.security.practice.supplyChain.body',
							},
							{
								title: 'Static Analysis', titleKey: 'legal.security.practice.staticAnalysis.title',
								body: 'CodeQL scans run on every pull request across all repos. Gitleaks performs secret scanning on full commit history.', bodyKey: 'legal.security.practice.staticAnalysis.body',
							},
						].map(({ title, titleKey, body, bodyKey }) => (
							<Box
								key={title}
								sx={{
									p: 2.5,
									borderRadius: 2,
									bgcolor: 'action.hover',
									border: '1px solid',
									borderColor: 'divider',
								}}
							>
								<Typography variant="body1" fontWeight={600} gutterBottom>
									{tOr(titleKey, title)}
								</Typography>
								<Typography variant="body2" color="text.secondary">
									{tOr(bodyKey, body)}
								</Typography>
							</Box>
						))}
					</Box>
				</Section>

				<Divider sx={{ mb: 5 }} />

				{/* Incident Response */}
				<Section icon={AlertTriangle} title={t('legal.security.incident.title')}>
					<Typography variant="body1" paragraph>
						{t('legal.security.incident.intro')}
					</Typography>
					<Box component="ol" sx={{ pl: 3, '& li': { mb: 1.5 } }}>
						{[
							{ label: 'Contain — isolate affected systems within 1 hour of detection', labelKey: 'legal.security.incident.contain' },
							{ label: 'Assess — determine scope and impact within 4 hours', labelKey: 'legal.security.incident.assess' },
							{ label: 'Notify — inform affected customers within 72 hours as required under GDPR Art. 33/34', labelKey: 'legal.security.incident.notify' },
							{ label: 'Remediate — patch the root cause and verify fix', labelKey: 'legal.security.incident.remediate' },
							{ label: 'Report — publish a post-mortem for incidents affecting multiple customers', labelKey: 'legal.security.incident.report' },
						].map(({ label, labelKey }) => (
							<li key={labelKey}>
								<Typography variant="body1">{tOr(labelKey, label)}</Typography>
							</li>
						))}
					</Box>
				</Section>

				<Divider sx={{ mb: 5 }} />

				{/* Scope */}
				<Section icon={Shield} title={t('legal.security.scope.title')}>
					<Typography variant="body1" paragraph>
						{t('legal.security.scope.intro')}
					</Typography>
					<Box component="ul" sx={{ pl: 3, '& li': { mb: 1 } }}>
						{[
							{ label: 'flyto2.com and all subdomains', labelKey: 'legal.security.scope.flyto2' },
							{ label: 'flyto-engine (Go API backend)', labelKey: 'legal.security.scope.engine' },
							{ label: 'flyto-core (Python execution runtime)', labelKey: 'legal.security.scope.core' },
							{ label: 'flyto-indexer (Code intelligence MCP server)', labelKey: 'legal.security.scope.indexer' },
							{ label: 'flyto-cloud (Automation platform)', labelKey: 'legal.security.scope.cloud' },
							{ label: 'flyto-ai (AI sandbox runtime)', labelKey: 'legal.security.scope.ai' },
						].map(({ label, labelKey }) => (
							<li key={labelKey}>
								<Typography variant="body1">{tOr(labelKey, label)}</Typography>
							</li>
						))}
					</Box>
					<Typography variant="body1" sx={{ mt: 2 }} paragraph>
						{t('legal.security.scope.outOfScope')}
					</Typography>
				</Section>

				{/* Footer */}
				<Box sx={{ mt: 6, pt: 4, borderTop: '1px solid', borderColor: 'divider', textAlign: 'center' }}>
					<Typography variant="body2" color="text.secondary">
						{t('legal.footer.brandYear', { year: new Date().getFullYear() })}{' '}
						<Typography
							component="a"
							href="/trust"
							variant="body2"
							sx={{ color: 'primary.main', textDecoration: 'none', '&:hover': { textDecoration: 'underline' } }}
						>
							{t('legal.trust.title')}
						</Typography>
					</Typography>
				</Box>
			</Box>
		</Box>
	);
}

export default SecurityPageView;
