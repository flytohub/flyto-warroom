import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
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
import { tOr } from '@lib/i18n';

function createSchema() {
	return z.object({
		displayName: z.string().trim().min(2, tOr('auth.localBootstrap.nameLength', 'Enter at least 2 characters')).max(80),
		email: z.string().trim().email(tOr('auth.localBootstrap.emailInvalid', 'Enter a valid email address')),
		password: z.string()
			.min(12, tOr('auth.localBootstrap.passwordLength', 'Use at least 12 characters'))
			.max(256)
			.regex(/[a-z]/, tOr('auth.localBootstrap.passwordLower', 'Add a lowercase letter'))
			.regex(/[A-Z]/, tOr('auth.localBootstrap.passwordUpper', 'Add an uppercase letter'))
			.regex(/[0-9]/, tOr('auth.localBootstrap.passwordNumber', 'Add a number'))
			.regex(/[^A-Za-z0-9]/, tOr('auth.localBootstrap.passwordSymbol', 'Add a symbol')),
		passwordConfirm: z.string(),
	}).refine((data) => data.password === data.passwordConfirm, {
		message: tOr('auth.localBootstrap.passwordMatch', 'Passwords must match'),
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
		return <Box className="flex min-h-40 items-center justify-center"><CircularProgress aria-label="Checking setup status" /></Box>;
	}
	if (status === 'error') {
		return (
			<Alert severity="error" action={<Button color="inherit" size="small" onClick={() => window.location.reload()}>Retry</Button>}>
				{tOr('auth.localBootstrap.statusUnavailable', 'Setup status is unavailable. Check that the Engine is healthy, then retry.')}
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
			setSubmitError(error instanceof Error ? error.message : tOr('auth.localBootstrap.createFailed', 'Administrator account could not be created'));
		}
	}

	return (
		<div className="w-full">
			<Alert icon={<SecurityOutlinedIcon fontSize="inherit" />} severity="info" className="mb-6">
				<Typography variant="body2" fontWeight={700}>
					{tOr('auth.localBootstrap.firstAdmin', 'Create the first administrator')}
				</Typography>
				<Typography variant="body2">
					{tOr('auth.localBootstrap.oneTime', 'This one-time setup closes permanently after the account is created.')}
				</Typography>
			</Alert>

			{submitError && <Alert severity="error" className="mb-4">{submitError}</Alert>}

			<form name="localAdminBootstrapForm" noValidate className="flex w-full flex-col" onSubmit={handleSubmit(onSubmit)}>
				<Controller name="displayName" control={control} render={({ field }) => (
					<TextField {...field} className="mb-5" label={tOr('auth.localBootstrap.name', 'Administrator name')} autoFocus autoComplete="name" error={!!errors.displayName} helperText={errors.displayName?.message} required fullWidth />
				)} />
				<Controller name="email" control={control} render={({ field }) => (
					<TextField {...field} className="mb-5" label={tOr('auth.localBootstrap.email', 'Administrator email')} type="email" autoComplete="email" error={!!errors.email} helperText={errors.email?.message} required fullWidth />
				)} />
				<Controller name="password" control={control} render={({ field }) => (
					<TextField {...field} className="mb-5" label={tOr('auth.localBootstrap.password', 'Password')} type="password" autoComplete="new-password" error={!!errors.password} helperText={errors.password?.message ?? tOr('auth.localBootstrap.passwordHelp', '12+ characters with uppercase, lowercase, number, and symbol')} required fullWidth />
				)} />
				<Controller name="passwordConfirm" control={control} render={({ field }) => (
					<TextField {...field} className="mb-6" label={tOr('auth.localBootstrap.passwordConfirm', 'Confirm password')} type="password" autoComplete="new-password" error={!!errors.passwordConfirm} helperText={errors.passwordConfirm?.message} required fullWidth />
				)} />
				<Button variant="contained" type="submit" size="large" disabled={!isValid || isSubmitting} startIcon={isSubmitting ? <CircularProgress size={18} color="inherit" /> : <SecurityOutlinedIcon />}>
					{isSubmitting ? tOr('auth.localBootstrap.creating', 'Creating administrator…') : tOr('auth.localBootstrap.create', 'Create administrator')}
				</Button>
			</form>
		</div>
	);
}

export default LocalAdminBootstrapForm;
