import { useParams, useNavigate } from 'react-router';
import Box from '@mui/material/Box';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import Divider from '@mui/material/Divider';
import { Code2, Shield, Globe, ArrowRight, Check, Plus } from 'lucide-react';
import { t } from '@lib/i18n';

function getCapabilities() {
  return {
    'code-audit': {
      icon: Code2,
      color: '#8b5cf6',
      badge: 'SAST',
      title: t('capability.codeAudit.title') || 'Code Audit',
      subtitle: t('capability.codeAudit.subtitle') || 'Static Application Security Testing',
      description: t('capability.codeAudit.description') || 'Connect your repositories and get a comprehensive analysis of your codebase. We scan for security vulnerabilities, dead code, complexity hotspots, dependency risks, and license compliance issues.',
      features: [
        t('capability.codeAudit.feat1') || 'CVE & secret detection across all dependencies',
        t('capability.codeAudit.feat2') || 'Dead code identification with confidence scoring',
        t('capability.codeAudit.feat3') || 'Complexity hotspots & change-risk analysis',
        t('capability.codeAudit.feat4') || 'Dependency drift & license compliance',
        t('capability.codeAudit.feat5') || 'Architecture mapping & API discovery',
        t('capability.codeAudit.feat6') || 'AI-powered fix suggestions (AutoFix)',
      ],
    },
    'pentest': {
      icon: Shield,
      color: '#ef4444',
      badge: 'DAST',
      title: t('capability.pentest.title') || 'Penetration Test',
      subtitle: t('capability.pentest.subtitle') || 'Dynamic Application Security Testing',
      description: t('capability.pentest.description') || 'Test live websites and APIs without source code access. Our AI-driven pentest engine runs OWASP Top 10 checks, business logic tests, and generates evidence-backed reports with reproduction steps.',
      features: [
        t('capability.pentest.feat1') || 'OWASP Top 10 automated checks',
        t('capability.pentest.feat2') || 'SQL injection, XSS, SSRF detection',
        t('capability.pentest.feat3') || 'Authentication & session testing',
        t('capability.pentest.feat4') || 'Business logic vulnerability scanning',
        t('capability.pentest.feat5') || 'AI-generated attack playbooks',
        t('capability.pentest.feat6') || 'Evidence screenshots & reproduction steps',
      ],
    },
    'attack-surface': {
      icon: Globe,
      color: '#06b6d4',
      badge: 'ASM',
      title: t('capability.attackSurface.title') || 'Attack Surface',
      subtitle: t('capability.attackSurface.subtitle') || 'Attack Surface Management',
      description: t('capability.attackSurface.description') || "Discover your organization's external attack surface. We scan domains, subdomains, exposed services, SSL configurations, DNS records, and technology stacks to identify potential entry points.",
      features: [
        t('capability.attackSurface.feat1') || 'Subdomain enumeration & DNS analysis',
        t('capability.attackSurface.feat2') || 'SSL/TLS configuration audit',
        t('capability.attackSurface.feat3') || 'Exposed service & port detection',
        t('capability.attackSurface.feat4') || 'Technology stack fingerprinting',
        t('capability.attackSurface.feat5') || 'WHOIS & IP intelligence',
        t('capability.attackSurface.feat6') || 'PageSpeed & web vitals monitoring',
      ],
    },
  };
}

export default function CapabilityPage() {
  const { capId } = useParams<{ capId: string }>();
  const navigate = useNavigate();
  const caps = getCapabilities();
  const cap = caps[capId as keyof typeof caps];

  if (!cap) {
    return (
      <Box sx={{ p: 6, textAlign: 'center' }}>
        <Typography color="text.secondary">{t('common.notFound')}</Typography>
      </Box>
    );
  }

  const Icon = cap.icon;

  return (
    <Box sx={{ maxWidth: 800, mx: 'auto', px: { xs: 2, sm: 4 }, py: 5 }}>
      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 4 }}>
        <Box sx={{
          width: 56, height: 56, borderRadius: 3,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          bgcolor: `${cap.color}15`,
        }}>
          <Icon size={28} style={{ color: cap.color }} />
        </Box>
        <Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
            <Typography variant="h4" fontWeight={800}>{cap.title}</Typography>
            <Chip label={cap.badge} size="small" sx={{ bgcolor: cap.color, color: '#fff', fontWeight: 700 }} />
          </Box>
          <Typography variant="body1" color="text.secondary">{cap.subtitle}</Typography>
        </Box>
      </Box>

      {/* Description */}
      <Paper elevation={1} className="rounded-2xl" sx={{ p: 4, mb: 4 }}>
        <Typography variant="body1" sx={{ lineHeight: 1.8 }}>
          {cap.description}
        </Typography>
      </Paper>

      {/* Features */}
      <Typography variant="overline" color="text.secondary" sx={{ mb: 2, display: 'block', fontWeight: 600 }}>
        {t('capability.features')}
      </Typography>
      <Paper elevation={1} className="rounded-2xl" sx={{ p: 3, mb: 4 }}>
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 2 }}>
          {cap.features.map((f, i) => (
            <Box key={i} sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.5 }}>
              <Check size={16} style={{ color: cap.color, marginTop: 3, flexShrink: 0 }} />
              <Typography variant="body2">{f}</Typography>
            </Box>
          ))}
        </Box>
      </Paper>

      {/* CTA */}
      <Divider sx={{ my: 4 }} />
      <Box sx={{ textAlign: 'center' }}>
        <Typography variant="h6" fontWeight={600} sx={{ mb: 1 }}>
          {t('capability.ready')}
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
          {t('capability.createPrompt')}
        </Typography>
        <Button
          variant="contained"
          size="large"
          startIcon={<Plus size={18} />}
          onClick={() => navigate('/projects')}
          endIcon={<ArrowRight size={16} />}
          sx={{
            textTransform: 'none', fontWeight: 600, borderRadius: 3, px: 4,
            background: `linear-gradient(135deg, ${cap.color}, ${cap.color}cc)`, boxShadow: 'none',
          }}
        >
          {t('capability.createProject')}
        </Button>
      </Box>
    </Box>
  );
}
