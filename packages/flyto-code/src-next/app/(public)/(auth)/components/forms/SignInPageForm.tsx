'use client';
import { Controller, useForm } from 'react-hook-form';
import Button from '@mui/material/Button';
import Checkbox from '@mui/material/Checkbox';
import FormControl from '@mui/material/FormControl';
import FormControlLabel from '@mui/material/FormControlLabel';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import Link from '@components/adapters/Link';
import _ from 'lodash';
import FuseSvgIcon from '@components/adapters/Icon';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import FormLabel from '@mui/material/FormLabel';
import { t } from '@lib/i18n';

/**
 * Form Validation Schema
 */
function createSchema() {
	return z.object({
		email: z.string().email(t('auth.validation.emailInvalid')).nonempty(t('auth.validation.emailRequired')),
		password: z
			.string()
			.min(8, t('auth.validation.passwordTooShort8'))
			.nonempty(t('auth.validation.passwordRequired')),
		remember: z.boolean().optional()
	});
}

type FormType = z.infer<ReturnType<typeof createSchema>>;

const defaultValues = {
	email: '',
	password: '',
	remember: true
};

function SignInPageForm() {
	const schema = createSchema();

	const { control, formState, handleSubmit, reset } = useForm<FormType>({
		mode: 'onChange',
		defaultValues,
		resolver: zodResolver(schema)
	});

	const { isValid, dirtyFields, errors } = formState;

	function onSubmit() {
		reset(defaultValues);
	}

	return (
		<form
			name="loginForm"
			noValidate
			className="flex w-full flex-col justify-center gap-4"
			onSubmit={handleSubmit(onSubmit)}
		>
			<Controller
				name="email"
				control={control}
				render={({ field }) => (
					<FormControl>
						<FormLabel htmlFor="email">{t('auth.emailAddress')}</FormLabel>
						<TextField
							{...field}
							autoFocus
							type="email"
							error={!!errors.email}
							helperText={errors?.email?.message}
							required
							fullWidth
						/>
					</FormControl>
				)}
			/>

			<Controller
				name="password"
				control={control}
				render={({ field }) => (
					<FormControl>
						<FormLabel htmlFor="password">{t('auth.password')}</FormLabel>
						<TextField
							{...field}
							type="password"
							error={!!errors.password}
							helperText={errors?.password?.message}
							required
							fullWidth
						/>
					</FormControl>
				)}
			/>

			<div className="flex flex-col items-center justify-center sm:flex-row sm:justify-between">
				<Controller
					name="remember"
					control={control}
					render={({ field }) => (
						<FormControl>
							<FormControlLabel
								label={t('auth.rememberMe')}
								control={
									<Checkbox
										size="small"
										{...field}
									/>
								}
							/>
						</FormControl>
					)}
				/>

				<Link
					className="text-md font-medium"
					to="/pages/auth/forgot-password"
				>
					{t('auth.forgotPassword')}
				</Link>
			</div>

			<Button
				variant="contained"
				color="secondary"
				className="w-full"
				aria-label={t('auth.signIn')}
				disabled={_.isEmpty(dirtyFields) || !isValid}
				type="submit"
				size="medium"
			>
				Sign in
			</Button>

			<div className="flex items-center py-4">
				<div className="mt-px flex-auto border-t" />
				<Typography
					className="mx-2"
					color="text.secondary"
				>
					{t('auth.orContinueWith')}
				</Typography>
				<div className="mt-px flex-auto border-t" />
			</div>

			<div className="flex items-center gap-4">
				<Button
					variant="outlined"
					className="flex-auto"
				>
					<FuseSvgIcon
						size={20}
						color="action"
					>
						feather:facebook
					</FuseSvgIcon>
				</Button>
				<Button
					variant="outlined"
					className="flex-auto"
				>
					<FuseSvgIcon
						size={20}
						color="action"
					>
						feather:twitter
					</FuseSvgIcon>
				</Button>
				<Button
					variant="outlined"
					className="flex-auto"
				>
					<FuseSvgIcon
						size={20}
						color="action"
					>
						feather:github
					</FuseSvgIcon>
				</Button>
			</div>
		</form>
	);
}

export default SignInPageForm;
