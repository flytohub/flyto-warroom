import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import SecurityOutlinedIcon from '@mui/icons-material/SecurityOutlined';
import { zodResolver } from '@hookform/resolvers/zod';
import { Controller, useForm } from 'react-hook-form';
import { Navigate } from 'react-router';
import { z } from 'zod';
import { useEffect, useState } from 'react';
import { useAuth } from '@hooks/useAuth';
import { getLocalBootstrapStatus, LocalAuthRequestError } from '@lib/engine/auth';
import { t } from '@lib/i18n';

function createSchema() {
	return z.object({
		displayName: z.string().trim().min(2, t('auth.localBootstrap.nameLength')).max(80),
		email: z.string().trim().email(t('auth.localBootstrap.emailInvalid')),
		password: z.string()
			.min(12, t('auth.localBootstrap.passwordLength'))
			.max(256)
			.regex(/[a-z]/, t('auth.localBootstrap.passwordLower'))
			.regex(/[A-Z]/, t('auth.localBootstrap.passwordUpper'))
			.regex(/[0-9]/, t('auth.localBootstrap.passwordNumber'))
			.regex(/[^A-Za-z0-9]/, t('auth.localBootstrap.passwordSymbol')),
		passwordConfirm: z.string(),
	}).refine((data) => data.password === data.passwordConfirm, {
		message: t('auth.localBootstrap.passwordMatch'),
		path: ['passwordConfirm'],
	});
}

type FormValues = z.infer<ReturnType<typeof createSchema>>;

const defaultValues: FormValues = {
	displayName: '',
	email: '',
	password: '',
	passwordConfirm: '',
};

function LocalAdminBootstrapForm() {
	const { bootstrapLocalAdmin } = useAuth();
	const [status, setStatus] = useState<'checking' | 'open' | 'closed' | 'error'>('checking');
	const [submitError, setSubmitError] = useState('');
	const schema = createSchema();
	const { control, formState, handleSubmit } = useForm<FormValues>({
		mode: 'onChange',
		defaultValues,
		resolver: zodResolver(schema),
	});
	const { errors, isSubmitting, isValid } = formState;

	useEffect(() => {
		let cancelled = false;
		getLocalBootstrapStatus()
			.then((result) => {
				if (!cancelled) setStatus(result.required && result.registrationOpen ? 'open' : 'closed');
			})
			.catch(() => {
				if (!cancelled) setStatus('error');
			});
		return () => { cancelled = true; };
	}, []);

	if (status === 'closed') return <Navigate to="/sign-in" replace />;
	if (status === 'checking') {
		return <Box display="flex" minHeight={160} alignItems="center" justifyContent="center"><CircularProgress aria-label={t('common.loading')} /></Box>;
	}
	if (status === 'error') {
		return (
			<Alert severity="error" action={<Button color="inherit" size="small" onClick={() => window.location.reload()}>{t('common.retry')}</Button>}>
				{t('auth.localBootstrap.statusUnavailable')}
			</Alert>
		);
	}

	async function onSubmit(values: FormValues) {
		setSubmitError('');
		try {
			await bootstrapLocalAdmin(values.email.trim(), values.password, values.displayName.trim());
		} catch (error) {
			if (error instanceof LocalAuthRequestError && error.status === 409) {
				setStatus('closed');
				return;
			}
			setSubmitError(error instanceof Error ? error.message : t('auth.localBootstrap.createFailed'));
		}
	}

	return (
		<Stack width="100%" spacing={3}>
			<Alert icon={<SecurityOutlinedIcon fontSize="inherit" />} severity="info">
				<Typography variant="body2" fontWeight={700}>
					{t('auth.localBootstrap.firstAdmin')}
				</Typography>
				<Typography variant="body2">
					{t('auth.localBootstrap.oneTime')}
				</Typography>
			</Alert>

			{submitError && <Alert severity="error">{submitError}</Alert>}

			<Stack component="form" name="localAdminBootstrapForm" noValidate spacing={2.5} onSubmit={handleSubmit(onSubmit)}>
				<Controller name="displayName" control={control} render={({ field }) => (
					<TextField {...field} label={t('auth.localBootstrap.name')} autoFocus autoComplete="name" error={!!errors.displayName} helperText={errors.displayName?.message} required fullWidth />
				)} />
				<Controller name="email" control={control} render={({ field }) => (
					<TextField {...field} label={t('auth.localBootstrap.email')} type="email" autoComplete="email" error={!!errors.email} helperText={errors.email?.message} required fullWidth />
				)} />
				<Controller name="password" control={control} render={({ field }) => (
					<TextField {...field} label={t('auth.localBootstrap.password')} type="password" autoComplete="new-password" error={!!errors.password} helperText={errors.password?.message ?? t('auth.localBootstrap.passwordHelp')} required fullWidth />
				)} />
				<Controller name="passwordConfirm" control={control} render={({ field }) => (
					<TextField {...field} label={t('auth.localBootstrap.passwordConfirm')} type="password" autoComplete="new-password" error={!!errors.passwordConfirm} helperText={errors.passwordConfirm?.message} required fullWidth />
				)} />
				<Button variant="contained" type="submit" size="large" disabled={!isValid || isSubmitting} startIcon={isSubmitting ? <CircularProgress size={18} color="inherit" /> : <SecurityOutlinedIcon />}>
					{isSubmitting ? t('auth.localBootstrap.creating') : t('auth.localBootstrap.create')}
				</Button>
			</Stack>
		</Stack>
	);
}

export default LocalAdminBootstrapForm;
