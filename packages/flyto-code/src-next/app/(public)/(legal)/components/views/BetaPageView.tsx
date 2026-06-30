import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Divider from '@mui/material/Divider';
import Chip from '@mui/material/Chip';
import { Clock, AlertTriangle } from 'lucide-react';
import { t, tOr } from '@lib/i18n';

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

function BetaPageView() {
	return (
		<Box sx={{ minHeight: '100vh', bgcolor: 'background.default', color: 'text.primary', py: 8, px: 2 }}>
			<Box sx={{ maxWidth: 760, mx: 'auto' }}>
				<Typography variant="h3" fontWeight={700} gutterBottom>
					{t('legal.beta.title')}
				</Typography>
				<Box sx={{ mb: 4 }}>
					<Chip
						label={t('legal.effectiveDate', { date: EFFECTIVE_DATE })}
						size="small"
						icon={<Clock size={12} />}
						sx={{ fontSize: 12, color: 'text.secondary', mr: 1 }}
					/>
				</Box>

				<Box
					sx={{
						p: 3,
						mb: 4,
						borderRadius: 2,
						bgcolor: 'warning.dark',
						border: '1px solid',
						borderColor: 'warning.main',
						display: 'flex',
						gap: 2,
						alignItems: 'flex-start',
						opacity: 0.9,
					}}
				>
					<AlertTriangle size={20} style={{ flexShrink: 0, marginTop: 2, color: '#fbbf24' }} />
					<Typography variant="body2" sx={{ color: '#fef3c7' }}>
						{t('legal.beta.warning')}
					</Typography>
				</Box>

				<H2>{t('legal.beta.meaning.title')}</H2>
				<P>
					{t('legal.beta.meaning.intro')}
				</P>
				<Box component="ul" sx={{ pl: 3, mb: 2, '& li': { mb: 1 } }}>
					{[
						{ label: 'Produce false positives or miss real vulnerabilities — all scanner output should be reviewed by a qualified security professional before action is taken', labelKey: 'legal.beta.meaning.falsePositives' },
						{ label: 'Change significantly between releases without backward compatibility', labelKey: 'legal.beta.meaning.breakingChanges' },
						{ label: 'Be subject to rate limits, downtime, or data loss during major upgrades', labelKey: 'legal.beta.meaning.limits' },
						{ label: 'Be discontinued at any time', labelKey: 'legal.beta.meaning.discontinued' },
					].map(({ label, labelKey }) => (
						<li key={labelKey}>
							<Typography variant="body1" color="text.secondary">
								{tOr(labelKey, label)}
							</Typography>
						</li>
					))}
				</Box>

				<H2>{t('legal.beta.currentFeatures.title')}</H2>
				<Box component="ul" sx={{ pl: 3, mb: 2, '& li': { mb: 1 } }}>
					{[
						{ label: 'AI Sandbox (flyto-ai) — AI-generated code execution and self-repair workflows', labelKey: 'legal.beta.feature.aiSandbox' },
						{ label: 'MCP Guardian — Model Context Protocol agent firewall and policy engine', labelKey: 'legal.beta.feature.mcpGuardian' },
						{ label: 'AutoFix Tier 2 — AI-proposed code patches (always generates a PR for review; never auto-merges)', labelKey: 'legal.beta.feature.autofix' },
						{ label: 'Cloud CSPM — Cloud security posture management (limited availability)', labelKey: 'legal.beta.feature.cloudCspm' },
						{ label: 'AI Fix Plan — LLM-generated remediation roadmaps', labelKey: 'legal.beta.feature.aiFixPlan' },
					].map(({ label, labelKey }) => (
						<li key={labelKey}>
							<Typography variant="body1" color="text.secondary">
								{tOr(labelKey, label)}
							</Typography>
						</li>
					))}
				</Box>

				<H2>{t('legal.beta.stableFeatures.title')}</H2>
				<P>
					{t('legal.beta.stableFeatures.intro')}
				</P>
				<Box component="ul" sx={{ pl: 3, mb: 2, '& li': { mb: 1 } }}>
					{[
						{ label: 'SCA/CVE scanning (OSV + Shodan)', labelKey: 'legal.beta.stable.sca' },
						{ label: 'SAST (taint flow analysis)', labelKey: 'legal.beta.stable.sast' },
						{ label: 'Secret detection (Gitleaks + flyto-indexer)', labelKey: 'legal.beta.stable.secrets' },
						{ label: 'External attack surface scanning and scoring', labelKey: 'legal.beta.stable.attackSurface' },
						{ label: 'Pentest project management and discovery', labelKey: 'legal.beta.stable.pentest' },
						{ label: 'Code health scoring and trends', labelKey: 'legal.beta.stable.codeHealth' },
						{ label: 'Audit log (hash-chained)', labelKey: 'legal.beta.stable.auditLog' },
						{ label: 'Role-based access control', labelKey: 'legal.beta.stable.rbac' },
					].map(({ label, labelKey }) => (
						<li key={labelKey}>
							<Typography variant="body1" color="text.secondary">
								{tOr(labelKey, label)}
							</Typography>
						</li>
					))}
				</Box>

				<H2>{t('legal.beta.sla.title')}</H2>
				<P>
					{t('legal.beta.sla.body')}
				</P>

				<H2>{t('legal.beta.feedback.title')}</H2>
				<P>
					{t('legal.beta.feedback.prefix')}{' '}
					<Typography
						component="a"
						href="mailto:security@flyto2.com"
						variant="body1"
						sx={{ color: 'primary.main', textDecoration: 'none' }}
					>
						security@flyto2.com
					</Typography>{' '}
					{t('legal.beta.feedback.orVia')}{' '}
					<Typography
						component="a"
						href="https://github.com/flytohub/.github/issues"
						target="_blank"
						rel="noopener noreferrer"
						variant="body1"
						sx={{ color: 'primary.main', textDecoration: 'none' }}
					>
						{t('legal.beta.feedback.githubIssues')}
					</Typography>
					{t('legal.beta.feedback.suffix')}
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
							href="/terms"
							variant="body2"
							sx={{ color: 'primary.main', textDecoration: 'none' }}
						>
							{t('legal.trust.document.terms')}
						</Typography>
					</Typography>
				</Box>
			</Box>
		</Box>
	);
}

export default BetaPageView;
