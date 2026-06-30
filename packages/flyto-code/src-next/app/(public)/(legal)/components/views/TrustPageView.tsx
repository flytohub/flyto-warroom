import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Divider from '@mui/material/Divider';
import Chip from '@mui/material/Chip';
import { CheckCircle, Clock, Server, FileText, ShieldCheck, Globe } from 'lucide-react';
import { t, tOr } from '@lib/i18n';

const LAST_UPDATED = '2026-06-16';

function StatusBadge({ status }: { status: 'operational' | 'planned' | 'beta' }) {
	const config = {
		operational: { label: 'Operational', labelKey: 'legal.trust.status.operational', color: '#22c55e' },
		planned: { label: 'Planned', labelKey: 'legal.trust.status.planned', color: '#f59e0b' },
		beta: { label: 'Beta', labelKey: 'legal.trust.status.beta', color: '#8b5cf6' },
	}[status];
	return (
		<Chip
			label={tOr(config.labelKey, config.label)}
			size="small"
			sx={{ fontSize: 12, fontWeight: 600, color: config.color, borderColor: config.color, border: '1px solid' }}
		/>
	);
}

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

function TrustPageView() {
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
						<ShieldCheck size={48} className="text-violet-400" />
					</Box>
					<Typography variant="h3" fontWeight={700} gutterBottom>
						{t('legal.trust.title')}
					</Typography>
					<Typography variant="body1" color="text.secondary" sx={{ maxWidth: 580, mx: 'auto' }}>
						{t('legal.trust.subtitle')}
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

				{/* Platform Status */}
				<Section icon={Server} title={t('legal.trust.platformStatus.title')}>
					<Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
						{t('legal.trust.platformStatus.desc')}
					</Typography>
					{[
						{ name: 'API (flyto-engine)', nameKey: 'legal.trust.service.api', status: 'operational' as const },
						{ name: 'Code Intelligence (flyto-indexer)', nameKey: 'legal.trust.service.codeIntelligence', status: 'operational' as const },
						{ name: 'Execution Runtime (flyto-core)', nameKey: 'legal.trust.service.executionRuntime', status: 'operational' as const },
						{ name: 'Automation Platform (flyto-cloud)', nameKey: 'legal.trust.service.automationPlatform', status: 'operational' as const },
						{ name: 'AI Sandbox (flyto-ai)', nameKey: 'legal.trust.service.aiSandbox', status: 'beta' as const },
						{ name: 'MCP Guardian', nameKey: 'legal.trust.service.mcpGuardian', status: 'beta' as const },
						{ name: 'Cloud CSPM', nameKey: 'legal.trust.service.cloudCspm', status: 'planned' as const },
					].map(({ name, nameKey, status }) => (
						<Box
							key={name}
							sx={{
								display: 'flex',
								alignItems: 'center',
								justifyContent: 'space-between',
								py: 1.5,
								borderBottom: '1px solid',
								borderColor: 'divider',
							}}
						>
							<Typography variant="body1">{tOr(nameKey, name)}</Typography>
							<StatusBadge status={status} />
						</Box>
					))}
				</Section>

				<Divider sx={{ mb: 5 }} />

				{/* Data Practices */}
				<Section icon={Globe} title={t('legal.trust.dataPractices.title')}>
					<Box sx={{ display: 'grid', gap: 3, gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' } }}>
						{[
							{
								title: 'Data Location', titleKey: 'legal.trust.dataPractices.location.title',
								body: 'Customer data is stored on Google Cloud Platform in the asia-east1 (Taiwan) region by default. Data does not leave this region without explicit customer consent.', bodyKey: 'legal.trust.dataPractices.location.body',
							},
							{
								title: 'Data Isolation', titleKey: 'legal.trust.dataPractices.isolation.title',
								body: 'Each organization\'s data is isolated at the database level using org_id scoping. Row-level security is enforced on every query.', bodyKey: 'legal.trust.dataPractices.isolation.body',
							},
							{
								title: 'Evidence Retention', titleKey: 'legal.trust.dataPractices.retention.title',
								body: 'Execution traces and scan evidence are retained for 90 days by default. Customers can configure shorter retention or request immediate deletion.', bodyKey: 'legal.trust.dataPractices.retention.body',
							},
							{
								title: 'Credential Handling', titleKey: 'legal.trust.dataPractices.credentials.title',
								body: 'We never store plaintext credentials. API keys are hashed (SHA-256) before persistence. Execution traces are redacted of tokens, cookies, and PEM keys before storage.', bodyKey: 'legal.trust.dataPractices.credentials.body',
							},
							{
								title: 'Secret Scanning', titleKey: 'legal.trust.dataPractices.secretScanning.title',
								body: 'Flyto-indexer scans for accidentally committed secrets. The engine\'s redaction layer prevents any secret detected in execution output from reaching disk.', bodyKey: 'legal.trust.dataPractices.secretScanning.body',
							},
							{
								title: 'Third-Party Sharing', titleKey: 'legal.trust.dataPractices.thirdParty.title',
								body: 'We do not sell customer data. We share data with sub-processors only to the extent necessary to provide the service (Cloud Run, Cloud SQL, Firebase Auth).', bodyKey: 'legal.trust.dataPractices.thirdParty.body',
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

				{/* Security Controls */}
				<Section icon={CheckCircle} title={t('legal.trust.securityControls.title')}>
					{[
						{ label: 'Encryption in transit (TLS 1.2+)', labelKey: 'legal.trust.control.encryptionTransit', done: true },
						{ label: 'Encryption at rest (AES-256)', labelKey: 'legal.trust.control.encryptionRest', done: true },
						{ label: 'Firebase Auth with ID-token verification on every request', labelKey: 'legal.trust.control.firebaseAuth', done: true },
						{ label: 'Role-based access control (owner / admin / member / guest)', labelKey: 'legal.trust.control.rbac', done: true },
						{ label: 'Hash-chained, verifiable audit log', labelKey: 'legal.trust.control.auditLog', done: true },
						{ label: 'Secret redaction on all evidence before persistence', labelKey: 'legal.trust.control.secretRedaction', done: true },
						{ label: 'CodeQL static analysis on all pull requests', labelKey: 'legal.trust.control.codeql', done: true },
						{ label: 'Gitleaks secret scanning on full commit history', labelKey: 'legal.trust.control.gitleaks', done: true },
						{ label: 'Grype CVE scanning on every release (SBOM-backed)', labelKey: 'legal.trust.control.grype', done: true },
						{ label: 'Trivy container image scanning (HIGH/CRITICAL, SARIF to GitHub)', labelKey: 'legal.trust.control.trivy', done: true },
						{ label: 'SLSA provenance attestation on all PyPI releases', labelKey: 'legal.trust.control.slsa', done: true },
						{ label: 'Dependency SHA pinning in all CI workflows', labelKey: 'legal.trust.control.shaPinning', done: true },
						{ label: 'SOC 2 Type II audit', labelKey: 'legal.trust.control.soc2', done: false },
						{ label: 'ISO 27001 certification', labelKey: 'legal.trust.control.iso27001', done: false },
						{ label: 'Penetration test by third party (annual)', labelKey: 'legal.trust.control.pentest', done: false },
					].map(({ label, labelKey, done }) => (
						<Box
							key={label as string}
							sx={{
								display: 'flex',
								alignItems: 'center',
								gap: 1.5,
								py: 1.25,
								borderBottom: '1px solid',
								borderColor: 'divider',
							}}
						>
							<CheckCircle
								size={16}
								style={{ color: done ? '#22c55e' : '#6b7280', flexShrink: 0 }}
							/>
							<Typography
								variant="body2"
								sx={{ color: done ? 'text.primary' : 'text.secondary' }}
							>
								{tOr(labelKey, label)}
								{!done && (
									<Typography component="span" variant="body2" color="text.disabled" sx={{ ml: 1 }}>
										{t('legal.trust.status.plannedParen')}
									</Typography>
								)}
							</Typography>
						</Box>
					))}
				</Section>

				<Divider sx={{ mb: 5 }} />

				{/* Documents */}
				<Section icon={FileText} title={t('legal.trust.policyDocuments.title')}>
					<Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' } }}>
						{[
							{ title: 'Privacy Policy', titleKey: 'legal.trust.document.privacy', href: '/privacy', available: true },
							{ title: 'Terms of Service', titleKey: 'legal.trust.document.terms', href: '/terms', available: true },
							{ title: 'Beta Program Disclaimer', titleKey: 'legal.trust.document.beta', href: '/beta', available: true },
							{ title: 'Security Policy (SECURITY.md)', titleKey: 'legal.trust.document.security', href: 'https://github.com/flytohub/.github/blob/main/SECURITY.md', available: true, external: true },
							{ title: 'Acceptable Use Policy', titleKey: 'legal.trust.document.acceptableUse', href: '/acceptable-use', available: false },
							{ title: 'Data Processing Agreement', titleKey: 'legal.trust.document.dpa', href: '/dpa', available: false },
						].map(({ title, titleKey, href, available, external }) => (
							<Box
								key={title}
								component={available ? 'a' : 'div'}
								href={available ? href : undefined}
								target={external ? '_blank' : undefined}
								rel={external ? 'noopener noreferrer' : undefined}
								sx={{
									p: 2,
									borderRadius: 2,
									bgcolor: 'action.hover',
									border: '1px solid',
									borderColor: 'divider',
									display: 'flex',
									alignItems: 'center',
									justifyContent: 'space-between',
									textDecoration: 'none',
									color: 'inherit',
									cursor: available ? 'pointer' : 'default',
									'&:hover': available ? { borderColor: 'primary.main' } : {},
								}}
							>
								<Typography variant="body2" fontWeight={500}>
									{tOr(titleKey, title)}
								</Typography>
								{available ? (
									<Chip label={t('legal.trust.document.available')} size="small" sx={{ fontSize: 12, color: '#22c55e', borderColor: '#22c55e', border: '1px solid' }} />
								) : (
									<Chip label={t('legal.trust.document.comingSoon')} size="small" sx={{ fontSize: 12, color: 'text.disabled' }} />
								)}
							</Box>
						))}
					</Box>
				</Section>

				{/* Contact */}
				<Box
					sx={{
						p: 3,
						borderRadius: 2,
						bgcolor: 'action.hover',
						border: '1px solid',
						borderColor: 'divider',
						textAlign: 'center',
						mb: 4,
					}}
				>
					<Typography variant="body1" fontWeight={600} gutterBottom>
						{t('legal.trust.contact.title')}
					</Typography>
					<Typography variant="body2" color="text.secondary" gutterBottom>
						{t('legal.trust.contact.desc')}
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

				{/* Footer */}
				<Box sx={{ pt: 4, borderTop: '1px solid', borderColor: 'divider', textAlign: 'center' }}>
					<Typography variant="body2" color="text.secondary">
						{t('legal.footer.brandYear', { year: new Date().getFullYear() })}{' '}
						<Typography
							component="a"
							href="/security"
							variant="body2"
							sx={{ color: 'primary.main', textDecoration: 'none', '&:hover': { textDecoration: 'underline' } }}
						>
							{t('legal.trust.footer.securityPolicy')}
						</Typography>
					</Typography>
				</Box>
			</Box>
		</Box>
	);
}

export default TrustPageView;
