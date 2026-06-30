import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import TextField from '@mui/material/TextField';
import Button from '@mui/material/Button';
import Link from '@components/adapters/Link';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { useSnackbar } from 'notistack';
import { useAuth } from '@hooks/useAuth';
import { t } from '@lib/i18n';
import AuthPagesMessageSection from '../ui/AuthPagesMessageSection';
import { Navigate } from 'react-router';
import { env } from '@lib/env';

function createSchema() {
	return z.object({
		email: z.string().email(t('auth.validation.emailInvalid')).nonempty(t('auth.validation.emailRequired')),
	});
}

type FormType = z.infer<ReturnType<typeof createSchema>>;

function ForgotPasswordPageView() {
	const localAuth = env.authMode === 'local' || env.authMode === 'local_jwt' || env.authMode === 'community';
	const { resetPassword } = useAuth();
	const { enqueueSnackbar } = useSnackbar();
	const [sent, setSent] = useState(false);
	const schema = createSchema();
	const { control, formState, handleSubmit } = useForm<FormType>({
		mode: 'onChange',
		defaultValues: { email: '' },
		resolver: zodResolver(schema),
	});
	const { isValid, errors } = formState;

	if (localAuth) return <Navigate to="/sign-in" replace />;

	async function onSubmit(formData: FormType) {
		try {
			await resetPassword(formData.email);
			// We don't differentiate "email exists" vs "email doesn't exist" —
			// telling apart is a free username-enumeration oracle. Always
			// show the same confirmation, whether or not Firebase actually
			// queued an email.
			setSent(true);
		} catch (err) {
			const msg = err instanceof Error ? err.message : String(err);
			enqueueSnackbar(msg, { variant: 'error' });
		}
	}

	return (
		<div className="flex min-w-0 flex-auto flex-col items-center sm:flex-row sm:justify-center md:items-start md:justify-start">
			<Paper className="h-full w-full px-4 py-2 sm:h-auto sm:w-auto sm:rounded-xl sm:p-12 sm:shadow-sm md:flex md:h-full md:w-1/2 md:items-center md:justify-end md:rounded-none md:p-16 md:shadow-none ltr:border-r-1 rtl:border-l-1">
				<div className="mx-auto flex w-full max-w-80 flex-col gap-6 sm:mx-0 sm:w-80">
					<div className="flex items-center gap-3">
						<img className="w-10" src="/favicon.svg" alt="Flyto2 Warroom" />
						<Typography className="text-3xl leading-tight font-extrabold tracking-tight">
							{t('auth.resetPassword')}
						</Typography>
					</div>
					<Typography color="text.secondary" className="text-sm">
						{t('auth.resetPasswordHint')}
					</Typography>

					{sent ? (
						<div className="rounded-lg border border-green-200 bg-green-50 p-4 dark:border-green-800 dark:bg-green-950">
							<Typography className="text-sm">{t('auth.resetEmailSent')}</Typography>
						</div>
					) : (
						<form noValidate className="flex flex-col gap-4" onSubmit={handleSubmit(onSubmit)}>
							<Controller
								name="email"
								control={control}
								render={({ field }) => (
									<TextField
										{...field}
										autoFocus
										required
										fullWidth
										variant="outlined"
										label={t('auth.email')}
										type="email"
										error={!!errors.email}
										helperText={errors?.email?.message}
									/>
								)}
							/>
							<Button
								variant="contained"
								color="primary"
								size="large"
								type="submit"
								disabled={!isValid}
							>
								{t('auth.sendResetLink')}
							</Button>
						</form>
					)}

					<div className="text-md text-center">
						<Link to="/sign-in">{t('auth.backToSignIn')}</Link>
					</div>
				</div>
			</Paper>
			<AuthPagesMessageSection />
		</div>
	);
}

export default ForgotPasswordPageView;
